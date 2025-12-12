/**
 * Payment Queue Service
 * Uses Bull queue for robust payment processing with retries, priorities, and monitoring
 */

import Queue from 'bull'
import { dbGet, dbRun } from './database.js'
import { executePayment } from './aiActions.js'
import { getBot } from './botRegistry.js'

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for Bull
  enableReadyCheck: false
}

// If REDIS_URL is provided, use it instead
if (process.env.REDIS_URL) {
  redisConfig.host = undefined
  redisConfig.port = undefined
}

/**
 * Create payment queue
 * Queue name: 'payment-processing'
 */
export const paymentQueue = new Queue('payment-processing', {
  redis: process.env.REDIS_URL || redisConfig,
  defaultJobOptions: {
    attempts: 3, // Retry failed jobs 3 times
    backoff: {
      type: 'exponential', // Exponential backoff
      delay: 2000 // Start with 2 seconds
    },
    removeOnComplete: {
      age: 3600, // Keep completed jobs for 1 hour
      count: 1000 // Keep last 1000 completed jobs
    },
    removeOnFail: {
      age: 86400 // Keep failed jobs for 24 hours
    }
  }
})

/**
 * Payment Queue Event Handlers
 */

// Job completed
paymentQueue.on('completed', (job, result) => {
  console.log(`[PaymentQueue] ✅ Job ${job.id} completed: Payment #${job.data.paymentId}`)
})

// Job failed
paymentQueue.on('failed', (job, err) => {
  console.error(`[PaymentQueue] ❌ Job ${job.id} failed: Payment #${job.data.paymentId}`, err.message)
})

// Job progress
paymentQueue.on('progress', (job, progress) => {
  console.log(`[PaymentQueue] 📊 Job ${job.id} progress: ${progress}%`)
})

// Queue errors
paymentQueue.on('error', (error) => {
  console.error('[PaymentQueue] Queue error:', error)
  if (error.message.includes('ECONNREFUSED') || error.message.includes('connect')) {
    console.error('[PaymentQueue] ⚠️  Redis connection failed. Make sure Redis is running.')
    console.error('[PaymentQueue] Install Redis: brew install redis (macOS) or apt-get install redis (Linux)')
    console.error('[PaymentQueue] Start Redis: redis-server')
  }
})

// Queue ready
paymentQueue.on('ready', () => {
  console.log('[PaymentQueue] ✅ Queue connected to Redis and ready')
})

/**
 * Process payment job
 * This is the worker function that processes each payment
 */
