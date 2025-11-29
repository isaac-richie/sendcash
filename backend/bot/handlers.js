import { dbGet, dbRun, dbAll } from '../services/database.js'
import { getTokenBalance, prepareSendTransaction, checkTokenAllowance, prepareApproveTransaction } from '../services/wallet.js'
import { createSmartWalletForUsername, getSmartWalletAddress, registerUsernameInRegistry, isSmartWalletDeployed, getSmartWalletForUser, sendTransactionFromSmartWallet, approveTokenFromSmartWallet } from '../services/thirdwebWallet.js'
import { TOKENS, CONTRACTS, BASE_RPC } from '../services/config.js'
import { ethers } from 'ethers'

// Username lookup helper
const lookupAddress = async (address) => {
  try {
    const cached = await dbGet('SELECT * FROM usernames WHERE address = ?', [address])
    if (cached) {
      return { address, username: cached.username, isPremium: cached.is_premium === 1 }
    }
    
    // Use centralized contract service
    const contractsModule = await import('../services/contracts.js')
    const registry = contractsModule.getUsernameRegistry()
    
    const username = await registry.getUsername(address)
    if (username && username.length > 0) {
      await dbRun(
        'INSERT OR REPLACE INTO usernames (username, address) VALUES (?, ?)',
        [username, address]
      )
      return { address, username, isPremium: false }
    }
    
    return { address, username: null }
  } catch (error) {
    console.error('Error looking up address:', error)
    return { address, username: null }
  }
}

// Store pending transactions (in production, use Redis or database)
const pendingTransactions = new Map()

