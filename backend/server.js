import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import TelegramBot from 'node-telegram-bot-api'
import { initDatabase } from './services/database.js'
import { usernameRoutes } from './routes/username.js'
import { paymentRoutes } from './routes/payment.js'
import { transactionRoutes } from './routes/transactions.js'
// import { botHandlers } from './bot/handlers.js' // Disabled - using Sender AI
import { senderBotHandlers } from './bot/senderHandlers.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000
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
  
  // Register Sender AI bot handlers
  senderBotHandlers(bot)
  
  console.log('🤖 Sender AI bot initialized')
  console.log(`[Sender] Ready to chat! Users can now talk naturally with Sender AI`)
} else {
  console.warn('TELEGRAM_BOT_TOKEN not set, bot disabled')
}

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`API available at http://localhost:${PORT}/api`)
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use.`)
    console.error(`   Please either:`)
    console.error(`   1. Stop the process using port ${PORT}`)
    console.error(`   2. Or set a different PORT in .env file`)
    console.error(`\n   To find what's using port ${PORT}, run:`)
    console.error(`   lsof -ti:${PORT}`)
    process.exit(1)
  } else {
    console.error('Server error:', err)
    process.exit(1)
  }
})

export { bot }

