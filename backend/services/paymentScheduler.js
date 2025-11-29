/**
 * Payment Scheduler Service
 * Manages scheduled payments and executes them automatically
 */

import { dbGet, dbAll, dbRun } from './database.js'
import { executePayment } from './aiActions.js'

/**
 * Payment Scheduler Class
 * Handles scheduled payment execution and management
 */
class PaymentScheduler {
  constructor(bot) {
    this.bot = bot
    this.intervalId = null
    this.isRunning = false
    this.checkInterval = 60000 // Check every 60 seconds
  }

  /**
   * Start the scheduler (runs in background)
   */
  start() {
    if (this.isRunning) {
      console.log('[PaymentScheduler] Scheduler is already running')
      return
    }

    console.log('[PaymentScheduler] Starting payment scheduler...')
    this.isRunning = true

    // Check immediately on start
    this.checkAndProcessScheduledPayments()

    // Then check periodically
    this.intervalId = setInterval(() => {
      this.checkAndProcessScheduledPayments()
    }, this.checkInterval)

    console.log(`[PaymentScheduler] Scheduler started (checking every ${this.checkInterval / 1000} seconds)`)
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isRunning = false
    console.log('[PaymentScheduler] Scheduler stopped')
  }

  /**
   * Check for due payments and process them
   */
  async checkAndProcessScheduledPayments() {
    try {
      const now = Math.floor(Date.now() / 1000)
      
      // Get all pending payments that are due (scheduled_for <= now)
      const duePayments = await dbAll(
        `SELECT * FROM scheduled_payments 
         WHERE status = 'pending' 
         AND scheduled_for <= ?
         ORDER BY scheduled_for ASC
         LIMIT 10`,
        [now]
      )

      if (duePayments.length === 0) {
        return // No payments due
      }

      console.log(`[PaymentScheduler] Found ${duePayments.length} payment(s) due for execution`)

      // Process each due payment
      for (const payment of duePayments) {
        await this.executeScheduledPayment(payment)
      }
    } catch (error) {
      console.error('[PaymentScheduler] Error checking scheduled payments:', error)
    }
  }

  /**
   * Execute a scheduled payment
   * @param {Object} payment - Scheduled payment record from database
   */
  async executeScheduledPayment(payment) {
    const { id, user_id, recipient_username, amount, token_symbol, memo } = payment

    try {
      console.log(`[PaymentScheduler] Executing scheduled payment #${id}: $${amount} ${token_symbol} to @${recipient_username}`)

      // Mark as processing
      await dbRun(
        'UPDATE scheduled_payments SET status = ? WHERE id = ?',
        ['processing', id]
      )

      // Execute the payment
      const result = await executePayment(
        user_id,
        recipient_username,
        amount,
        token_symbol,
        this.bot,
        memo
      )

      if (result.success) {
        // Payment succeeded - mark as completed
        await dbRun(
          'UPDATE scheduled_payments SET status = ?, tx_hash = ? WHERE id = ?',
          ['completed', result.txHash || null, id]
        )

        // Notify user
        if (this.bot) {
          try {
            await this.bot.sendMessage(
              user_id,
              `✅ **Scheduled Payment Executed**\n\n` +
              `Your scheduled payment has been sent:\n` +
              `• To: @${recipient_username}\n` +
              `• Amount: $${amount} ${token_symbol}\n` +
              (result.txHash ? `• Transaction: \`${result.txHash}\`\n` : '') +
              (memo ? `• Note: ${memo}\n` : ''),
              { parse_mode: 'Markdown' }
            )
          } catch (notifyError) {
            console.error(`[PaymentScheduler] Failed to notify user ${user_id}:`, notifyError.message)
          }
        }

        console.log(`[PaymentScheduler] ✅ Payment #${id} executed successfully`)
      } else {
        // Payment failed - mark as failed
        await dbRun(
          'UPDATE scheduled_payments SET status = ? WHERE id = ?',
          ['failed', id]
        )

        // Notify user of failure
        if (this.bot) {
          try {
            await this.bot.sendMessage(
              user_id,
              `❌ **Scheduled Payment Failed**\n\n` +
              `Your scheduled payment could not be executed:\n` +
              `• To: @${recipient_username}\n` +
              `• Amount: $${amount} ${token_symbol}\n` +
              `• Error: ${result.message || 'Unknown error'}\n\n` +
              `You can try scheduling it again or send it manually.`,
              { parse_mode: 'Markdown' }
            )
          } catch (notifyError) {
            console.error(`[PaymentScheduler] Failed to notify user ${user_id}:`, notifyError.message)
          }
        }

        console.error(`[PaymentScheduler] ❌ Payment #${id} failed:`, result.message)
      }
    } catch (error) {
      console.error(`[PaymentScheduler] Error executing payment #${id}:`, error)
      
      // Mark as failed
      try {
        await dbRun(
          'UPDATE scheduled_payments SET status = ? WHERE id = ?',
          ['failed', id]
        )
      } catch (updateError) {
        console.error(`[PaymentScheduler] Failed to update payment status:`, updateError)
      }

      // Notify user
      if (this.bot) {
        try {
          await this.bot.sendMessage(
            user_id,
            `❌ **Scheduled Payment Error**\n\n` +
            `An error occurred while executing your scheduled payment:\n` +
            `• To: @${recipient_username}\n` +
            `• Amount: $${amount} ${token_symbol}\n` +
            `• Error: ${error.message}\n\n` +
            `Please try scheduling it again or contact support.`,
            { parse_mode: 'Markdown' }
          )
        } catch (notifyError) {
          console.error(`[PaymentScheduler] Failed to notify user:`, notifyError.message)
        }
      }
    }
  }

  /**
   * Get scheduled payments for a user
   * @param {number} userId - Telegram user ID
   * @param {string} status - Filter by status ('pending', 'completed', 'failed', 'cancelled', or null for all)
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
      console.error('[PaymentScheduler] Error getting scheduled payments:', error)
      return []
    }
  }

  /**
   * Cancel a scheduled payment
   * @param {number} userId - Telegram user ID
   * @param {number} paymentId - Scheduled payment ID
   * @returns {Promise<Object>} Result object with success and message
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

      // Cancel the payment
      await dbRun(
        'UPDATE scheduled_payments SET status = ? WHERE id = ?',
        ['cancelled', paymentId]
      )

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
      console.error('[PaymentScheduler] Error cancelling scheduled payment:', error)
      return {
        success: false,
        message: `❌ Failed to cancel scheduled payment. Please try again.`
      }
    }
  }
}

/**
 * Get or create payment scheduler instance
 * @param {Object} bot - Telegram bot instance
 * @returns {PaymentScheduler} Scheduler instance
 */
let schedulerInstance = null

export const getPaymentScheduler = (bot) => {
  if (!schedulerInstance) {
    schedulerInstance = new PaymentScheduler(bot)
  }
  return schedulerInstance
}


