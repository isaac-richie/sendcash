/**
 * Payment Scheduler with Cron + Queue
 * Uses node-cron for precise scheduling and Bull queue for robust job processing
 */

import cron from 'node-cron'
import { dbAll, dbGet, dbRun } from './database.js'
import { addPaymentToQueue, paymentQueue, processPaymentJob } from './paymentQueue.js'

/**
 * Payment Scheduler with Cron + Queue
 */
class PaymentSchedulerCron {
  constructor(bot) {
    this.bot = bot
    this.cronJob = null
    this.isRunning = false
    this.processedPayments = new Set() // Track processed payments to avoid duplicates
  }

  /**
   * Start the scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[PaymentSchedulerCron] Scheduler is already running')
      return
    }

    console.log('[PaymentSchedulerCron] Starting cron-based payment scheduler...')
    this.isRunning = true

    // Set up payment queue processor
    this.setupQueueProcessor()

    // Set up cron job to discover and enqueue due payments
    // Runs every minute at :00 seconds
    this.cronJob = cron.schedule('* * * * *', async () => {
      await this.discoverAndEnqueuePayments()
    }, {
      scheduled: true,
      timezone: 'UTC'
    })

    // Run immediately on start
    this.discoverAndEnqueuePayments()

    console.log('[PaymentSchedulerCron] ✅ Cron scheduler started (runs every minute)')
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.cronJob) {
      this.cronJob.stop()
      this.cronJob = null
    }
    this.isRunning = false
    console.log('[PaymentSchedulerCron] Scheduler stopped')
  }

  /**
   * Set up queue processor (worker)
   * This processes jobs from the queue
   */
  setupQueueProcessor() {
    // Process jobs with concurrency of 3 (3 payments processed in parallel)
    paymentQueue.process(3, async (job) => {
      return await processPaymentJob(job)
    })

    console.log('[PaymentSchedulerCron] Queue processor set up (concurrency: 3)')
  }

  /**
   * Discover due payments and enqueue them
   * This runs every minute via cron
   */
  async discoverAndEnqueuePayments() {
    try {
      const now = Math.floor(Date.now() / 1000)
      
      // Get all pending payments that are due (scheduled_for <= now)
      const duePayments = await dbAll(
        `SELECT * FROM scheduled_payments 
         WHERE status = 'pending' 
         AND scheduled_for <= ?
         ORDER BY scheduled_for ASC
         LIMIT 50`,
        [now]
      )

      if (duePayments.length === 0) {
        return // No payments due
      }

      console.log(`[PaymentSchedulerCron] Found ${duePayments.length} payment(s) due for execution`)

      // Enqueue each payment
      let enqueued = 0
      for (const payment of duePayments) {
        // Skip if already processed
        if (this.processedPayments.has(payment.id)) {
          continue
        }

        try {
          await addPaymentToQueue(payment)
          this.processedPayments.add(payment.id)
          enqueued++

          // Clean up old processed IDs (keep last 1000)
          if (this.processedPayments.size > 1000) {
            const idsArray = Array.from(this.processedPayments)
            this.processedPayments = new Set(idsArray.slice(-500))
          }
        } catch (error) {
          console.error(`[PaymentSchedulerCron] Failed to enqueue payment #${payment.id}:`, error)
        }
      }

      if (enqueued > 0) {
        console.log(`[PaymentSchedulerCron] ✅ Enqueued ${enqueued} payment(s)`)
      }
    } catch (error) {
      console.error('[PaymentSchedulerCron] Error discovering payments:', error)
    }
  }

  /**
   * Get scheduled payments for a user
   * @param {number} userId - Telegram user ID
   * @param {string} status - Filter by status
   * @returns {Promise<Array>} Array of scheduled payment records
   */
  async getScheduledPayments(userId, status = null) {
    try {
      let query = 'SELECT * FROM scheduled_payments WHERE user_id = ?'
      const params = [userId]

      if (status) {
        query += ' AND status = ?'
        params.push(status)
      }

      query += ' ORDER BY scheduled_for ASC'

      const payments = await dbAll(query, params)
      return payments
    } catch (error) {
      console.error('[PaymentSchedulerCron] Error getting scheduled payments:', error)
      return []
    }
  }

  /**
   * Cancel a scheduled payment
   * Also removes it from queue if it's queued
   * @param {number} userId - Telegram user ID
   * @param {number} paymentId - Scheduled payment ID
   * @returns {Promise<Object>} Result object
   */
  async cancelScheduledPayment(userId, paymentId) {
    try {
      // Verify the payment exists and belongs to the user
      const payment = await dbGet(
        'SELECT * FROM scheduled_payments WHERE id = ? AND user_id = ?',
        [paymentId, userId]
      )

      if (!payment) {
        return {
          success: false,
          message: `❌ Scheduled payment #${paymentId} not found or doesn't belong to you.`
        }
      }

      if (payment.status !== 'pending') {
        return {
          success: false,
          message: `❌ Cannot cancel payment #${paymentId}. Status: ${payment.status}`
        }
      }

      // Try to remove from queue if it exists
      try {
        const job = await paymentQueue.getJob(`payment-${paymentId}`)
        if (job) {
          await job.remove()
          console.log(`[PaymentSchedulerCron] Removed payment #${paymentId} from queue`)
        }
      } catch (queueError) {
        // Job might not exist in queue yet, that's fine
      }

      // Cancel the payment in database
      await dbRun(
        'UPDATE scheduled_payments SET status = ? WHERE id = ?',
        ['cancelled', paymentId]
      )

      // Remove from processed set
      this.processedPayments.delete(paymentId)

      const formattedDate = new Date(payment.scheduled_for * 1000).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })

      return {
        success: true,
        message: `✅ Scheduled payment #${paymentId} cancelled.\n\n` +
          `Payment details:\n` +
          `• To: @${payment.recipient_username}\n` +
          `• Amount: $${payment.amount} ${payment.token_symbol}\n` +
          `• Was scheduled for: ${formattedDate}`
      }
    } catch (error) {
      console.error('[PaymentSchedulerCron] Error cancelling scheduled payment:', error)
      return {
        success: false,
        message: `❌ Failed to cancel scheduled payment. Please try again.`
      }
    }
  }

  /**
   * Get queue statistics
   * @returns {Promise<Object>} Queue stats
   */
  async getQueueStats() {
    const { getQueueStats } = await import('./paymentQueue.js')
    return await getQueueStats()
  }
}

/**
 * Get or create payment scheduler instance
 * @param {Object} bot - Telegram bot instance
 * @returns {PaymentSchedulerCron} Scheduler instance
 */
let schedulerInstance = null

export const getPaymentScheduler = (bot) => {
  if (!schedulerInstance) {
    schedulerInstance = new PaymentSchedulerCron(bot)
  }
  return schedulerInstance
}

