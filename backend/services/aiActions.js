import { dbGet, dbRun, dbAll } from './database.js'
import { getTokenBalance, prepareSendTransaction, checkTokenAllowance } from './wallet.js'
import { getSmartWalletForUser, sendTransactionFromSmartWallet, approveTokenFromSmartWallet } from './thirdwebWallet.js'
import { TOKENS, CONTRACTS } from './config.js'
import { ethers } from 'ethers'
import { checkAndNotifyPayment } from './paymentNotifications.js'
import { getUserFriendlyError } from './errorMessages.js'
import { getUsernameRegistry } from './contracts.js'
import { getPaymentScheduler } from './paymentScheduler.js'

/**
 * AI Action Executors
 * Execute actual SendCash tasks based on AI agent decisions
 */

/**
 * Execute payment from AI agent
 * @param {string} userId - Telegram user ID
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount as string (e.g., "10")
 * @param {string} tokenSymbol - Token symbol (USDC, USDT, etc.)
 * @param {Object} bot - Telegram bot instance
 * @param {string} memo - Optional memo
 * @param {number} targetChainId - Optional target chain ID (defaults to Base)
 * @returns {Promise<Object>} Execution result
 */
export const executePayment = async (userId, recipientUsername, amount, tokenSymbol, bot, memo = null, targetChainId = null) => {
  console.log(`[AI Actions] executePayment called:`, { userId, recipientUsername, amount, tokenSymbol, memo })
  
  try {
    // Validate inputs
    if (!recipientUsername || !amount) {
      console.error(`[AI Actions] Missing required parameters:`, { recipientUsername, amount })
      const friendlyError = getUserFriendlyError('Missing payment details', 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    // Ensure amount is a valid string/number
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      console.error(`[AI Actions] Invalid amount:`, amount)
      const friendlyError = getUserFriendlyError(`Invalid amount: "${amount}"`, 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    // Get user
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      console.error(`[AI Actions] User not found or no wallet:`, userId)
      const friendlyError = getUserFriendlyError('Wallet not found', 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    console.log(`[AI Actions] User found:`, { username: user.username, wallet: user.wallet_address })

    // If target chain is specified and different from Base, route to multi-chain handler
    if (targetChainId && targetChainId !== 84532) { // 84532 is Base Sepolia
      const { executeMultiChainPayment } = await import('./multiChainPayment.js')
      const { getChainConfig } = await import('./chainDetector.js')
      
      // Find chain key from chainId
      const { CHAINS } = await import('./bridgeService.js')
      const chainKey = Object.keys(CHAINS).find(key => CHAINS[key].chainId === targetChainId)
      
      if (chainKey) {
        return await executeMultiChainPayment(
          userId,
          recipientUsername,
          amount,
          tokenSymbol,
          chainKey,
          bot,
          memo
        )
      }
    }

    // Validate token (for Base chain)
    if (!TOKENS[tokenSymbol] || !TOKENS[tokenSymbol].address) {
      const friendlyError = getUserFriendlyError(
        `Token ${tokenSymbol} not supported. Available: ${Object.keys(TOKENS).join(', ')}`,
        'payment'
      )
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    // Check balance
    const balanceData = await getTokenBalance(user.wallet_address, TOKENS[tokenSymbol].address)
    if (!balanceData || parseFloat(balanceData.formatted) < parseFloat(amount)) {
      const friendlyError = getUserFriendlyError(
        `Insufficient ${tokenSymbol} balance. You have $${balanceData?.formatted || '0'}, need $${amount}.`,
        'payment'
      )
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    // Validate recipient username exists BEFORE preparing transaction
    try {
      const registry = await getUsernameRegistry()
      // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
      // getAddress() has a bug that returns registry address for non-existent usernames
      const recipientAddress = await registry.usernameToAddress(recipientUsername.toLowerCase())
      
      if (!recipientAddress || recipientAddress === ethers.ZeroAddress) {
        console.error(`[AI Actions] Username not found: @${recipientUsername}`)
        const friendlyError = getUserFriendlyError('Username not found', 'payment')
        return {
          success: false,
          message: friendlyError.message || friendlyError
        }
      }
      
      console.log(`[AI Actions] Recipient validated: @${recipientUsername} -> ${recipientAddress}`)
    } catch (validationError) {
      console.error(`[AI Actions] Error validating recipient:`, validationError)
      const friendlyError = getUserFriendlyError(validationError, 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    // Prepare transaction
    const txData = await prepareSendTransaction(
      user.wallet_address,
      recipientUsername.toLowerCase(),
      tokenSymbol,
      amount
    )

    // Get smart wallet
    const { smartWallet, personalAccount, walletAddress } = await getSmartWalletForUser(user.username, userId)

    // Check allowance
    const hasAllowance = await checkTokenAllowance(
      user.wallet_address,
      TOKENS[tokenSymbol].address,
      txData.amountWei
    )

    if (!hasAllowance) {
      // Approve token
      await bot.sendMessage(userId, `⏳ Approving ${tokenSymbol} spending (one-time setup)...`)
      
      const approveTxHash = await approveTokenFromSmartWallet(
        smartWallet,
        TOKENS[tokenSymbol].address,
        CONTRACTS.SEND_CASH,
        ethers.MaxUint256,
        personalAccount,
        user.wallet_address
      )
    }

    // Send payment
    await bot.sendMessage(userId, `⏳ Sending $${amount} ${tokenSymbol} to @${recipientUsername}...`)
    
    console.log(`[AI Actions] ========== SENDING PAYMENT ==========`)
    console.log(`[AI Actions] From: ${user.wallet_address}`)
    console.log(`[AI Actions] To: @${recipientUsername} (${txData.recipient})`)
    console.log(`[AI Actions] Amount: $${amount} ${tokenSymbol}`)
    console.log(`[AI Actions] Amount Wei: ${txData.amountWei}`)
    console.log(`[AI Actions] Contract: ${CONTRACTS.SEND_CASH}`)
    console.log(`[AI Actions] Token: ${TOKENS[tokenSymbol].address}`)
    console.log(`[AI Actions] ====================================`)

    let txHash
    try {
      txHash = await sendTransactionFromSmartWallet(
        smartWallet,
        CONTRACTS.SEND_CASH,
        "sendPayment",
        [
          recipientUsername.toLowerCase(),
          TOKENS[tokenSymbol].address,
          txData.amountWei
        ],
        personalAccount,
        user.wallet_address
      )
      console.log(`[AI Actions] ✅ Transaction sent successfully: ${txHash}`)
    } catch (txError) {
      console.error(`[AI Actions] ❌ Transaction failed:`)
      console.error(`[AI Actions]   Error type: ${txError.constructor.name}`)
      console.error(`[AI Actions]   Error message: ${txError.message}`)
      console.error(`[AI Actions]   Error code: ${txError.code || 'N/A'}`)
      console.error(`[AI Actions]   Stack:`, txError.stack)
      throw txError // Re-throw to be caught by outer catch
    }

    // Store payment (include target chain if specified)
    try {
      let targetChainName = null
      if (targetChainId && targetChainId !== 84532) { // 84532 is Base Sepolia
        const { CHAINS } = await import('./bridgeService.js')
        const chainKey = Object.keys(CHAINS).find(key => CHAINS[key].chainId === targetChainId)
        if (chainKey) {
          const { getChainConfig } = await import('./chainDetector.js')
          const chainConfig = getChainConfig(chainKey)
          targetChainName = chainConfig?.name || null
        }
      }

      await dbRun(
        `INSERT INTO payments 
         (tx_hash, from_address, to_address, from_username, to_username, token_address, amount, fee, status, memo, target_chain, target_chain_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [
          txHash,
          user.wallet_address,
          txData.recipient,
          user.username || '',
          recipientUsername,
          TOKENS[tokenSymbol].address,
          txData.amount,
          txData.fee,
          memo || null,
          targetChainName || null,
          targetChainId || null
        ]
      )
    } catch (dbError) {
      console.error('Error storing payment:', dbError)
    }

    // Notify recipient after delay
    setTimeout(async () => {
      try {
        await checkAndNotifyPayment(bot, txHash)
      } catch (error) {
        console.error('[AI Actions] Error notifying recipient:', error)
      }
    }, 5000)

    const blockExplorerUrl = `https://sepolia-explorer.base.org/tx/${txHash}`

    let message = `✅ Payment sent successfully! 🎉\n\n` +
      `To: @${recipientUsername}\n` +
      `Amount: $${amount} ${tokenSymbol}\n`
    
    if (memo) {
      message += `Note: ${memo}\n`
    }
    
    message += `Fee: 0.5%\n\n` +
      `Transaction: [View on Explorer](${blockExplorerUrl})\n` +
      `Hash: \`${txHash}\`\n\n` +
      `💡 Transaction is gasless thanks to account abstraction!`

    return {
      success: true,
      message,
      data: { txHash, recipientUsername, amount, tokenSymbol, memo }
    }
  } catch (error) {
    console.error('[AI Actions] Error executing payment:', error)
    const friendlyError = getUserFriendlyError(error, 'payment')
    return {
      success: false,
      message: friendlyError.message || friendlyError
    }
  }
}

/**
 * Export user's private key
 * @param {string} userId - Telegram user ID
 * @param {Object} bot - Telegram bot instance
 * @returns {Promise<Object>} Execution result
 */
export const executeExportPrivateKey = async (userId, bot) => {
  try {
    // Get user from database
    const user = await dbGet('SELECT username FROM telegram_users WHERE telegram_id = ?', [userId]);
    
    if (!user || !user.username) {
      return {
        success: true,
        message: "❌ You don't have a registered wallet yet. Please register a username first.",
        shouldDelete: false
      };
    }

    // Import export function
    const { exportPrivateKey } = await import('./thirdwebWallet.js');
    
    // Generate private key
    const privateKey = exportPrivateKey(userId, user.username);
    
    // Security warning message
    const warningMessage = `⚠️ **SECURITY WARNING** ⚠️\n\n` +
      `Your private key is being displayed. Keep it SECRET!\n\n` +
      `🔐 **Your Private Key:**\n` +
      `\`${privateKey}\`\n\n` +
      `⚠️ **IMPORTANT:**\n` +
      `• Never share this key with anyone\n` +
      `• Anyone with this key can control your wallet\n` +
      `• Store it securely (password manager, hardware wallet)\n` +
      `• If compromised, transfer funds immediately\n\n` +
      `💡 This key is deterministic - you can regenerate it anytime with your username.\n\n` +
      `⏰ This message will auto-delete in 5 seconds for security.`;
    
    return {
      success: true,
      message: warningMessage,
      shouldDelete: true, // Flag to indicate this message should be auto-deleted
      deleteAfter: 5000 // Delete after 5 seconds (5000ms)
    };
  } catch (error) {
    console.error('[AI Actions] Error exporting private key:', error);
    return {
      success: false,
      message: "❌ Failed to export private key. Please try again.",
      shouldDelete: false
    };
  }
};

/**
 * Execute username registration
 * @param {string} userId - Telegram user ID
 * @param {string} username - Username to register
 * @param {Object} bot - Telegram bot instance
 * @returns {Promise<Object>} Execution result
 */
export const executeRegisterUsername = async (userId, username, bot) => {
  try {
    // Check if user already registered
    const existingUser = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
    if (existingUser && existingUser.wallet_address) {
      return {
        success: false,
        message: `❌ You already have a wallet!\n\nUsername: @${existingUser.username || 'not set'}\n\nUse /balance to view your wallet address.`
      }
    }

    // Import registration function
    const { createSmartWalletForUsername, registerUsernameInRegistry, isSmartWalletDeployed } = await import('./thirdwebWallet.js')

    // Send progress messages (these are fine - they're status updates)
    await bot.sendMessage(userId, `⏳ Creating your wallet and registering @${username}...`)

    // Create wallet
    const { walletAddress, smartWallet } = await createSmartWalletForUsername(username, userId)

    // Check deployment
    const isDeployed = await isSmartWalletDeployed(walletAddress)
    if (!isDeployed) {
      await bot.sendMessage(userId, '⏳ Deploying wallet on-chain (will be deployed on first use)...')
    }

    // Register username
    await bot.sendMessage(userId, '⏳ Registering username on-chain (free during test phase)...')
    const regResult = await registerUsernameInRegistry(username, walletAddress)
    
    console.log(`[AI Actions] Registration complete for @${username}, wallet: ${walletAddress}`)

    // Store in database (INSERT OR REPLACE to handle both new and existing users)
    await dbRun(
      'INSERT OR REPLACE INTO telegram_users (telegram_id, wallet_address, username) VALUES (?, ?, ?)',
      [userId, walletAddress, username]
    )

    // Build final success message
    const successMessage = `✅ Awesome! Welcome to SendCash, @${username}! 🎉\n\n` +
      `Your smart wallet has been created and is ready to use!\n\n` +
      `💰 You can now:\n` +
      `• Receive payments via @${username}\n` +
      `• Send payments (just chat with me naturally!)\n` +
      `• Check your balance anytime\n\n` +
      `💡 All transactions are gasless thanks to account abstraction!\n\n` +
      `Try asking me: "What's my balance?" or "Send $10 to @alice" 🚀`

    // Return message in result - handler will send it ONCE
    // Note: Progress messages (lines 318, 326, 330) are sent directly as status updates
    // Final success message is returned here and sent by handler to avoid duplicates
    console.log(`[AI Actions] Registration complete - returning success message for handler to send`)
    return {
      success: true,
      message: successMessage,
      data: { walletAddress, username }
      // Note: Don't set skipBotMessage - handler should send this final message
    }
  } catch (error) {
    console.error('[AI Actions] Error registering username:', error)
    const friendlyError = getUserFriendlyError(error, 'registration')
    return {
      success: false,
      message: friendlyError.message || friendlyError
    }
  }
}

/**
 * Schedule a payment for a future date
 * @param {string} userId - Telegram user ID
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount as string (e.g., "10")
 * @param {string} tokenSymbol - Token symbol (USDC, USDT, etc.)
 * @param {Date} scheduledDate - Date when payment should be executed
 * @param {Object} bot - Telegram bot instance
 * @param {string} memo - Optional memo/note
 * @returns {Promise<Object>} Execution result
 */
export const executeSchedulePayment = async (userId, recipientUsername, amount, tokenSymbol, scheduledDate, bot, memo = null) => {
  console.log(`[AI Actions] executeSchedulePayment called:`, { userId, recipientUsername, amount, tokenSymbol, scheduledDate, memo })
  
  try {
    // Validate inputs
    if (!recipientUsername || !amount || !scheduledDate) {
      return {
        success: false,
        message: "❌ Missing required information. Please provide recipient, amount, and scheduled date."
      }
    }

    // Validate amount
    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      return {
        success: false,
        message: `❌ Invalid amount: "${amount}". Please provide a valid positive number.`
      }
    }

    // Validate scheduled date is in the future
    const now = new Date()
    const scheduled = new Date(scheduledDate)
    
    console.log(`[AI Actions] Date validation:`, {
      now: now.toISOString(),
      scheduled: scheduled.toISOString(),
      scheduledDate: scheduledDate,
      timeDiff: scheduled.getTime() - now.getTime(),
      timeDiffSeconds: Math.floor((scheduled.getTime() - now.getTime()) / 1000)
    })
    
    if (isNaN(scheduled.getTime())) {
      console.error(`[AI Actions] Invalid date format:`, scheduledDate)
      return {
        success: false,
        message: "❌ Invalid date format. Please provide a valid date and time."
      }
    }

    // Allow 30 second buffer for processing time
    const bufferMs = 30 * 1000 // 30 seconds
    if (scheduled.getTime() <= (now.getTime() + bufferMs)) {
      const timeDiff = scheduled.getTime() - now.getTime()
      const timeDiffSeconds = Math.floor(timeDiff / 1000)
      console.error(`[AI Actions] Scheduled date is not far enough in the future:`, {
        scheduled: scheduled.toISOString(),
        now: now.toISOString(),
        timeDiffSeconds
      })
      return {
        success: false,
        message: `❌ Scheduled date must be at least 30 seconds in the future. The scheduled time is ${timeDiffSeconds > 0 ? `${timeDiffSeconds} seconds` : 'in the past'} from now. Please choose a future date and time.`
      }
    }

    // Get user
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return {
        success: false,
        message: "❌ You don't have a wallet yet. Please register a username first."
      }
    }

    // Validate token
    if (!TOKENS[tokenSymbol] || !TOKENS[tokenSymbol].address) {
      return {
        success: false,
        message: `❌ Token ${tokenSymbol} not supported. Available: ${Object.keys(TOKENS).join(', ')}`
      }
    }

    // Check balance (we'll check again when executing, but good to warn early)
    const balanceData = await getTokenBalance(user.wallet_address, TOKENS[tokenSymbol].address)
    if (!balanceData || parseFloat(balanceData.formatted) < parseFloat(amount)) {
      return {
        success: false,
        message: `❌ Insufficient ${tokenSymbol} balance. You have $${balanceData?.formatted || '0'}, need $${amount}.`
      }
    }

    // Validate recipient username exists
    try {
      const registry = await getUsernameRegistry()
      // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
      const recipientAddress = await registry.usernameToAddress(recipientUsername.toLowerCase())
      
      if (!recipientAddress || recipientAddress === ethers.ZeroAddress) {
        return {
          success: false,
          message: `❌ Username @${recipientUsername} not found. Please check the username and try again.`
        }
      }
    } catch (validationError) {
      console.error(`[AI Actions] Error validating recipient:`, validationError)
      return {
        success: false,
        message: "❌ Error validating recipient. Please try again."
      }
    }

    // Store scheduled payment
    const scheduledTimestamp = Math.floor(scheduled.getTime() / 1000) // Convert to Unix timestamp (seconds)
    
    await dbRun(
      `INSERT INTO scheduled_payments 
       (user_id, recipient_username, amount, token_symbol, token_address, memo, scheduled_for, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        userId,
        recipientUsername.toLowerCase(),
        amount,
        tokenSymbol,
        TOKENS[tokenSymbol].address,
        memo || null,
        scheduledTimestamp
      ]
    )

    const formattedDate = scheduled.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })

    const message = `✅ Payment scheduled successfully! 📅\n\n` +
      `To: @${recipientUsername}\n` +
      `Amount: $${amount} ${tokenSymbol}\n` +
      `Scheduled for: ${formattedDate}\n` +
      (memo ? `Note: ${memo}\n` : '') +
      `\n💡 The payment will be executed automatically at the scheduled time.\n` +
      `You'll receive a notification when it's sent.\n\n` +
      `Use "show scheduled payments" to view or cancel scheduled payments.`

    return {
      success: true,
      message,
      data: { recipientUsername, amount, tokenSymbol, scheduledDate: formattedDate, memo }
    }
  } catch (error) {
    console.error('[AI Actions] Error scheduling payment:', error)
    const friendlyError = getUserFriendlyError(error, 'payment')
    return {
      success: false,
      message: friendlyError.message || friendlyError
    }
  }
}

/**
 * Get scheduled payments for a user
 * @param {string} userId - Telegram user ID
 * @param {Object} bot - Telegram bot instance
 * @returns {Promise<Object>} Execution result
 */
export const executeViewScheduledPayments = async (userId, bot) => {
  try {
    const scheduler = getPaymentScheduler(bot)
    const scheduledPayments = await scheduler.getScheduledPayments(userId, 'pending')

    if (scheduledPayments.length === 0) {
      return {
        success: true,
        message: "📅 You don't have any scheduled payments.\n\n" +
          "You can schedule a payment by saying something like:\n" +
          "• \"Schedule $10 to @alice for tomorrow at 3pm\"\n" +
          "• \"Send $50 to @bob on December 25th\""
      }
    }

    let message = `📅 **Scheduled Payments** (${scheduledPayments.length})\n\n`
    
    scheduledPayments.forEach((payment, index) => {
      const scheduledDate = new Date(payment.scheduled_for * 1000)
      const formattedDate = scheduledDate.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      message += `${index + 1}. **@${payment.recipient_username}**\n`
      message += `   💵 $${payment.amount} ${payment.token_symbol}\n`
      message += `   📅 ${formattedDate}\n`
      if (payment.memo) {
        message += `   📝 ${payment.memo}\n`
      }
      message += `   🆔 ID: ${payment.id}\n\n`
    })

    message += `💡 To cancel a scheduled payment, say:\n` +
      `"Cancel scheduled payment #1" or "Cancel payment ID 1"`

    return {
      success: true,
      message,
      hasCloseButton: true // Add close button for list views
    }
  } catch (error) {
    console.error('[AI Actions] Error viewing scheduled payments:', error)
    return {
      success: false,
      message: "❌ Failed to retrieve scheduled payments. Please try again."
    }
  }
}

/**
 * Cancel a scheduled payment
 * @param {string} userId - Telegram user ID
 * @param {number} paymentId - Scheduled payment ID
 * @param {Object} bot - Telegram bot instance
 * @returns {Promise<Object>} Execution result
 */
export const executeCancelScheduledPayment = async (userId, paymentId, bot) => {
  try {
    const scheduler = getPaymentScheduler(bot)
    const result = await scheduler.cancelScheduledPayment(userId, paymentId)
    return result
  } catch (error) {
    console.error('[AI Actions] Error cancelling scheduled payment:', error)
    return {
      success: false,
      message: "❌ Failed to cancel scheduled payment. Please try again."
    }
  }
}

