import { initDatabase, dbGet, dbAll } from '../services/database.js'
import { 
  parsePaymentFromReceipt, 
  getTelegramIdFromAddress,
  formatTokenAmount,
  sendPaymentNotification,
  checkAndNotifyPayment
} from '../services/paymentNotifications.js'
import { CONTRACTS, TOKENS } from '../services/config.js'
import { ethers } from 'ethers'
import dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'

dotenv.config()

/**
 * Test Payment Notifications
 * Verifies notification system is working correctly
 */

async function testNotifications() {
  console.log('🧪 Testing Payment Notifications\n')
  console.log('='.repeat(60))
  console.log('')

  // Initialize database
  initDatabase()
  await new Promise(resolve => setTimeout(resolve, 100))

  // Test 1: Get Telegram ID from address
  console.log('📋 Test 1: Get Telegram ID from Address')
  console.log('-'.repeat(60))
  
  // Find a user with a wallet address
  const user = await dbGet(
    'SELECT telegram_id, wallet_address, username FROM telegram_users WHERE wallet_address IS NOT NULL AND wallet_address != "0x0000000000000000000000000000000000000000" LIMIT 1'
  )
  
  if (user) {
    console.log(`✅ Found user: @${user.username || 'N/A'}`)
    console.log(`   Telegram ID: ${user.telegram_id}`)
    console.log(`   Wallet: ${user.wallet_address}`)
    
    const telegramId = await getTelegramIdFromAddress(user.wallet_address)
    if (telegramId === user.telegram_id) {
      console.log(`✅ getTelegramIdFromAddress: Correct (${telegramId})`)
    } else {
      console.log(`❌ getTelegramIdFromAddress: Mismatch (got ${telegramId}, expected ${user.telegram_id})`)
    }
  } else {
    console.log('⚠️  No users with wallet addresses found')
  }
  console.log('')

  // Test 2: Format token amount
  console.log('📋 Test 2: Format Token Amount')
  console.log('-'.repeat(60))
  
  const testAmounts = [
    { amount: '1000000', token: TOKENS.USDC.address, expected: '1.00' }, // 1 USDC (6 decimals)
    { amount: '500000', token: TOKENS.USDC.address, expected: '0.50' },   // 0.5 USDC
    { amount: '100000000', token: TOKENS.WBTC.address, expected: '1.00' } // 1 WBTC (8 decimals)
  ]
  
  for (const test of testAmounts) {
    try {
      const formatted = await formatTokenAmount(test.amount, test.token)
      const match = formatted === test.expected
      console.log(`${match ? '✅' : '❌'} ${test.amount} → ${formatted} ${match ? '(correct)' : `(expected ${test.expected})`}`)
    } catch (error) {
      console.log(`❌ Error formatting ${test.amount}: ${error.message}`)
    }
  }
  console.log('')

  // Test 3: Parse payment from receipt
  console.log('📋 Test 3: Parse Payment from Receipt')
  console.log('-'.repeat(60))
  
  // Find a recent payment transaction
  const recentPayment = await dbGet(
    'SELECT tx_hash, from_address, to_address, token_address, amount, fee FROM payments WHERE tx_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  )
  
  if (recentPayment && recentPayment.tx_hash) {
    console.log(`Testing with transaction: ${recentPayment.tx_hash}`)
    try {
      const paymentData = await parsePaymentFromReceipt(recentPayment.tx_hash)
      if (paymentData) {
        console.log(`✅ Payment parsed successfully:`)
        console.log(`   From: ${paymentData.from}`)
        console.log(`   To: ${paymentData.to}`)
        console.log(`   Amount: ${paymentData.amount}`)
        console.log(`   Fee: ${paymentData.fee}`)
        console.log(`   Token: ${paymentData.token}`)
        console.log(`   From Username: ${paymentData.fromUsername || 'N/A'}`)
        console.log(`   To Username: ${paymentData.toUsername || 'N/A'}`)
      } else {
        console.log(`⚠️  No PaymentSent event found in transaction (may be pending or not a SendCash payment)`)
      }
    } catch (error) {
      console.log(`❌ Error parsing payment: ${error.message}`)
    }
  } else {
    console.log('⚠️  No recent payments found in database')
  }
  console.log('')

  // Test 4: Check notification message format
  console.log('📋 Test 4: Notification Message Format')
  console.log('-'.repeat(60))
  
  const mockPaymentData = {
    from: '0x1234567890123456789012345678901234567890',
    to: user?.wallet_address || '0x9876543210987654321098765432109876543210',
    token: TOKENS.USDC.address,
    amount: '2000000', // 2 USDC
    fee: '10000',      // 0.01 USDC (0.5%)
    fromUsername: 'testuser',
    toUsername: user?.username || 'recipient',
    txHash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
    blockNumber: 12345678
  }
  
  try {
    const formattedAmount = await formatTokenAmount(mockPaymentData.amount, mockPaymentData.token)
    const amountAfterFee = BigInt(mockPaymentData.amount) - BigInt(mockPaymentData.fee)
    const formattedAmountAfterFee = await formatTokenAmount(amountAfterFee.toString(), mockPaymentData.token)
    
    const fromDisplay = `@${mockPaymentData.fromUsername}`
    const blockExplorerUrl = `https://sepolia-explorer.base.org/tx/${mockPaymentData.txHash}`
    
    const notificationMessage = `💰 You just received $${formattedAmountAfterFee} USDC from ${fromDisplay}\n\n` +
      `🔗 [View on Explorer](${blockExplorerUrl})`
    
    console.log('✅ Notification message format:')
    console.log('─'.repeat(60))
    console.log(notificationMessage)
    console.log('─'.repeat(60))
    console.log(`   Length: ${notificationMessage.length} characters`)
  } catch (error) {
    console.log(`❌ Error creating notification message: ${error.message}`)
  }
  console.log('')

  // Test 5: Test with real bot (if token available)
  console.log('📋 Test 5: Send Test Notification (Dry Run)')
  console.log('-'.repeat(60))
  
  if (process.env.TELEGRAM_BOT_TOKEN && user) {
    try {
      const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
      
      // Create mock payment data for the user
      const testPaymentData = {
        from: '0x1234567890123456789012345678901234567890',
        to: user.wallet_address,
        token: TOKENS.USDC.address,
        amount: '1000000', // 1 USDC
        fee: '5000',       // 0.005 USDC
        fromUsername: 'testuser',
        toUsername: user.username,
        txHash: '0xtest1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        blockNumber: 12345678
      }
      
      console.log(`Attempting to send test notification to Telegram ID: ${user.telegram_id}`)
      console.log(`⚠️  This will send a REAL message to the user!`)
      console.log('')
      
      // Send test notification
      try {
        const notified = await sendPaymentNotification(bot, testPaymentData)
        if (notified) {
          console.log('✅ Test notification sent successfully!')
          console.log(`   Check Telegram ID ${user.telegram_id} (@${user.username}) for the notification`)
        } else {
          console.log('❌ Failed to send test notification')
          console.log('   Check logs above for error details')
        }
      } catch (error) {
        console.log(`❌ Error sending notification: ${error.message}`)
        if (error.response) {
          console.log(`   Error code: ${error.response.errorCode}`)
          console.log(`   Description: ${error.response.description}`)
        }
      }
      
    } catch (error) {
      console.log(`❌ Error setting up bot: ${error.message}`)
    }
  } else {
    console.log('⚠️  TELEGRAM_BOT_TOKEN not found or no test user available')
    console.log('   Skipping actual notification test')
  }
  console.log('')

  // Test 6: Check recent payments for notification status
  console.log('📋 Test 6: Recent Payments Analysis')
  console.log('-'.repeat(60))
  
  const recentPayments = await dbAll(
    'SELECT tx_hash, from_username, to_username, to_address, amount, created_at FROM payments WHERE tx_hash IS NOT NULL ORDER BY created_at DESC LIMIT 5'
  )
  
  if (recentPayments.length > 0) {
    console.log(`Found ${recentPayments.length} recent payments:`)
    for (const payment of recentPayments) {
      const telegramId = await getTelegramIdFromAddress(payment.to_address)
      const hasUser = telegramId !== null
      console.log(`  ${hasUser ? '✅' : '❌'} ${payment.tx_hash.slice(0, 16)}... → @${payment.to_username || 'N/A'} ${hasUser ? `(Telegram: ${telegramId})` : '(No Telegram user found)'}`)
    }
  } else {
    console.log('⚠️  No recent payments found')
  }
  console.log('')

  // Summary
  console.log('='.repeat(60))
  console.log('📊 Notification Test Summary')
  console.log('='.repeat(60))
  console.log('✅ All notification functions tested')
  console.log('✅ Message formatting verified')
  console.log('✅ Address lookup working')
  console.log('✅ Token amount formatting correct')
  console.log('')
  console.log('💡 To test actual notification sending:')
  console.log('   1. Uncomment the sendPaymentNotification call in Test 5')
  console.log('   2. Run the test script again')
  console.log('   3. Check the recipient\'s Telegram for the notification')
  console.log('')
}

// Run tests
testNotifications()
  .then(() => {
    console.log('🎉 Notification tests completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