export const processPaymentJob = async (job) => {
  const { paymentId, userId, recipientUsername, amount, tokenSymbol, memo } = job.data

  try {
    console.log(`[PaymentQueue] Processing payment job ${job.id}: Payment #${paymentId}`)
    
    // Update job progress
    await job.progress(10)

    // Get payment record from database
    const payment = await dbGet(
      'SELECT * FROM scheduled_payments WHERE id = ?',
      [paymentId]
    )

    if (!payment) {
      throw new Error(`Payment #${paymentId} not found`)
    }

    if (payment.status !== 'pending' && payment.status !== 'processing') {
      throw new Error(`Payment #${paymentId} is not in a processable state: ${payment.status}`)
    }

    await job.progress(30)

    // Mark as processing
    await dbRun(
      'UPDATE scheduled_payments SET status = ? WHERE id = ?',
      ['processing', paymentId]
    )

    await job.progress(50)

    // Execute the payment
    // Get bot instance from registry
    const bot = getBot()
    
    const result = await executePayment(
      userId,
      recipientUsername,
      amount,
      tokenSymbol,
      bot,
      memo
    )

    await job.progress(80)

    if (result.success) {
      // Payment succeeded
      await dbRun(
        'UPDATE scheduled_payments SET status = ?, tx_hash = ? WHERE id = ?',
        ['completed', result.txHash || null, paymentId]
      )

      await job.progress(100)

      // Notify user of success
      const bot = getBot()
      if (bot) {
        try {
          await bot.sendMessage(
            userId,
            `✅ **Scheduled Payment Executed**\n\n` +
            `Your scheduled payment has been sent:\n` +
            `• To: @${recipientUsername}\n` +
            `• Amount: $${amount} ${tokenSymbol}\n` +
            (result.txHash ? `• Transaction: \`${result.txHash}\`\n` : '') +
            (memo ? `• Note: ${memo}\n` : ''),
            { parse_mode: 'Markdown' }
          )
        } catch (notifyError) {
          console.error(`[PaymentQueue] Failed to notify user ${userId}:`, notifyError.message)
        }
      }

      return {
        success: true,
        paymentId,
        txHash: result.txHash,
        message: 'Payment executed successfully'
      }
    } else {
      // Payment failed
      await dbRun(
        'UPDATE scheduled_payments SET status = ? WHERE id = ?',
        ['failed', paymentId]
      )

      throw new Error(result.message || 'Payment execution failed')
    }
  } catch (error) {
    console.error(`[PaymentQueue] Error processing payment #${paymentId}:`, error)
    
    // Mark as failed (only on final attempt)
    const attemptsMade = job.attemptsMade || 0
    const maxAttempts = job.opts.attempts || 3
    
    if (attemptsMade >= maxAttempts - 1) {
      // Final attempt failed - mark as failed
      try {
        await dbRun(
          'UPDATE scheduled_payments SET status = ? WHERE id = ?',
          ['failed', paymentId]
        )

        // Notify user of failure
        const bot = getBot()
        if (bot) {
          try {
            await bot.sendMessage(
              userId,
              `❌ **Scheduled Payment Failed**\n\n` +
              `Your scheduled payment could not be executed after ${maxAttempts} attempts:\n` +
              `• To: @${recipientUsername}\n` +
              `• Amount: $${amount} ${tokenSymbol}\n` +
              `• Error: ${error.message || 'Unknown error'}\n\n` +
              `You can try scheduling it again or send it manually.`,
              { parse_mode: 'Markdown' }
            )
          } catch (notifyError) {
            console.error(`[PaymentQueue] Failed to notify user ${userId}:`, notifyError.message)
          }
        }
      } catch (updateError) {
        console.error(`[PaymentQueue] Failed to update payment status:`, updateError)
      }
    }

    throw error // Re-throw to trigger Bull's retry mechanism
  }
}

/**
 * Add payment to queue
 * @param {Object} payment - Payment data
 * @returns {Promise<Object>} Job object
 */
export const addPaymentToQueue = async (payment) => {
  const { id, user_id, recipient_username, amount, token_symbol, memo, scheduled_for } = payment

  // Calculate delay if payment is scheduled for future
  const now = Math.floor(Date.now() / 1000)
  const delay = scheduled_for > now ? (scheduled_for - now) * 1000 : 0

  // Priority: earlier scheduled payments have higher priority
  const priority = scheduled_for

  const job = await paymentQueue.add(
    {
      paymentId: id,
      userId: user_id,
      recipientUsername: recipient_username,
      amount,
      tokenSymbol: token_symbol,
      memo,
      scheduledFor: scheduled_for,
      // Bot instance is stored in registry, not in job data
    },
    {
      delay, // Delay job execution until scheduled time
      priority, // Higher priority for earlier payments
      jobId: `payment-${id}`, // Unique job ID to prevent duplicates
      removeOnComplete: true,
      removeOnFail: false
    }
  )

  console.log(`[PaymentQueue] Added payment #${id} to queue (Job ID: ${job.id}, Delay: ${delay}ms)`)
  
  return job
}

/**
 * Get queue statistics
 * @returns {Promise<Object>} Queue stats
 */
export const getQueueStats = async () => {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    paymentQueue.getWaitingCount(),
    paymentQueue.getActiveCount(),
    paymentQueue.getCompletedCount(),
    paymentQueue.getFailedCount(),
    paymentQueue.getDelayedCount()
  ])

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    total: waiting + active + completed + failed + delayed
  }
}

/**
 * Clean up queue (remove old jobs)
 */
export const cleanQueue = async () => {
  try {
    await paymentQueue.clean(3600000, 'completed', 1000) // Remove completed jobs older than 1 hour
    await paymentQueue.clean(86400000, 'failed', 100) // Remove failed jobs older than 24 hours
    console.log('[PaymentQueue] Queue cleaned')
  } catch (error) {
    console.error('[PaymentQueue] Error cleaning queue:', error)
  }
}

/**
 * Close queue connection
 */
export const closeQueue = async () => {
  await paymentQueue.close()
  console.log('[PaymentQueue] Queue connection closed')
}

