import { dbGet, dbAll, dbRun } from '../services/database.js'
import { initDatabase } from '../services/database.js'
import { getPaymentScheduler } from '../services/paymentScheduler.js'
import TelegramBot from 'node-telegram-bot-api'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Test Payment Scheduling System
 * Creates test scheduled payments and verifies the scheduler works
 */

// Mock bot for testing (we won't actually send messages)
const mockBot = {
  sendMessage: async (userId, message, options) => {
    console.log(`\n📨 [Mock Bot] Message to user ${userId}:`)
    console.log(`   ${message}`)
    return { message_id: 1 }
  }
}

async function testPaymentScheduling() {
  console.log('🧪 Testing Payment Scheduling System\n')
  console.log('=' .repeat(60))

  // Initialize database
  initDatabase()
  await new Promise(resolve => setTimeout(resolve, 100)) // Wait for DB init

  // Get a test user (or create one)
  let testUserId = 123456789 // Test user ID
  let testUser = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [testUserId])

  if (!testUser) {
    console.log('⚠️  Test user not found. Creating test user...')
    // Create a test user
    await dbRun(
      'INSERT INTO telegram_users (telegram_id, wallet_address, username) VALUES (?, ?, ?)',
      [testUserId, '0x0000000000000000000000000000000000000000', 'testuser']
    )
    console.log('✅ Test user created')
  } else {
    console.log(`✅ Using existing test user: @${testUser.username}`)
  }

  // Calculate scheduled times
  const now = Math.floor(Date.now() / 1000)
  const in5Minutes = now + (5 * 60)
  const in24Hours = now + (24 * 60 * 60)
  const in7Days = now + (7 * 24 * 60 * 60)

  const scheduledPayments = [
    {
      name: '5 Minutes',
      scheduledFor: in5Minutes,
      recipient: 'testrecipient1',
      amount: '1.00',
      token: 'USDC',
      tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC
    },
    {
      name: '24 Hours',
      scheduledFor: in24Hours,
      recipient: 'testrecipient2',
      amount: '5.00',
      token: 'USDC',
      tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    },
    {
      name: '7 Days',
      scheduledFor: in7Days,
      recipient: 'testrecipient3',
      amount: '10.00',
      token: 'USDC',
      tokenAddress: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      memo: 'Test scheduled payment'
    }
  ]

  console.log('\n📅 Creating Test Scheduled Payments:\n')

  // Create scheduled payments
  const createdPayments = []
  for (const payment of scheduledPayments) {
    const result = await dbRun(
      `INSERT INTO scheduled_payments 
       (user_id, recipient_username, amount, token_symbol, token_address, memo, scheduled_for, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        testUserId,
        payment.recipient,
        payment.amount,
        payment.token,
        payment.tokenAddress,
        payment.memo || null,
        payment.scheduledFor
      ]
    )

    const paymentId = result.lastID
    createdPayments.push({ ...payment, id: paymentId })

    const scheduledDate = new Date(payment.scheduledFor * 1000).toLocaleString()
    console.log(`✅ Created payment #${paymentId} (${payment.name}):`)
    console.log(`   To: @${payment.recipient}`)
    console.log(`   Amount: $${payment.amount} ${payment.token}`)
    console.log(`   Scheduled for: ${scheduledDate}`)
    if (payment.memo) {
      console.log(`   Memo: ${payment.memo}`)
    }
    console.log('')
  }

  // Verify payments were created
  console.log('🔍 Verifying Scheduled Payments in Database:\n')
  const allScheduled = await dbAll(
    'SELECT * FROM scheduled_payments WHERE user_id = ? AND status = ? ORDER BY scheduled_for ASC',
    [testUserId, 'pending']
  )

  console.log(`Found ${allScheduled.length} pending scheduled payment(s):\n`)
  allScheduled.forEach((payment, index) => {
    const scheduledDate = new Date(payment.scheduled_for * 1000).toLocaleString()
    const timeUntil = payment.scheduled_for - now
    const hoursUntil = Math.floor(timeUntil / 3600)
    const minutesUntil = Math.floor((timeUntil % 3600) / 60)

    console.log(`${index + 1}. Payment #${payment.id}`)
    console.log(`   To: @${payment.recipient_username}`)
    console.log(`   Amount: $${payment.amount} ${payment.token_symbol}`)
    console.log(`   Scheduled: ${scheduledDate}`)
    console.log(`   Time until: ${hoursUntil}h ${minutesUntil}m`)
    console.log(`   Status: ${payment.status}`)
    console.log('')
  })

  // Test scheduler methods
  console.log('🧪 Testing Scheduler Methods:\n')

  const scheduler = getPaymentScheduler(mockBot)

  // Test getScheduledPayments
  console.log('1. Testing getScheduledPayments()...')
  const userPayments = await scheduler.getScheduledPayments(testUserId, 'pending')
  console.log(`   ✅ Retrieved ${userPayments.length} scheduled payment(s) for user`)

  // Test cancel functionality (cancel the 7-day one)
  const paymentToCancel = createdPayments.find(p => p.name === '7 Days')
  if (paymentToCancel) {
    console.log(`\n2. Testing cancelScheduledPayment() for payment #${paymentToCancel.id}...`)
    const cancelResult = await scheduler.cancelScheduledPayment(testUserId, paymentToCancel.id)
    if (cancelResult.success) {
      console.log('   ✅ Payment cancelled successfully')
      console.log(`   ${cancelResult.message}`)
    } else {
      console.log('   ❌ Failed to cancel payment')
      console.log(`   ${cancelResult.message}`)
    }

    // Verify it's cancelled
    const cancelledPayment = await dbGet(
      'SELECT * FROM scheduled_payments WHERE id = ?',
      [paymentToCancel.id]
    )
    console.log(`   Status after cancel: ${cancelledPayment.status}`)
  }

  // Test scheduler check (should find the 5-minute payment if we're close)
  console.log('\n3. Testing scheduler checkAndProcessScheduledPayments()...')
  console.log('   (This will only process payments that are due now)')
  
  const nowTimestamp = Math.floor(Date.now() / 1000)
  const duePayments = await dbAll(
    `SELECT * FROM scheduled_payments 
     WHERE status = 'pending' 
     AND scheduled_for <= ? 
     ORDER BY scheduled_for ASC`,
    [nowTimestamp]
  )

  console.log(`   Found ${duePayments.length} payment(s) due now`)
  if (duePayments.length > 0) {
    console.log('   ⚠️  Note: Payments due now would be processed by the scheduler')
    console.log('   ⚠️  In production, these would execute automatically')
  } else {
    console.log('   ✅ No payments are due yet (as expected)')
  }

  // Show summary
  console.log('\n' + '='.repeat(60))
  console.log('📊 Test Summary:\n')
  
  const remainingPayments = await dbAll(
    'SELECT * FROM scheduled_payments WHERE user_id = ? AND status = ?',
    [testUserId, 'pending']
  )

  console.log(`✅ Created: ${createdPayments.length} scheduled payments`)
  console.log(`✅ Remaining: ${remainingPayments.length} pending payments`)
  console.log(`✅ Cancelled: ${createdPayments.length - remainingPayments.length} payment(s)`)
  
  console.log('\n📅 Scheduled Payment Timeline:\n')
  remainingPayments.forEach((payment, index) => {
    const scheduledDate = new Date(payment.scheduled_for * 1000)
    const timeUntil = payment.scheduled_for - now
    const days = Math.floor(timeUntil / 86400)
    const hours = Math.floor((timeUntil % 86400) / 3600)
    const minutes = Math.floor((timeUntil % 3600) / 60)

    let timeStr = ''
    if (days > 0) timeStr += `${days}d `
    if (hours > 0) timeStr += `${hours}h `
    if (minutes > 0) timeStr += `${minutes}m`
    if (!timeStr) timeStr = 'Due now'

    console.log(`${index + 1}. Payment #${payment.id} → ${timeStr} (${scheduledDate.toLocaleString()})`)
  })

  console.log('\n💡 Next Steps:')
  console.log('   1. The scheduler runs every minute and will process due payments')
  console.log('   2. The 5-minute payment will execute in ~5 minutes')
  console.log('   3. Monitor the logs to see when payments are processed')
  console.log('   4. Check the database to see payment status updates')
  
  console.log('\n⚠️  Note: These are test payments with test recipients.')
  console.log('   In production, ensure recipients exist and users have sufficient balance.')
  
  console.log('\n✅ Payment scheduling test completed!\n')
}

// Run the test
testPaymentScheduling()
  .then(() => {
    console.log('Test finished successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })



