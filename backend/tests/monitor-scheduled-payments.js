import { dbGet, dbAll } from '../services/database.js'
import { initDatabase } from '../services/database.js'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Monitor Scheduled Payments
 * Watches the database for scheduled payment status changes
 */

const testUserId = 123456789
const checkInterval = 10000 // Check every 10 seconds

async function monitorScheduledPayments() {
  console.log('👀 Monitoring Scheduled Payments\n')
  console.log('='.repeat(60))
  console.log('Press Ctrl+C to stop monitoring\n')

  initDatabase()
  await new Promise(resolve => setTimeout(resolve, 100))

  let lastCheck = Date.now()

  const monitor = setInterval(async () => {
    try {
      const now = Math.floor(Date.now() / 1000)
      
      // Get all scheduled payments for test user
      const allPayments = await dbAll(
        'SELECT * FROM scheduled_payments WHERE user_id = ? ORDER BY scheduled_for ASC',
        [testUserId]
      )

      if (allPayments.length === 0) {
        console.log('⏰ No scheduled payments found')
        return
      }

      // Clear screen (optional - comment out if you want to see history)
      // process.stdout.write('\x1B[2J\x1B[0f')

      console.log(`\n⏰ ${new Date().toLocaleString()}`)
      console.log('='.repeat(60))
      console.log(`📊 Scheduled Payments Status:\n`)

      allPayments.forEach((payment, index) => {
        const scheduledDate = new Date(payment.scheduled_for * 1000)
        const timeUntil = payment.scheduled_for - now
        const isDue = timeUntil <= 0

        let statusIcon = '⏳'
        if (payment.status === 'completed') statusIcon = '✅'
        else if (payment.status === 'failed') statusIcon = '❌'
        else if (payment.status === 'cancelled') statusIcon = '🚫'
        else if (payment.status === 'processing') statusIcon = '⚙️'
        else if (isDue) statusIcon = '🔔'

        const days = Math.floor(Math.abs(timeUntil) / 86400)
        const hours = Math.floor((Math.abs(timeUntil) % 86400) / 3600)
        const minutes = Math.floor((Math.abs(timeUntil) % 3600) / 60)

        let timeStr = ''
        if (isDue) {
          timeStr = `DUE NOW (${Math.abs(minutes)}m ago)`
        } else {
          if (days > 0) timeStr += `${days}d `
          if (hours > 0) timeStr += `${hours}h `
          if (minutes > 0) timeStr += `${minutes}m`
          if (!timeStr) timeStr = 'Due now'
        }

        console.log(`${index + 1}. ${statusIcon} Payment #${payment.id}`)
        console.log(`   To: @${payment.recipient_username}`)
        console.log(`   Amount: $${payment.amount} ${payment.token_symbol}`)
        console.log(`   Scheduled: ${scheduledDate.toLocaleString()}`)
        console.log(`   Time until: ${timeStr}`)
        console.log(`   Status: ${payment.status}`)
        if (payment.tx_hash) {
          console.log(`   TX: ${payment.tx_hash.slice(0, 16)}...`)
        }
        console.log('')
      })

      // Check for status changes
      const pendingPayments = allPayments.filter(p => p.status === 'pending' && p.scheduled_for <= now)
      if (pendingPayments.length > 0) {
        console.log(`⚠️  ${pendingPayments.length} payment(s) are due and should be processed by the scheduler`)
        console.log('   (The scheduler runs every minute)\n')
      }

      // Check for newly completed payments
      const completedPayments = allPayments.filter(p => p.status === 'completed')
      if (completedPayments.length > 0) {
        console.log(`✅ ${completedPayments.length} payment(s) completed!\n`)
      }

      // Check for failed payments
      const failedPayments = allPayments.filter(p => p.status === 'failed')
      if (failedPayments.length > 0) {
        console.log(`❌ ${failedPayments.length} payment(s) failed\n`)
      }

    } catch (error) {
      console.error('❌ Error monitoring payments:', error)
    }
  }, checkInterval)

  // Initial check
  console.log('Starting monitoring...\n')
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n👋 Stopping monitor...')
    clearInterval(monitor)
    process.exit(0)
  })
}

monitorScheduledPayments().catch(error => {
  console.error('❌ Monitor failed:', error)
  process.exit(1)
})



