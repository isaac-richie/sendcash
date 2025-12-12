import dotenv from 'dotenv'
dotenv.config()

import express from 'express'
import cors from 'cors'
import TelegramBot from 'node-telegram-bot-api'
// Use Supabase database service (automatically falls back to SQLite if env vars not set)
import { initDatabase } from './services/databaseSupabase.js'
import { usernameRoutes } from './routes/username.js'
import { paymentRoutes } from './routes/payment.js'
import { transactionRoutes } from './routes/transactions.js'
// import { botHandlers } from './bot/handlers.js' // Disabled - using Sender AI
import { senderBotHandlers } from './bot/senderHandlers.js'
import { getPaymentScheduler } from './services/paymentSchedulerCron.js'
import { registerBot } from './services/botRegistry.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5001
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

// Middleware
app.use(cors())
app.use(express.json())

// Initialize database
initDatabase()

// Routes
app.use('/api/username', usernameRoutes)
app.use('/api/payment', paymentRoutes)
app.use('/api/transactions', transactionRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Initialize Telegram Bot
let bot = null
if (TELEGRAM_BOT_TOKEN) {
  bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true })
  
  // Set bot commands menu (appears when user types "/")
  const commands = [
    { command: 'start', description: '🚀 Start chatting with Sender AI' }
  ]
  
  bot.setMyCommands(commands).then(() => {
    console.log('✅ Bot commands menu set successfully')
  }).catch(err => {
    console.error('Error setting bot commands:', err)
  })
  
  // Register bot instance for queue workers
  registerBot(bot)
  
  // Register Sender AI bot handlers
  senderBotHandlers(bot)
  
  // Start payment scheduler (cron + queue)
  const scheduler = getPaymentScheduler(bot)
  scheduler.start()
  
  console.log('🤖 Sender AI bot initialized')
  console.log(`[Sender] Ready to chat! Users can now talk naturally with Sender AI`)
  console.log('📅 Payment scheduler started')
} else {
  console.warn('TELEGRAM_BOT_TOKEN not set, bot disabled')
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`API available at http://localhost:${PORT}/api`)
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`⚠️  Port ${PORT} is already in use. HTTP server not started.`)
    console.warn(`   Bot will continue running, but API endpoints won't be available.`)
    console.warn(`   To fix: Stop the process using port ${PORT} or set a different PORT in .env`)
    console.warn(`   Find what's using port ${PORT}: lsof -ti:${PORT}`)
    // Don't exit - let the bot continue running
  } else {
    console.error('Server error:', err)
    // Only exit on non-port errors
    process.exit(1)
  }
})

export { bot }

