import { ethers } from 'ethers'
import { BASE_RPC, CONTRACTS } from './config.js'
import { dbGet } from './database.js'

/**
 * Payment notification service
 * Notifies users when they receive payments
 */

// SendCash contract ABI (only events we need)
const SEND_CASH_ABI = [
  "event PaymentSent(address indexed from, address indexed to, address indexed token, uint256 amount, uint256 fee, string fromUsername, string toUsername)"
]

/**
 * Parse PaymentSent event from transaction receipt
 * Handles both direct transactions and account abstraction (UserOperations)
 * @param {string} txHash - Transaction hash
 * @returns {Promise<Object|null>} Payment data or null if not found
 */
export const parsePaymentFromReceipt = async (txHash) => {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    const receipt = await provider.getTransactionReceipt(txHash)
    
    if (!receipt || receipt.status !== 1) {
      return null
    }

    // Get SendCash contract instance
    const sendCashContract = new ethers.Contract(
      CONTRACTS.SEND_CASH,
      SEND_CASH_ABI,
      provider
    )

    // Get the event signature for PaymentSent
    const paymentSentTopic = ethers.id('PaymentSent(address,address,address,uint256,uint256,string,string)')

    // Search all logs for PaymentSent event
    // This works for both direct calls and account abstraction (UserOperations)
    let paymentEvent = null
    
    for (const log of receipt.logs) {
      // Check if this log is from SendCash contract
      if (log.address.toLowerCase() !== CONTRACTS.SEND_CASH.toLowerCase()) {
        continue
      }
      
      // Check if this is a PaymentSent event
      if (log.topics[0] === paymentSentTopic) {
        try {
          const parsedEvent = sendCashContract.interface.parseLog({
            topics: log.topics,
            data: log.data
          })

          if (parsedEvent && parsedEvent.name === 'PaymentSent') {
            paymentEvent = parsedEvent
            break
          }
        } catch (parseError) {
          // Continue searching if parsing fails
          continue
        }
      }
    }

    if (!paymentEvent) {
      // If not found in logs, try querying events from the block
      // This helps with account abstraction where events might be in inner transactions
      try {
        const block = await provider.getBlock(receipt.blockNumber)
        const filter = sendCashContract.filters.PaymentSent()
        const events = await sendCashContract.queryFilter(filter, block.number, block.number)
        
        // Find event that matches our transaction
        for (const event of events) {
          if (event.transactionHash === txHash || 
              (event.log && event.log.transactionHash === txHash)) {
            paymentEvent = event
            break
          }
        }
      } catch (queryError) {
        console.log(`[PaymentNotifications] Could not query events from block: ${queryError.message}`)
      }
    }

    if (!paymentEvent) {
      return null
    }

    return {
      from: paymentEvent.args.from,
      to: paymentEvent.args.to,
      token: paymentEvent.args.token,
      amount: paymentEvent.args.amount.toString(),
      fee: paymentEvent.args.fee.toString(),
      fromUsername: paymentEvent.args.fromUsername,
      toUsername: paymentEvent.args.toUsername,
      txHash: txHash,
      blockNumber: receipt.blockNumber
    }
  } catch (error) {
    console.error('[PaymentNotifications] Error parsing payment from receipt:', error)
    return null
  }
}

/**
 * Get recipient's Telegram ID from wallet address
 * @param {string} walletAddress - Recipient's wallet address
 * @returns {Promise<number|null>} Telegram ID or null if not found
 */
export const getTelegramIdFromAddress = async (walletAddress) => {
  try {
    // Use case-insensitive comparison by converting both to lowercase
    const user = await dbGet(
      'SELECT telegram_id FROM telegram_users WHERE LOWER(wallet_address) = LOWER(?)',
      [walletAddress]
    )
    return user ? user.telegram_id : null
  } catch (error) {
    console.error('[PaymentNotifications] Error getting Telegram ID:', error)
    return null
  }
}

/**
 * Format token amount for display
 * @param {string} amountWei - Amount in wei/smallest unit
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<string>} Formatted amount
 */
export const formatTokenAmount = async (amountWei, tokenAddress) => {
  try {
    // Import token config
    const { TOKENS } = await import('./config.js')
    
    // Find token by address
    const tokenEntry = Object.entries(TOKENS).find(
      ([_, token]) => token.address?.toLowerCase() === tokenAddress.toLowerCase()
    )
    
    if (!tokenEntry) {
      // Default to 6 decimals (USDC/USDT)
      return parseFloat(ethers.formatUnits(amountWei, 6)).toFixed(2)
    }
    
    const [symbol, token] = tokenEntry
    const decimals = token.decimals || 6
    
    return parseFloat(ethers.formatUnits(amountWei, decimals)).toFixed(2)
  } catch (error) {
    console.error('[PaymentNotifications] Error formatting amount:', error)
    // Fallback to 6 decimals
    return parseFloat(ethers.formatUnits(amountWei, 6)).toFixed(2)
  }
}