export const botHandlers = (bot) => {
  // Start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from.id
    
    // Register user
    await dbRun(
      'INSERT OR IGNORE INTO telegram_users (telegram_id) VALUES (?)',
      [userId]
    )

    // Check if user already has a wallet
    const user = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
    
    if (user && user.wallet_address) {
      // User already registered
      const welcomeText = `Welcome back! 👋\n\n` +
        `Username: @${user.username || 'not set'}\n\n` +
        `💡 Use /menu to see the function menu!\n` +
        `💡 Check /balance to view your wallet address`

      const menuKeyboard = {
        reply_markup: {
          keyboard: [
            [
              { text: '🚀 Register' },
              { text: '💰 Balance' }
            ],
            [
              { text: '💸 Send Payment' },
              { text: '📋 History' }
            ],
            [
              { text: 'ℹ️ Help' },
              { text: '📱 Show Menu' }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      }

      return bot.sendMessage(chatId, welcomeText, menuKeyboard)
    }

    // New user - guide them to register
    const helpText = `Welcome to SendCash! 🎉

Send money via @username - it's that simple!

✨ Getting started:
1. Pick a username: /register @yourname
2. We'll create your wallet automatically
3. Start sending and receiving payments!

💡 Use /menu to see the function menu with buttons!`

    const menuKeyboard = {
      reply_markup: {
        keyboard: [
          [
            { text: '🚀 Register' },
            { text: '💰 Balance' }
          ],
          [
            { text: '💸 Send Payment' },
            { text: '📋 History' }
          ],
          [
            { text: 'ℹ️ Help' },
            { text: '📱 Show Menu' }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }

    bot.sendMessage(chatId, helpText, menuKeyboard)
  })

  // Register username and create wallet: /register @username
  bot.onText(/\/register (.+)/, async (msg, match) => {
    console.log(`[REGISTER] Handler triggered! Message: ${msg.text}`)
    const chatId = msg.chat.id
    const userId = msg.from.id
    const username = match[1].replace('@', '').trim().toLowerCase()

    console.log(`[REGISTER] User ${userId} attempting to register username: ${username}`)

    // Validate username
    if (username.length < 3) {
      console.log(`[REGISTER] Validation failed: username too short`)
      return bot.sendMessage(chatId, '❌ Username must be at least 3 characters long.')
    }
    if (username.length > 32) {
      console.log(`[REGISTER] Validation failed: username too long`)
      return bot.sendMessage(chatId, '❌ Username must be 32 characters or less.')
    }
    if (!/^[a-z0-9_]+$/.test(username)) {
      console.log(`[REGISTER] Validation failed: invalid characters`)
      return bot.sendMessage(chatId, '❌ Username can only contain letters, numbers, and underscores.')
    }

    // Check if user already registered
    try {
      const existingUser = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
      console.log(`[REGISTER] Existing user check:`, existingUser ? 'found' : 'not found')
      if (existingUser && existingUser.wallet_address) {
        console.log(`[REGISTER] User already has wallet: ${existingUser.wallet_address}`)
        const errorText = `❌ You already have a wallet!\n\n` +
          `Username: @${existingUser.username || 'not set'}\n\n` +
          `💡 Use /balance to view your wallet address`

        return bot.sendMessage(chatId, errorText)
      }
    } catch (dbError) {
      console.error('[REGISTER] Database error checking existing user:', dbError)
    }

    try {
      console.log(`[REGISTER] Starting registration process for ${username}`)
      
      // Re-import config to ensure we have latest values (handles dynamic imports)
      const { CONTRACTS: CONTRACTS_CHECK, BASE_RPC: BASE_RPC_CHECK } = await import('../services/config.js')
      
      // Validate contract addresses before proceeding
      console.log(`[REGISTER] Config check - USERNAME_REGISTRY: ${CONTRACTS_CHECK.USERNAME_REGISTRY || 'EMPTY'}`)
      console.log(`[REGISTER] Config check - BASE_RPC: ${BASE_RPC_CHECK || 'EMPTY'}`)
      
      if (!CONTRACTS_CHECK.USERNAME_REGISTRY || CONTRACTS_CHECK.USERNAME_REGISTRY === '') {
        console.error('[REGISTER] USERNAME_REGISTRY address is empty!')
        return bot.sendMessage(chatId, '❌ Server configuration error. Please contact support.')
      }
      
      if (!BASE_RPC_CHECK || BASE_RPC_CHECK === '') {
        console.error('[REGISTER] BASE_RPC is empty!')
        return bot.sendMessage(chatId, '❌ Server configuration error. Please contact support.')
      }
      
      await bot.sendMessage(chatId, `⏳ Creating your wallet and registering @${username}...`)

      // Check if username is available on-chain
      console.log(`[REGISTER] Checking username availability on-chain...`)
      console.log(`[REGISTER] Using USERNAME_REGISTRY: ${CONTRACTS_CHECK.USERNAME_REGISTRY}`)
      console.log(`[REGISTER] Using BASE_RPC: ${BASE_RPC_CHECK}`)
      
      // Use centralized contract service
      const contractsModule = await import('../services/contracts.js')
      const registry = contractsModule.getUsernameRegistry()

      const isAvailable = await registry.isUsernameAvailable(username)
      console.log(`[REGISTER] Username available: ${isAvailable}`)
      if (!isAvailable) {
        return bot.sendMessage(chatId, `❌ Username @${username} is already taken. Try another!`)
      }

      // Check if wallet already exists for this username
      const existingWalletAddress = await getSmartWalletAddress(username, userId)
      if (existingWalletAddress) {
        // Check if user already registered this wallet
        const existingUser = await dbGet(
          'SELECT * FROM telegram_users WHERE wallet_address = ? AND telegram_id != ?',
          [existingWalletAddress, userId]
        )
        if (existingUser) {
          return bot.sendMessage(chatId, `❌ Username @${username} already has a wallet. Try another!`)
        }
      }

      // Create smart wallet using Thirdweb
      console.log(`[REGISTER] Creating smart wallet...`)
      await bot.sendMessage(chatId, '⏳ Creating your smart wallet (gasless)...')
      const { walletAddress, smartWallet } = await createSmartWalletForUsername(username, userId)
      console.log(`[REGISTER] Wallet created: ${walletAddress}`)

      // Check if wallet is already deployed
      const isDeployed = await isSmartWalletDeployed(walletAddress)
      
      if (!isDeployed) {
        bot.sendMessage(chatId, '⏳ Deploying wallet on-chain (will be deployed on first use)...')
      }

      // Register username in UsernameRegistry (on-chain)
      // No registration fee required (test phase)
      bot.sendMessage(chatId, '⏳ Registering username on-chain (free during test phase)...')
      try {
        const regResult = await registerUsernameInRegistry(username, walletAddress)
        if (regResult.alreadyRegistered) {
          bot.sendMessage(chatId, '✅ Username already registered!')
        } else {
          bot.sendMessage(chatId, 
            `✅ Username registered! Transaction: \`${regResult.txHash}\`\n\n` +
            `🎉 Free registration (test phase)`,
            { parse_mode: 'Markdown' }
          )
        }
      } catch (regError) {
        // If registration fails, continue - wallet is created
        console.error('[REGISTER] Username registration error:', regError)
        if (regError.message.includes('USDC') || regError.message.includes('fee')) {
          bot.sendMessage(chatId, 
            `⚠️ Registration failed.\n\n` +
            `Error: ${regError.message}\n\n` +
            `Note: Registration is free during test phase.`
          )
        } else {
          bot.sendMessage(chatId, '⚠️ Wallet created, but username registration pending. Will retry on first use.')
        }
      }

      // Store in database
      await dbRun(
        'UPDATE telegram_users SET wallet_address = ?, username = ? WHERE telegram_id = ?',
        [walletAddress, username, userId]
      )

      // Verify username is registered on-chain (reuse registry instance from above)
      // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
      const registeredAddress = await registry.usernameToAddress(username.toLowerCase())

      const response = `✅ Welcome to SendCash, @${username}! 🎉\n\n` +
        `Your smart wallet has been created!\n\n` +
        `${registeredAddress && registeredAddress.toLowerCase() === walletAddress.toLowerCase() 
          ? '✅ Username registered on-chain!\n\n' 
          : '⏳ Username registration pending...\n\n'}` +
        `💰 You can now:\n` +
        `• Receive payments via @${username}\n` +
        `• Send payments with /send\n` +
        `• Check balance with /balance (shows your wallet address)\n\n` +
        `💡 Your wallet is ready! All transactions are gasless!`

      await bot.sendMessage(chatId, response)
      console.log(`[REGISTER] Registration complete for ${username}, wallet: ${walletAddress}`)
    } catch (error) {
      console.error('[REGISTER] Error in registration process:', error)
      console.error('[REGISTER] Error message:', error.message)
      console.error('[REGISTER] Error stack:', error.stack)
      try {
        await bot.sendMessage(chatId, `❌ Error during registration: ${error.message}\n\nPlease try again or contact support.`)
      } catch (sendError) {
        console.error('[REGISTER] Failed to send error message to user:', sendError)
      }
    }
  })

  // Balance command
  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from.id

    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    
    if (!user || !user.wallet_address) {
      return bot.sendMessage(
        chatId,
        '❌ No wallet found.\n\nCreate your account with:\n/register @yourname'
      )
    }

    try {
      bot.sendMessage(chatId, '⏳ Checking balances...')

      const balances = []
      for (const [symbol, token] of Object.entries(TOKENS)) {
        if (!token.address) continue
        
        const balanceData = await getTokenBalance(user.wallet_address, token.address)
        if (balanceData) {
          balances.push(`${symbol}: $${parseFloat(balanceData.formatted).toFixed(2)}`)
        }
      }

      if (balances.length === 0) {
        return bot.sendMessage(chatId, '❌ No supported tokens found or tokens not configured.')
      }

      const response = `💰 Your Balances:\n\n${balances.join('\n')}\n\n` +
        `📍 Wallet Address:\n\`${user.wallet_address}\`\n\n` +
        `⚠️ Keep this address private. Share only when necessary.`

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Error getting balance:', error)
      bot.sendMessage(chatId, '❌ Error fetching balance. Please try again.')
    }
  })

  // Send command: /send @username $10 [USDC]
  bot.onText(/\/send (.+)/, async (msg, match) => {
    const chatId = msg.chat.id
    const userId = msg.from.id
    const args = match[1].trim().split(/\s+/)

    if (args.length < 2) {
      return bot.sendMessage(chatId, '❌ Usage: /send @username $amount [token]\n\nExample: /send @alice $10 USDC')
    }

    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return bot.sendMessage(chatId, '❌ Please create your account first:\n/register @yourname')
    }

    const username = args[0].replace('@', '').trim()
    const amountStr = args[1].replace('$', '').trim()
    const tokenSymbol = args[2]?.toUpperCase() || 'USDC'

    if (!TOKENS[tokenSymbol] || !TOKENS[tokenSymbol].address) {
      return bot.sendMessage(chatId, `❌ Token ${tokenSymbol} not supported. Available: ${Object.keys(TOKENS).join(', ')}`)
    }

    try {
      await bot.sendMessage(chatId, '⏳ Preparing transaction...')

      // Prepare transaction data for validation
      const txData = await prepareSendTransaction(
        user.wallet_address,
        username,
        tokenSymbol,
        amountStr
      )

      // Get smart wallet instance for the user
      await bot.sendMessage(chatId, '⏳ Getting your smart wallet...')
      const { smartWallet, personalAccount, walletAddress } = await getSmartWalletForUser(user.username, userId)
      
      // Check if wallet is deployed and has balance
      const { isSmartWalletDeployed } = await import('../services/thirdwebWallet.js')
      const isDeployed = await isSmartWalletDeployed(walletAddress || user.wallet_address)
      console.log(`[HANDLER] Wallet deployed: ${isDeployed}, Address: ${walletAddress || user.wallet_address}`)
      
      if (!isDeployed) {
        await bot.sendMessage(chatId, '⏳ Wallet will be deployed on first transaction (this may take a moment)...')
      }
      
      // Check wallet USDC balance
      const { getTokenBalance } = await import('../services/wallet.js')
      const balanceData = await getTokenBalance(user.wallet_address, TOKENS[tokenSymbol].address)
      console.log(`[HANDLER] Wallet ${tokenSymbol} balance: ${balanceData ? balanceData.formatted : '0'}`)
      
      if (!balanceData || parseFloat(balanceData.formatted) === 0) {
        return bot.sendMessage(chatId, 
          `❌ Your wallet has no ${tokenSymbol} balance.\n\n` +
          `Please fund your wallet first:\n\`${user.wallet_address}\`\n\n` +
          `You need ${tokenSymbol} to send payments.`,
          { parse_mode: 'Markdown' }
        )
      }
      
      // Check allowance
      const hasAllowance = await checkTokenAllowance(
        user.wallet_address,
        TOKENS[tokenSymbol].address,
        txData.amountWei
      )

      if (!hasAllowance) {
        // Automatically approve token spending
        await bot.sendMessage(chatId, `⏳ Approving ${tokenSymbol} spending (one-time setup)...`)
        
        try {
          const approveTxHash = await approveTokenFromSmartWallet(
            smartWallet,
            TOKENS[tokenSymbol].address,
            CONTRACTS.SEND_CASH,
            ethers.MaxUint256, // Approve unlimited (standard practice)
            personalAccount, // Pass personalAccount for account extraction
            user.wallet_address // Pass wallet address so it can be added to wallet instance
          )
          
          await bot.sendMessage(chatId, 
            `✅ Token approval successful!\n\n` +
            `Transaction: \`${approveTxHash}\`\n\n` +
            `⏳ Now sending payment...`,
            { parse_mode: 'Markdown' }
          )
        } catch (approveError) {
          console.error('[HANDLER] ========== APPROVAL ERROR ==========')
          console.error('[HANDLER] User:', userId, 'Username:', user.username)
          console.error('[HANDLER] Token:', tokenSymbol, 'Address:', TOKENS[tokenSymbol].address)
          console.error('[HANDLER] Error type:', approveError.constructor.name)
          console.error('[HANDLER] Error message:', approveError.message)
          console.error('[HANDLER] Error stack:', approveError.stack)
          console.error('[HANDLER] ======================================')
          
          return bot.sendMessage(chatId, 
            `❌ Failed to approve token: ${approveError.message}\n\n` +
            `Please try again.`
          )
        }
      }

      // Execute payment transaction using Thirdweb smart wallet
      await bot.sendMessage(chatId, '⏳ Executing payment transaction (gasless)...')
      
      try {
        const txHash = await sendTransactionFromSmartWallet(
          smartWallet,
          CONTRACTS.SEND_CASH,
          "sendPayment",
          [
            username.toLowerCase(), // toUsername
            TOKENS[tokenSymbol].address, // token
            txData.amountWei // amount
          ],
          personalAccount, // Pass personalAccount for account extraction
          user.wallet_address // Pass wallet address so it can be added to wallet instance
        )

        // Store payment in database
        try {
          await dbRun(
            `INSERT INTO payments 
             (tx_hash, from_address, to_address, from_username, to_username, token_address, amount, fee, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
            [
              txHash,
              user.wallet_address,
              txData.recipient,
              user.username || '',
              username,
              TOKENS[tokenSymbol].address,
              txData.amount,
              txData.fee
            ]
          )
        } catch (dbError) {
          console.error('Error storing payment in database:', dbError)
          // Continue even if DB storage fails
        }

        const blockExplorerUrl = `https://sepolia-explorer.base.org/tx/${txHash}`
        
        const successMessage = `✅ Payment sent successfully! 🎉\n\n` +
          `To: @${username}\n` +
          `Amount: $${amountStr} ${tokenSymbol}\n` +
          `Fee: 0.5%\n\n` +
          `Transaction: [View on Explorer](${blockExplorerUrl})\n` +
          `Hash: \`${txHash}\`\n\n` +
          `💡 Transaction is gasless thanks to account abstraction!`

        bot.sendMessage(chatId, successMessage, { parse_mode: 'Markdown' })
        
        console.log(`[SEND] Payment sent: ${txHash} from ${user.wallet_address} to @${username}`)
        
        // Notify recipient after a short delay (wait for transaction confirmation)
        setTimeout(async () => {
          try {
            const { checkAndNotifyPayment } = await import('../services/paymentNotifications.js')
            await checkAndNotifyPayment(bot, txHash)
          } catch (notifyError) {
            console.error('[SEND] Error notifying recipient:', notifyError)
            // Don't fail the send if notification fails
          }
        }, 5000) // Wait 5 seconds for transaction to be confirmed
      } catch (sendError) {
        console.error('Error sending transaction:', sendError)
        bot.sendMessage(chatId, 
          `❌ Failed to send payment: ${sendError.message}\n\n` +
          `Please check your balance and try again.`
        )
      }
    } catch (error) {
      console.error('Error in send flow:', error)
      bot.sendMessage(chatId, `❌ Error: ${error.message}\n\nPlease try again or contact support.`)
    }
  })

  // Handle callback queries (button clicks)
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id
    const userId = query.from.id
    const data = query.data

    if (data.startsWith('show_addr_')) {
      // Show wallet address on click
      const addressKey = data.replace('show_addr_', '')
      const addressData = pendingTransactions.get(addressKey)
      
      if (!addressData) {
        return bot.answerCallbackQuery(query.id, { text: 'Address data expired', show_alert: true })
      }

      // Verify the user requesting is the owner
      if (addressData.userId !== userId) {
        return bot.answerCallbackQuery(query.id, { text: 'Unauthorized', show_alert: true })
      }

      bot.answerCallbackQuery(query.id, { text: 'Address revealed' })
      
      // Show the address
      const addressMessage = `🔓 Your Wallet Address:\n\n\`${addressData.walletAddress}\`\n\n` +
        `⚠️ Keep this address private. Share only when necessary.`
      
      bot.sendMessage(chatId, addressMessage, { parse_mode: 'Markdown' })
      
      // Clean up after a delay (optional - for memory management)
      setTimeout(() => {
        pendingTransactions.delete(addressKey)
      }, 60000) // Delete after 1 minute

    } else if (data.startsWith('confirm_')) {
      const txId = data.replace('confirm_', '')
      const pending = pendingTransactions.get(txId)
      
      if (!pending) {
        return bot.answerCallbackQuery(query.id, { text: 'Transaction expired', show_alert: true })
      }

      bot.answerCallbackQuery(query.id, { text: 'Please sign the transaction in your wallet' })
      
      // Provide transaction details again
      const txDetails = `Sign this transaction:\n\n\`\`\`\n${JSON.stringify({
        to: pending.txData.to,
        data: pending.txData.data,
        value: pending.txData.value
      }, null, 2)}\n\`\`\`\n\nAfter signing, use /confirm <tx_hash> to confirm.`
      
      bot.sendMessage(chatId, txDetails, { parse_mode: 'Markdown' })
    } else if (data.startsWith('cancel_')) {
      const txId = data.replace('cancel_', '')
      pendingTransactions.delete(txId)
      bot.answerCallbackQuery(query.id, { text: 'Transaction cancelled' })
      bot.sendMessage(chatId, '❌ Transaction cancelled.')
    }
  })

  // Confirm transaction: /confirm 0x...
  bot.onText(/\/confirm (.+)/, async (msg, match) => {
    const chatId = msg.chat.id
    const txHash = match[1].trim()

    try {
      bot.sendMessage(chatId, '⏳ Verifying transaction...')

      // Verify transaction on-chain
      const confirmProvider = new ethers.JsonRpcProvider(BASE_RPC)
      const receipt = await confirmProvider.getTransactionReceipt(txHash)

      if (!receipt) {
        return bot.sendMessage(chatId, '❌ Transaction not found. Please check the transaction hash.')
      }

      if (receipt.status === 0) {
        return bot.sendMessage(chatId, '❌ Transaction failed. Please check on block explorer.')
      }

      // Store payment in database
      // Get payment details from receipt logs
      const blockExplorerUrl = `https://sepolia-explorer.base.org/tx/${txHash}`
      
      const response = `✅ Payment confirmed!\n\n` +
        `Transaction: [View on Explorer](${blockExplorerUrl})\n` +
        `Status: Confirmed\n` +
        `Block: ${receipt.blockNumber}`

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Error confirming transaction:', error)
      bot.sendMessage(chatId, '❌ Error verifying transaction. Please check the hash and try again.')
    }
  })


  // History command
  bot.onText(/\/history/, async (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from.id

    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return bot.sendMessage(chatId, '❌ Please create your account first:\n/register @yourname')
    }

    try {
      const transactions = await dbAll(
        `SELECT * FROM payments 
         WHERE from_address = ? OR to_address = ?
         ORDER BY created_at DESC 
         LIMIT 10`,
        [user.wallet_address, user.wallet_address]
      )

      if (transactions.length === 0) {
        return bot.sendMessage(chatId, '📋 No transactions yet.')
      }

      let response = '📋 Recent Transactions:\n\n'
      transactions.forEach((tx, index) => {
        const type = tx.from_address.toLowerCase() === user.wallet_address.toLowerCase() ? 'Sent' : 'Received'
        const sign = type === 'Sent' ? '➡️' : '⬅️'
        response += `${sign} ${type}: $${tx.amount} ${tx.token_address}\n`
        response += `   ${tx.to_username ? `@${tx.to_username}` : tx.to_address}\n`
        response += `   [View](${process.env.APP_URL || 'https://sepolia-explorer.base.org'}/tx/${tx.tx_hash})\n\n`
      })

      bot.sendMessage(chatId, response, { parse_mode: 'Markdown' })
    } catch (error) {
      console.error('Error getting history:', error)
      bot.sendMessage(chatId, '❌ Error fetching transaction history.')
    }
  })

  // Menu command - Show function menu with buttons
  bot.onText(/\/menu/, async (msg) => {
    const chatId = msg.chat.id
    const userId = msg.from.id
    
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    const hasWallet = user && user.wallet_address

    const menuText = `📱 SendCash Function Menu\n\n` +
      `Select a function from the menu below:`

    const menuKeyboard = {
      reply_markup: {
        keyboard: [
          [
            { text: '🚀 Register' },
            { text: '💰 Balance' }
          ],
          [
            { text: '💸 Send Payment' },
            { text: '📋 History' }
          ],
          [
            { text: 'ℹ️ Help' },
            { text: '📱 Show Menu' }
          ]
        ],
        resize_keyboard: true,
        one_time_keyboard: false
      }
    }

    bot.sendMessage(chatId, menuText, menuKeyboard)
  })

  // Handle menu button clicks and natural language (AI Agent)
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return
    
    const chatId = msg.chat.id
    const userId = msg.from.id
    const text = msg.text.trim()
    
    // Menu buttons (handled first)
    const menuButtons = ['🚀 Register', '💰 Balance', '💸 Send Payment', '📋 History', 'ℹ️ Help', '📱 Show Menu']
    if (menuButtons.includes(text)) {
      // Continue to existing menu button handlers below
    } else {
      // Natural language - use AI Agent
      try {
        const { aiAgent } = await import('../services/aiAgent.js')
        await aiAgent.initialize()
        
        // Get user context
        const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
        
        // Check for confirmation responses
        const confirmationWords = ['yes', 'confirm', 'y', 'ok', 'proceed', 'cancel', 'no', 'abort']
        const isConfirmation = confirmationWords.some(word => text.toLowerCase().includes(word))
        
        if (isConfirmation) {
          // Try to confirm pending action
          const confirmResult = await aiAgent.confirmAndExecute(userId, text, bot)
          return bot.sendMessage(chatId, confirmResult.message, { parse_mode: 'Markdown' })
        }
        
        // Show typing indicator
        await bot.sendChatAction(chatId, 'typing')
        
        // Process with AI (pass bot for action execution)
        const aiResponse = await aiAgent.processNaturalLanguage(
          text,
          userId,
          { walletAddress: user?.wallet_address, username: user?.username },
          bot
        )
        
        return bot.sendMessage(chatId, aiResponse, { parse_mode: 'Markdown' })
      } catch (error) {
        console.error('[BOT] AI Agent error:', error)
        // If AI fails, show helpful message
        return bot.sendMessage(chatId, 
          "I didn't understand that. Try:\n" +
          "• /help - See all commands\n" +
          "• /balance - Check balance\n" +
          "• /send @username $amount - Send payment"
        )
      }
    }

    // Handle menu button clicks
    if (text === '🚀 Register') {
      return bot.sendMessage(chatId, 
        '📝 To register, use:\n`/register @yourname`\n\nExample: `/register @alice`',
        { parse_mode: 'Markdown' }
      )
    }
    
    if (text === '💰 Balance') {
      // Trigger balance command
      const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
      
      if (!user || !user.wallet_address) {
        return bot.sendMessage(
          chatId,
          '❌ No wallet found.\n\nCreate your account with:\n/register @yourname'
        )
      }

      try {
        await bot.sendMessage(chatId, '⏳ Checking balances...')

        const balances = []
        for (const [symbol, token] of Object.entries(TOKENS)) {
          if (!token.address) continue
          
          const balanceData = await getTokenBalance(user.wallet_address, token.address)
          if (balanceData) {
            balances.push(`${symbol}: $${parseFloat(balanceData.formatted).toFixed(2)}`)
          }
        }

        if (balances.length === 0) {
          return bot.sendMessage(chatId, '❌ No supported tokens found or tokens not configured.')
        }

        const response = `💰 Your Balances:\n\n${balances.join('\n')}\n\n` +
          `📍 Wallet Address:\n\`${user.wallet_address}\`\n\n` +
          `⚠️ Keep this address private. Share only when necessary.`

        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' })
      } catch (error) {
        console.error('Error getting balance:', error)
        bot.sendMessage(chatId, '❌ Error fetching balance. Please try again.')
      }
      return
    }
    
    if (text === '💸 Send Payment') {
      return bot.sendMessage(chatId,
        '💸 To send a payment, use:\n`/send @username $amount [token]`\n\n' +
        'Examples:\n' +
        '• `/send @alice $10 USDC`\n' +
        '• `/send @bob $5 USDT`\n' +
        '• `/send @charlie $1 WBTC`',
        { parse_mode: 'Markdown' }
      )
    }
    
    if (text === '📋 History') {
      // Trigger history command
      const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
      if (!user || !user.wallet_address) {
        return bot.sendMessage(chatId, '❌ Please create your account first:\n/register @yourname')
      }

      try {
        const transactions = await dbAll(
          `SELECT * FROM payments 
           WHERE from_address = ? OR to_address = ?
           ORDER BY created_at DESC 
           LIMIT 10`,
          [user.wallet_address, user.wallet_address]
        )

        if (transactions.length === 0) {
          return bot.sendMessage(chatId, '📋 No transactions yet.')
        }

        let response = '📋 Recent Transactions:\n\n'
        transactions.forEach((tx, index) => {
          const type = tx.from_address.toLowerCase() === user.wallet_address.toLowerCase() ? 'Sent' : 'Received'
          const sign = type === 'Sent' ? '➡️' : '⬅️'
          response += `${sign} ${type}: $${tx.amount} ${tx.token_address}\n`
          response += `   ${tx.to_username ? `@${tx.to_username}` : tx.to_address}\n`
          response += `   [View](${process.env.APP_URL || 'https://sepolia-explorer.base.org'}/tx/${tx.tx_hash})\n\n`
        })

        bot.sendMessage(chatId, response, { parse_mode: 'Markdown' })
      } catch (error) {
        console.error('Error getting history:', error)
        bot.sendMessage(chatId, '❌ Error fetching transaction history.')
      }
      return
    }
    
    if (text === 'ℹ️ Help') {
      const helpText = `📚 SendCash Commands:

🚀 Getting Started
/register @username - Create account (pick your username!)

💰 Wallet
/balance - Check your token balances

💸 Payments
/send @username $amount [token] - Send payment
/history - View transaction history

📱 Menu
/menu - Show function menu with buttons

ℹ️ Info
/help - Show this help

Examples:
/register @alice
/send @bob $10 USDC
/balance`

      bot.sendMessage(chatId, helpText)
      return
    }
    
    if (text === '📱 Show Menu') {
      // Show menu again
      const menuText = `📱 SendCash Function Menu\n\n` +
        `Select a function from the menu below:`

      const menuKeyboard = {
        reply_markup: {
          keyboard: [
            [
              { text: '🚀 Register' },
              { text: '💰 Balance' }
            ],
            [
              { text: '💸 Send Payment' },
              { text: '📋 History' }
            ],
            [
              { text: 'ℹ️ Help' },
              { text: '📱 Show Menu' }
            ]
          ],
          resize_keyboard: true,
          one_time_keyboard: false
        }
      }

      bot.sendMessage(chatId, menuText, menuKeyboard)
      return
    }
  })

  // Help command
  bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id
    const helpText = `📚 SendCash Commands:

🚀 Getting Started
/register @username - Create account (pick your username!)

💰 Wallet
/balance - Check your token balances

💸 Payments
/send @username $amount [token] - Send payment
/history - View transaction history

📱 Menu
/menu - Show function menu with buttons

ℹ️ Info
/help - Show this help

Examples:
/register @alice
/send @bob $10 USDC
/balance`

    bot.sendMessage(chatId, helpText)
  })

}
