import { dbGet, dbRun, dbAll } from './database.js'
import { getTokenBalance, prepareSendTransaction, checkTokenAllowance } from './wallet.js'
import { getSmartWalletForUser, sendTransactionFromSmartWallet, approveTokenFromSmartWallet } from './thirdwebWallet.js'
import { TOKENS, CONTRACTS } from './config.js'
import { ethers } from 'ethers'
import { checkAndNotifyPayment } from './paymentNotifications.js'
import { getUserFriendlyError } from './errorMessages.js'
import { getUsernameRegistry } from './contracts.js'

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
 * @returns {Promise<Object>} Execution result
 */
export const executePayment = async (userId, recipientUsername, amount, tokenSymbol, bot, memo = null) => {
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

    // Validate token
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
      const registry = getUsernameRegistry()
      const recipientAddress = await registry.getAddress(recipientUsername.toLowerCase())
      
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

    // Store payment
    try {
      await dbRun(
        `INSERT INTO payments 
         (tx_hash, from_address, to_address, from_username, to_username, token_address, amount, fee, status, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          txHash,
          user.wallet_address,
          txData.recipient,
          user.username || '',
          recipientUsername,
          TOKENS[tokenSymbol].address,
          txData.amount,
          txData.fee,
          memo || null
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

    // Store in database (INSERT OR REPLACE to handle both new and existing users)
    await dbRun(
      'INSERT OR REPLACE INTO telegram_users (telegram_id, wallet_address, username) VALUES (?, ?, ?)',
      [userId, walletAddress, username]
    )

    return {
      success: true,
      message: `✅ Awesome! Welcome to SendCash, @${username}! 🎉\n\n` +
        `Your smart wallet has been created and is ready to use!\n\n` +
        `💰 You can now:\n` +
        `• Receive payments via @${username}\n` +
        `• Send payments (just chat with me naturally!)\n` +
        `• Check your balance anytime\n\n` +
        `💡 All transactions are gasless thanks to account abstraction!\n\n` +
        `Try asking me: "What's my balance?" or "Send $10 to @alice" 🚀`,
      data: { walletAddress, username }
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