/**
 * Send payment notification to recipient
 * @param {Object} bot - Telegram bot instance
 * @param {Object} paymentData - Payment data from parsePaymentFromReceipt
 * @returns {Promise<boolean>} Success status
 */
export const sendPaymentNotification = async (bot, paymentData) => {
  try {
    // Get recipient's Telegram ID
    const telegramId = await getTelegramIdFromAddress(paymentData.to)
    
    if (!telegramId) {
      console.log(`[PaymentNotifications] No Telegram user found for address: ${paymentData.to}`)
      return false
    }

    // Format amount
    const formattedAmount = await formatTokenAmount(paymentData.amount, paymentData.token)
    
    // Get token symbol
    const { TOKENS } = await import('./config.js')
    const tokenEntry = Object.entries(TOKENS).find(
      ([_, token]) => token.address?.toLowerCase() === paymentData.token.toLowerCase()
    )
    const tokenSymbol = tokenEntry ? tokenEntry[0] : 'TOKEN'

    // Calculate amount after fee
    const amountAfterFee = BigInt(paymentData.amount) - BigInt(paymentData.fee)
    const formattedAmountAfterFee = await formatTokenAmount(amountAfterFee.toString(), paymentData.token)
    const formattedFee = await formatTokenAmount(paymentData.fee, paymentData.token)

    // Build notification message - simple and friendly
    const blockExplorerUrl = `https://sepolia-explorer.base.org/tx/${paymentData.txHash}`
    
    const fromDisplay = paymentData.fromUsername 
      ? `@${paymentData.fromUsername}` 
      : `${paymentData.from.slice(0, 6)}...${paymentData.from.slice(-4)}`
    
    // Get memo from database if available
    const { dbGet } = await import('./database.js')
    const paymentRecord = await dbGet('SELECT memo FROM payments WHERE tx_hash = ?', [paymentData.txHash])
    const memoText = paymentRecord?.memo ? `\n\n📝 "${paymentRecord.memo}"` : ''
    
    // Simple, friendly message
    const notificationMessage = `💰 You just received $${formattedAmountAfterFee} ${tokenSymbol} from ${fromDisplay}${memoText}\n\n` +
      `🔗 [View on Explorer](${blockExplorerUrl})`

    // Send notification
    await bot.sendMessage(telegramId, notificationMessage, { parse_mode: 'Markdown' })
    
    console.log(`[PaymentNotifications] ✅ Notification sent to Telegram ID: ${telegramId} for payment: ${paymentData.txHash}`)
    return true
  } catch (error) {
    console.error('[PaymentNotifications] Error sending notification:', error)
    
    // If user blocked the bot or chat not found, that's okay
    if (error.response?.errorCode === 403 || error.response?.description?.includes('chat not found')) {
      console.log(`[PaymentNotifications] User ${telegramId} blocked bot or chat not found`)
      return false
    }
    
    return false
  }
}

/**
 * Check transaction and notify recipient if payment received
 * @param {Object} bot - Telegram bot instance
 * @param {string} txHash - Transaction hash
 * @param {number} maxRetries - Maximum number of retries (default: 3)
 * @param {number} retryDelay - Delay between retries in ms (default: 3000)
 * @returns {Promise<boolean>} Success status
 */
export const checkAndNotifyPayment = async (bot, txHash, maxRetries = 3, retryDelay = 3000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Parse payment from receipt
      const paymentData = await parsePaymentFromReceipt(txHash)
      
      if (!paymentData) {
        if (attempt < maxRetries) {
          console.log(`[PaymentNotifications] Attempt ${attempt}/${maxRetries}: Transaction not confirmed yet, retrying in ${retryDelay}ms...`)
          await new Promise(resolve => setTimeout(resolve, retryDelay))
          continue
        } else {
          console.log(`[PaymentNotifications] No PaymentSent event found in transaction after ${maxRetries} attempts: ${txHash}`)
          return false
        }
      }

      // Send notification to recipient
      const notified = await sendPaymentNotification(bot, paymentData)
      
      if (notified) {
        console.log(`[PaymentNotifications] ✅ Notification sent successfully on attempt ${attempt}`)
        return true
      }
      
      return false
    } catch (error) {
      if (attempt < maxRetries) {
        console.error(`[PaymentNotifications] Attempt ${attempt}/${maxRetries} failed:`, error.message)
        await new Promise(resolve => setTimeout(resolve, retryDelay))
        continue
      } else {
        console.error('[PaymentNotifications] Error checking and notifying payment after all retries:', error)
        return false
      }
    }
  }
  
  return false
}

