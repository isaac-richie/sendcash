import { initDatabase } from '../services/database.js'
import { 
  parsePaymentFromReceipt,
  getTelegramIdFromAddress,
  checkAndNotifyPayment
} from '../services/paymentNotifications.js'
import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Test notification for draco
 * Check why draco didn't receive notification
 */

async function testDracoNotification() {
  console.log('🔍 Testing Notification for Draco\n')
  console.log('='.repeat(60))
  console.log('')

  initDatabase()
  await new Promise(resolve => setTimeout(resolve, 100))

  // Draco's info
  const dracoWallet = '0xfae49c32F17c85b3B9AA7c29527a6467cb63463F'
  const dracoTelegramId = 1071402712

  console.log('📋 Draco Information:')
  console.log('-'.repeat(60))
  console.log(`   Telegram ID: ${dracoTelegramId}`)
  console.log(`   Wallet: ${dracoWallet}`)
  console.log('')

  // Test 1: Check if we can find draco's Telegram ID
  console.log('📋 Test 1: Lookup Telegram ID')
  console.log('-'.repeat(60))
  const telegramId = await getTelegramIdFromAddress(dracoWallet)
  if (telegramId === dracoTelegramId) {
    console.log(`✅ Found Telegram ID: ${telegramId}`)
  } else {
    console.log(`❌ Mismatch! Got ${telegramId}, expected ${dracoTelegramId}`)
  }
  console.log('')

  // Test 2: Find recent payments to draco
  const { dbAll } = await import('../services/database.js')
  const recentPayments = await dbAll(
    'SELECT tx_hash, from_username, to_username, to_address, amount, created_at FROM payments WHERE LOWER(to_username) = "draco" ORDER BY created_at DESC LIMIT 3'
  )

  console.log('📋 Test 2: Recent Payments to Draco')
  console.log('-'.repeat(60))
  if (recentPayments.length > 0) {
    console.log(`Found ${recentPayments.length} recent payment(s):`)
    for (const payment of recentPayments) {
      console.log(`\n  Transaction: ${payment.tx_hash}`)
      console.log(`  From: @${payment.from_username}`)
      console.log(`  Amount: $${payment.amount}`)
      console.log(`  To Address (DB): ${payment.to_address}`)
      console.log(`  Expected: ${dracoWallet}`)
      console.log(`  Match: ${payment.to_address?.toLowerCase() === dracoWallet.toLowerCase() ? '✅' : '❌'}`)
      
      // Test parsing the transaction
      console.log(`\n  Testing notification for this transaction...`)
      try {
        const paymentData = await parsePaymentFromReceipt(payment.tx_hash)
        if (paymentData) {
          console.log(`  ✅ Payment event found:`)
          console.log(`     From: ${paymentData.from}`)
          console.log(`     To: ${paymentData.to}`)
          console.log(`     To (lowercase): ${paymentData.to.toLowerCase()}`)
          console.log(`     Expected: ${dracoWallet.toLowerCase()}`)
          console.log(`     Match: ${paymentData.to.toLowerCase() === dracoWallet.toLowerCase() ? '✅' : '❌'}`)
          console.log(`     Amount: ${paymentData.amount}`)
          console.log(`     From Username: ${paymentData.fromUsername || 'N/A'}`)
          console.log(`     To Username: ${paymentData.toUsername || 'N/A'}`)
          
          // Check if we can find Telegram ID from on-chain address
          const onChainTelegramId = await getTelegramIdFromAddress(paymentData.to)
          console.log(`     Telegram ID from on-chain address: ${onChainTelegramId || 'NOT FOUND'}`)
          
          if (onChainTelegramId === dracoTelegramId) {
            console.log(`  ✅ Would send notification to draco!`)
          } else {
            console.log(`  ❌ Cannot send notification - Telegram ID mismatch`)
          }
        } else {
          console.log(`  ⚠️  No PaymentSent event found in transaction`)
          console.log(`     This could mean:`)
          console.log(`     - Transaction is still pending`)
          console.log(`     - Transaction failed`)
          console.log(`     - Wrong SEND_CASH contract address in config`)
        }
      } catch (error) {
        console.log(`  ❌ Error parsing transaction: ${error.message}`)
      }
    }
  } else {
    console.log('⚠️  No recent payments found to draco')
  }
  console.log('')

  // Test 3: Try to send notification for most recent payment
  if (recentPayments.length > 0 && process.env.TELEGRAM_BOT_TOKEN) {
    console.log('📋 Test 3: Attempt to Send Notification')
    console.log('-'.repeat(60))
    const latestPayment = recentPayments[0]
    console.log(`Testing with transaction: ${latestPayment.tx_hash}`)
    
    try {
      const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false })
      const notified = await checkAndNotifyPayment(bot, latestPayment.tx_hash, 3, 3000)
      
      if (notified) {
        console.log('✅ Notification sent successfully!')
        console.log(`   Check draco's Telegram (ID: ${dracoTelegramId}) for the notification`)
      } else {
        console.log('❌ Notification failed')
        console.log('   Check the logs above for details')
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`)
    }
  } else {
    console.log('⚠️  Skipping notification test (no payments or no bot token)')
  }
  console.log('')

  // Summary
  console.log('='.repeat(60))
  console.log('📊 Summary')
  console.log('='.repeat(60))
  console.log('')
  console.log('💡 Common reasons notifications fail:')
  console.log('   1. Transaction to_address in DB doesn\'t match user wallet')
  console.log('   2. On-chain event has different recipient address')
  console.log('   3. Transaction is still pending (not confirmed)')
  console.log('   4. PaymentSent event not found (wrong contract address)')
  console.log('   5. User hasn\'t started a chat with the bot')
  console.log('')
}

testDracoNotification()
  .then(() => {
    console.log('✅ Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })



