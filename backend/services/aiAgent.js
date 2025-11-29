import { ethers } from 'ethers'
import { BASE_RPC, CONTRACTS, TOKENS } from './config.js'
import { dbGet, dbAll, dbRun } from './database.js'
import { getTokenBalance } from './wallet.js'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import { getUserFriendlyError } from './errorMessages.js'
import { executePayment, executeRegisterUsername, executeSchedulePayment, executeViewScheduledPayments, executeCancelScheduledPayment } from './aiActions.js'
import { getPaymentStatistics, generateTransactionReport, formatStatisticsMessage, formatReportMessage, generateReportInsights } from './analytics.js'

dotenv.config()

/**
 * AI Agent for SendCash
 * Understands on-chain activities and provides intelligent insights
 * Integrated with OpenAI for natural language processing
 */

class SendCashAI {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(BASE_RPC)
    this.initialized = false
    this.openai = null
    this.pendingActions = new Map() // Store pending actions for confirmation
    this.pendingSwaps = {} // Store pending swaps for confirmation
    
    // Conversation memory - stores last N messages per user
    this.conversationHistory = new Map() // userId -> [{ role, content, timestamp }, ...]
    this.maxConversationHistory = 20 // Keep last 20 messages (10 user + 10 assistant)
    this.conversationTimeout = 300000 // 5 minutes - clear history after inactivity
    
    // Caching for performance
    this.cache = {
      balances: new Map(), // wallet address -> { data, timestamp }
      analysis: new Map(), // wallet address -> { data, timestamp }
      intents: new Map(), // message hash -> { intent, timestamp }
      paymentIntents: new Map() // message hash -> { intent, timestamp }
    }
    this.cacheTTL = {
      balances: 60000, // 60 seconds (increased for better cache hit rate)
      analysis: 120000, // 2 minutes (increased)
      intents: 600000, // 10 minutes (increased)
      paymentIntents: 600000 // 10 minutes (increased)
    }
    
    // Request queue for OpenAI API (rate limiting)
    this.openaiQueue = []
    this.processingQueue = false
    this.maxConcurrentOpenAI = 10 // Increased for faster response times
    
    // Initialize OpenAI if API key is available
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      })
      console.log('[AI Agent] OpenAI initialized')
    } else {
      console.warn('[AI Agent] OPENAI_API_KEY not found, LLM features disabled')
    }

    // Auto-cleanup conversation history every 5 minutes
    setInterval(() => {
      this.cleanupOldConversations()
    }, 300000)
  }

  /**
   * Conversation Memory Management
   */
  
  /**
   * Add message to conversation history
   * @param {string} userId - Telegram user ID
   * @param {string} role - 'user' or 'assistant'
   * @param {string} content - Message content
   */
  addToConversationHistory(userId, role, content) {
    if (!this.conversationHistory.has(userId)) {
      this.conversationHistory.set(userId, [])
    }
    
    const history = this.conversationHistory.get(userId)
    history.push({
      role,
      content,
      timestamp: Date.now()
    })
    
    // Keep only last N messages
    if (history.length > this.maxConversationHistory) {
      history.shift() // Remove oldest message
    }
    
    console.log(`[AI Agent] Added to conversation history (user: ${userId}, role: ${role}, total: ${history.length})`)
  }
  
  /**
   * Get conversation history for a user
   * @param {string} userId - Telegram user ID
   * @returns {Array} Array of { role, content, timestamp }
   */
  getConversationHistory(userId) {
    const history = this.conversationHistory.get(userId) || []
    
    // Clean up old messages (older than timeout)
    const now = Date.now()
    const activeHistory = history.filter(msg => now - msg.timestamp < this.conversationTimeout)
    
    // Update history if we filtered out old messages
    if (activeHistory.length !== history.length) {
      this.conversationHistory.set(userId, activeHistory)
    }
    
    return activeHistory
  }
  
  /**
   * Clear conversation history for a user
   * @param {string} userId - Telegram user ID
   */
  clearConversationHistory(userId) {
    this.conversationHistory.delete(userId)
    console.log(`[AI Agent] Cleared conversation history for user ${userId}`)
  }
  
  /**
   * Cleanup old conversations (older than timeout)
   */
  cleanupOldConversations() {
    const now = Date.now()
    let cleaned = 0
    
    for (const [userId, history] of this.conversationHistory.entries()) {
      const activeHistory = history.filter(msg => now - msg.timestamp < this.conversationTimeout)
      if (activeHistory.length !== history.length) {
        this.conversationHistory.set(userId, activeHistory)
        cleaned += history.length - activeHistory.length
      }
      
      // Remove empty histories
      if (activeHistory.length === 0) {
        this.conversationHistory.delete(userId)
      }
    }
    
    if (cleaned > 0) {
      console.log(`[AI Agent] Cleaned up ${cleaned} old conversation messages`)
    }
  }

  /**
   * Cache Management
   */
  
  getCached(key, cacheType) {
    const cached = this.cache[cacheType]?.get(key)
    if (cached && Date.now() - cached.timestamp < this.cacheTTL[cacheType]) {
      return cached.data
    }
    return null
  }
  
  setCache(key, data, cacheType) {
    if (!this.cache[cacheType]) {
      this.cache[cacheType] = new Map()
    }
    this.cache[cacheType].set(key, {
      data,
      timestamp: Date.now()
    })
  }
  
  clearExpiredCache(cacheType) {
    const now = Date.now()
    for (const [key, value] of this.cache[cacheType].entries()) {
      if (now - value.timestamp > this.cacheTTL[cacheType]) {
        this.cache[cacheType].delete(key)
      }
    }
  }

  /**
   * OpenAI Request Queue
   */
  
  async queueOpenAIRequest(requestFn) {
    return new Promise((resolve, reject) => {
      this.openaiQueue.push({ requestFn, resolve, reject })
      this.processQueue()
    })
  }

  /**
   * Process OpenAI queue with concurrency limit
   */
  async processQueue() {
    if (this.processingQueue || this.openaiQueue.length === 0) return
    
    this.processingQueue = true
    
    while (this.openaiQueue.length > 0) {
      const batch = this.openaiQueue.splice(0, this.maxConcurrentOpenAI)
      
      await Promise.all(
        batch.map(async ({ requestFn, resolve, reject }) => {
          try {
            const result = await requestFn()
            resolve(result)
          } catch (error) {
            reject(error)
          }
        })
      )
      
      // Small delay between batches (reduced for faster processing)
      if (this.openaiQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 50))
      }
    }
    
    this.processingQueue = false
  }

  /**
   * Initialize the AI agent
   */
  async initialize() {
    if (this.initialized) return
    
    // Get contract instances
    this.sendCashContract = await this.getSendCashContract()
    this.usernameRegistry = await this.getUsernameRegistry()
    
    this.initialized = true
    console.log('[AI Agent] Initialized and ready')
  }

  /**
   * Get SendCash contract instance
   */
  async getSendCashContract() {
    const { getSendCash } = await import('./contracts.js')
    return getSendCash()
  }

  /**
   * Get UsernameRegistry contract instance
   */
  async getUsernameRegistry() {
    const { getUsernameRegistry } = await import('./contracts.js')
    return getUsernameRegistry()
  }

  /**
   * Analyze on-chain activity for a wallet address
   * @param {string} walletAddress - Wallet address to analyze
   * @returns {Promise<Object>} Activity analysis
   */
  async analyzeWalletActivity(walletAddress) {
    await this.initialize()
    
    try {
      const analysis = {
        address: walletAddress,
        timestamp: Date.now(),
        balances: {},
        recentTransactions: [],
        paymentStats: {
          totalSent: 0,
          totalReceived: 0,
          transactionCount: 0,
          topRecipients: [],
          topSenders: []
        },
        patterns: {
          mostActiveDay: null,
          averageTransactionAmount: 0,
          transactionFrequency: 'low'
        },
        insights: []
      }

      // Get current balances
      analysis.balances = await this.getWalletBalances(walletAddress)

      // Get recent transactions from database
      const transactions = await dbAll(
        `SELECT * FROM payments 
         WHERE LOWER(from_address) = LOWER(?) OR LOWER(to_address) = LOWER(?)
         ORDER BY created_at DESC 
         LIMIT 50`,
        [walletAddress, walletAddress]
      )

      analysis.recentTransactions = transactions
      analysis.paymentStats = await this.calculatePaymentStats(transactions, walletAddress)
      analysis.patterns = await this.analyzePatterns(transactions, walletAddress)
      analysis.insights = await this.generateInsights(analysis)

      return analysis
    } catch (error) {
      console.error('[AI Agent] Error analyzing wallet activity:', error)
      throw error
    }
  }

  /**
   * Get wallet balances for all supported tokens
   * @param {string} walletAddress - Wallet address
   * @returns {Promise<Object>} Token balances
   */
  async getWalletBalances(walletAddress) {
    await this.initialize()
    
    // Check cache first
    const cached = this.getCached(walletAddress.toLowerCase(), 'balances')
    if (cached) {
      return cached
    }
    
    try {
      const balances = {}
      
      // Get balances for all tokens in parallel
      const balancePromises = Object.entries(TOKENS).map(async ([symbol, token]) => {
        const balance = await getTokenBalance(walletAddress, token.address)
        return { symbol, token, balance }
      })
      
      const balanceResults = await Promise.all(balancePromises)
      
      for (const { symbol, token, balance } of balanceResults) {
        if (balance) {
          balances[symbol] = {
            amount: balance.formatted,
            raw: balance.balance.toString(),
            decimals: balance.decimals
          }
        } else {
          balances[symbol] = {
            amount: '0',
            raw: '0',
            decimals: token.decimals
          }
        }
      }
      
      // Cache the result
      this.setCache(walletAddress.toLowerCase(), balances, 'balances')
      
      return balances
    } catch (error) {
      console.error('[AI Agent] Error getting wallet balances:', error)
      return {}
    }
  }

  /**
   * Calculate payment statistics from transactions
   */
  async calculatePaymentStats(transactions, walletAddress) {
    const stats = {
      totalSent: 0,
      totalReceived: 0,
      transactionCount: transactions.length,
      topRecipients: [],
      topSenders: []
    }
    
    const recipientMap = new Map()
    const senderMap = new Map()
    const walletLower = walletAddress.toLowerCase()
    
    for (const tx of transactions) {
      const amount = parseFloat(tx.amount || 0)
      const isSent = tx.from_address?.toLowerCase() === walletLower
      
      if (isSent) {
        stats.totalSent += amount
        const recipient = tx.to_username || tx.to_address
        recipientMap.set(recipient, (recipientMap.get(recipient) || 0) + amount)
      } else {
        stats.totalReceived += amount
        const sender = tx.from_username || tx.from_address
        senderMap.set(sender, (senderMap.get(sender) || 0) + amount)
      }
    }
    
    // Top recipients
    stats.topRecipients = Array.from(recipientMap.entries())
      .map(([username, amount]) => ({ username, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
    
    // Top senders
    stats.topSenders = Array.from(senderMap.entries())
      .map(([username, amount]) => ({ username, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
    
    return stats
  }

  /**
   * Analyze transaction patterns
   */
  async analyzePatterns(transactions, walletAddress) {
    const patterns = {
      mostActiveDay: null,
      averageTransactionAmount: 0,
      transactionFrequency: 'low'
    }
    
    if (transactions.length === 0) return patterns
    
    // Calculate average transaction amount
    const totalAmount = transactions.reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0)
    patterns.averageTransactionAmount = totalAmount / transactions.length
    
    // Determine frequency
    if (transactions.length >= 20) {
      patterns.transactionFrequency = 'high'
    } else if (transactions.length >= 10) {
      patterns.transactionFrequency = 'medium'
    }
    
    return patterns
  }

  /**
   * Generate insights from analysis
   */
  async generateInsights(analysis) {
    const insights = []
    
    if (analysis.paymentStats.transactionCount === 0) {
      insights.push('This wallet is new and has no transaction history yet.')
      return insights
    }
    
    if (analysis.paymentStats.totalSent > analysis.paymentStats.totalReceived) {
      insights.push(`You've sent more than you've received ($${analysis.paymentStats.totalSent.toFixed(2)} sent vs $${analysis.paymentStats.totalReceived.toFixed(2)} received).`)
    }
    
    if (analysis.paymentStats.topRecipients.length > 0) {
      const topRecipient = analysis.paymentStats.topRecipients[0]
      insights.push(`Your most frequent recipient is @${topRecipient.username} ($${topRecipient.amount.toFixed(2)}).`)
    }
    
    if (analysis.patterns.transactionFrequency === 'high') {
      insights.push('You have a high transaction frequency, indicating active usage.')
    }
    
    return insights
  }

  /**
   * Format analysis for LLM consumption
   */
  formatForLLM(analysis) {
    let output = `Wallet Activity Analysis for ${analysis.address}\n\n`
    output += `📊 Summary:\n`
    output += `- Total Transactions: ${analysis.paymentStats.transactionCount}\n`
    output += `- Total Sent: $${analysis.paymentStats.totalSent.toFixed(2)}\n`
    output += `- Total Received: $${analysis.paymentStats.totalReceived.toFixed(2)}\n\n`
    
    output += `💰 Current Balances:\n`
    for (const [token, balance] of Object.entries(analysis.balances)) {
      output += `- ${token}: $${balance.amount}\n`
    }
    
    output += `\n💡 Insights:\n`
    analysis.insights.forEach((insight, idx) => {
      output += `${idx + 1}. ${insight}\n`
    })
    
    return output
  }

  /**
   * Get activity summary for a time period
   */
  async getActivitySummary(walletAddress, days) {
    const cutoffDate = Date.now() - (days * 24 * 60 * 60 * 1000)
    
    const transactions = await dbAll(
      `SELECT * FROM payments 
       WHERE (LOWER(from_address) = LOWER(?) OR LOWER(to_address) = LOWER(?))
       AND created_at > ?
       ORDER BY created_at DESC`,
      [walletAddress, walletAddress, Math.floor(cutoffDate / 1000)]
    )
    
    const summary = {
      period: `Last ${days} days`,
      totalTransactions: transactions.length,
      totalVolume: 0,
      uniqueCounterparties: new Set(),
      tokenUsage: {}
    }
    
    for (const tx of transactions) {
      summary.totalVolume += parseFloat(tx.amount || 0)
      if (tx.to_username) summary.uniqueCounterparties.add(tx.to_username)
      if (tx.from_username) summary.uniqueCounterparties.add(tx.from_username)
      
      // Token usage
      const tokenSymbol = Object.keys(TOKENS).find(s => TOKENS[s].address.toLowerCase() === tx.token_address?.toLowerCase())
      if (tokenSymbol) {
        summary.tokenUsage[tokenSymbol] = (summary.tokenUsage[tokenSymbol] || 0) + parseFloat(tx.amount || 0)
      }
    }
    
    summary.uniqueCounterparties = summary.uniqueCounterparties.size
    
    return summary
  }

  /**
   * Detect unusual activity
   */
  async detectUnusualActivity(walletAddress) {
    const analysis = await this.analyzeWalletActivity(walletAddress)
    const alerts = []
    let riskLevel = 'low'
    
    // Check for unusually large transactions
    for (const tx of analysis.recentTransactions.slice(0, 10)) {
      const amount = parseFloat(tx.amount || 0)
      if (amount > 10000) {
        alerts.push({
          type: 'large_transaction',
          severity: 'high',
          message: `Unusually large transaction detected: $${amount.toFixed(2)}`
        })
        riskLevel = 'medium'
      }
    }
    
    // Check for high frequency
    if (analysis.paymentStats.transactionCount > 50) {
      alerts.push({
        type: 'high_frequency',
        severity: 'medium',
        message: `High transaction frequency: ${analysis.paymentStats.transactionCount} transactions`
      })
      if (riskLevel === 'low') riskLevel = 'medium'
    }
    
    return {
      riskLevel,
      alerts
    }
  }

  /**
   * Analyze a specific transaction
   */
  async analyzeTransaction(txHash) {
    try {
      const provider = this.provider
      const tx = await provider.getTransaction(txHash)
      const receipt = await provider.getTransactionReceipt(txHash)
      
      const analysis = {
        txHash,
        status: receipt.status === 1 ? 'success' : 'failed',
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        paymentData: null,
        insights: []
      }
      
      // Try to parse PaymentSent event
      const sendCash = await this.getSendCashContract()
      try {
        const logs = await sendCash.queryFilter(
          sendCash.filters.PaymentSent(),
          receipt.blockNumber,
          receipt.blockNumber
        )
        
        const paymentLog = logs.find(log => log.transactionHash === txHash)
        if (paymentLog) {
          const args = paymentLog.args
          analysis.paymentData = {
            from: args.from,
            to: args.to,
            token: args.token,
            amount: args.amount.toString(),
            amountFormatted: ethers.formatUnits(args.amount, 6), // Assuming USDC
            fee: args.fee.toString(),
            feeFormatted: ethers.formatUnits(args.fee, 6),
            tokenSymbol: 'USDC' // Could be determined from token address
          }
          
          analysis.insights.push(`Payment of $${analysis.paymentData.amountFormatted} sent successfully.`)
        }
      } catch (error) {
        console.warn('[AI Agent] Could not parse PaymentSent event:', error.message)
      }
      
      return analysis
    } catch (error) {
      console.error('[AI Agent] Error analyzing transaction:', error)
      throw error
    }
  }

  /**
   * Classify user intent from message
   */
  async classifyIntent(message, userId = null) {
    if (!this.openai) {
      return { intent: 'general_chat', confidence: 0.5 }
    }
    
    // Check cache
    const messageHash = `${message}_${userId || 'anon'}`
    const cached = this.getCached(messageHash, 'intents')
    if (cached) {
      return cached
    }
    
    try {
      // Get conversation history for context
      const history = userId ? this.getConversationHistory(userId) : []
      const recentHistory = history.slice(-8) // Last 8 messages
      
      const systemPrompt = `You are an intent classifier for SendCash, a crypto payment platform.

Classify the user's message into one of these intents:

PAYMENT INTENTS:
- send_payment: Immediate payment (e.g., "send $10 to @alice", "pay bob 50 USDC")
- schedule_payment: Scheduled payment for future (look for keywords like):
  * "schedule", "in X minutes", "in X hours", "in X days"
  * "tomorrow", "next week", "on [date]", "at [time]"
  * Examples: "send $10 to @alice in 2 minutes", "schedule $50 to @bob for tomorrow", "pay $20 to @charlie on December 25th"

SCHEDULING MANAGEMENT:
- view_scheduled_payments: View scheduled payments (e.g., "show scheduled payments", "what payments are scheduled", "list my scheduled payments")
- cancel_scheduled_payment: Cancel a scheduled payment (e.g., "cancel scheduled payment #1", "cancel payment ID 1", "delete scheduled payment 2")

WALLET INTENTS:
- check_balance: Check wallet balance (e.g., "what's my balance", "show balance", "how much do I have")
- view_history: View transaction history (e.g., "show my transactions", "transaction history", "payment history")
- get_insights: Spending insights/analysis (e.g., "spending insights", "wallet analysis", "how much did I spend")
- payment_statistics: Payment statistics and analytics (e.g., "payment stats", "show statistics", "transaction stats")
- transaction_report: Detailed transaction report (e.g., "transaction report", "generate report", "monthly report")

SWAP INTENTS:
- swap_tokens: Token swap/exchange. Look for keywords: "swap", "convert", "exchange", "trade", "change", "switch"
  * Examples:
    - "swap 100 USDC to USDT"
    - "convert 50 USDT to WBTC"
    - "exchange 200 USDC for ETH"
    - "I want to swap 10 USDC to USDT"
    - "can you convert 25 USDT to WBTC?"
    - "trade 100 USDC for USDT"
    - "change 50 USDC to USDT"
    - "switch my USDC to USDT"
    - "swap tokens" (general swap request)
    - "convert USDC to USDT" (amount may be in context)
    - "I need to exchange 75 USDT for WBTC"
    - "swap 1000 USDC into USDT"
    - "convert my USDC to ETH"
    - "exchange tokens"

USERNAME INTENTS:
- register_username: Register a username (e.g., "register @alice", "create account with username bob")
- search_username: Search/lookup username (e.g., "search @alice", "who is @bob", "find @charlie")

SECURITY:
- export_key: Export private key (e.g., "export my key", "show private key", "export key")

HELP:
- help: Need help or want to know what bot can do (e.g., "help", "what can you do", "how does this work")
- general_chat: General conversation, greetings, questions not related to SendCash

IMPORTANT: 
- If message contains scheduling keywords (schedule, in X minutes, tomorrow, etc.) AND payment details, classify as schedule_payment
- If message is just about viewing/cancelling scheduled payments, use view_scheduled_payments or cancel_scheduled_payment
- If message is immediate payment without scheduling, use send_payment

Return ONLY a JSON object with "intent" and "confidence" (0-1).
Example: {"intent": "schedule_payment", "confidence": 0.95}`

      const messages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: message }
      ]
      
      const response = await this.queueOpenAIRequest(() =>
        this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages,
          max_tokens: 100, // Reduced for faster responses
          temperature: 0.2
        })
      )
      
      const content = response.choices[0].message.content.trim()
      let result
      
      try {
        result = JSON.parse(content)
      } catch (e) {
        // Fallback if JSON parsing fails
        const intentMatch = content.match(/"intent"\s*:\s*"(\w+)"/)
        const confidenceMatch = content.match(/"confidence"\s*:\s*([\d.]+)/)
        result = {
          intent: intentMatch ? intentMatch[1] : 'general_chat',
          confidence: confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.5
        }
      }
      
      // Cache the result
      this.setCache(messageHash, result, 'intents')
      
      console.log(`[AI Agent] Intent classified: ${result.intent} (confidence: ${result.confidence.toFixed(2)})`)
      return result
    } catch (error) {
      console.error('[AI Agent] Error classifying intent:', error)
      return { intent: 'general_chat', confidence: 0.5 }
    }
  }

  /**
   * Extract payment intent from message
   */
  async extractPaymentIntent(message, userId = null) {
    if (!this.openai) {
      return { hasPaymentIntent: false }
    }
    
    // Check cache
    const messageHash = `payment_${message}_${userId || 'anon'}`
    const cached = this.getCached(messageHash, 'paymentIntents')
    if (cached) {
      return cached
    }
    
    try {
      // Get conversation history for context
      const history = userId ? this.getConversationHistory(userId) : []
      const recentHistory = history.slice(-8)
      
      const systemPrompt = `You are a payment intent extractor for SendCash.

Extract payment details from the user's message. Return a JSON object with:
- hasPaymentIntent: boolean
- amount: number (if found)
- recipient: string (username without @)
- token: string (USDC, USDT, WBTC - ONLY return a token if explicitly mentioned in the message, otherwise return null)
- memo: string (optional note/purpose for the payment)
- scheduledDate: string (ISO 8601 date string if payment is scheduled for future, null for immediate payments)
- isScheduled: boolean (true if payment should be scheduled, false for immediate)

SCHEDULING DETECTION:
- If message contains scheduling keywords like "schedule", "in X minutes", "in X hours", "tomorrow", "next week", "on [date]", "at [time]", etc., set isScheduled: true
- For relative times like "in 2 minutes", "in 5 minutes", "in 1 hour", "in 2 hours", "in 3 days":
  * Calculate the exact future time from NOW
  * Convert to ISO 8601 format in UTC
  * Example: If now is 2024-11-29T04:10:00Z and user says "in 2 minutes", return "2024-11-29T04:12:00Z"
- For absolute dates like "tomorrow", "December 25th", "at 3pm tomorrow":
  * Parse the date/time and convert to ISO 8601 format in UTC
  * Example: "tomorrow at 3pm" → calculate tomorrow's date at 15:00 UTC

IMPORTANT RULES:
1. Always use UTC timezone (append 'Z' to ISO strings)
2. For relative times, calculate from current time (NOW)
3. Ensure scheduledDate is always in the future
4. If no scheduling intent found, set isScheduled: false and scheduledDate: null

EXAMPLES:
Immediate payment with token: "send $10 USDC to @alice"
→ {"hasPaymentIntent": true, "amount": 10, "recipient": "alice", "token": "USDC", "memo": null, "isScheduled": false, "scheduledDate": null}

Immediate payment without token: "send $10 to @alice"
→ {"hasPaymentIntent": true, "amount": 10, "recipient": "alice", "token": null, "memo": null, "isScheduled": false, "scheduledDate": null}

Scheduled with token: "send $10 USDT to @alice in 2 minutes"
→ {"hasPaymentIntent": true, "amount": 10, "recipient": "alice", "token": "USDT", "memo": null, "isScheduled": true, "scheduledDate": "2024-11-29T04:12:00Z"}

Scheduled without token: "send $10 to @alice in 2 minutes"
→ {"hasPaymentIntent": true, "amount": 10, "recipient": "alice", "token": null, "memo": null, "isScheduled": true, "scheduledDate": "2024-11-29T04:12:00Z"}

Scheduled - absolute: "schedule $50 USDC to @bob for tomorrow at 3pm"
→ {"hasPaymentIntent": true, "amount": 50, "recipient": "bob", "token": "USDC", "memo": null, "isScheduled": true, "scheduledDate": "2024-11-30T15:00:00Z"}

If no payment intent found, return {"hasPaymentIntent": false}.`

      // Add current time context for better relative time calculations
      const now = new Date()
      const currentTimeContext = `\n\nCURRENT TIME CONTEXT (for relative time calculations):
Current UTC time: ${now.toISOString()}
Use this as the reference point for calculating "in X minutes/hours" expressions.`

      const messages = [
        { role: 'system', content: systemPrompt + currentTimeContext },
        ...recentHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: message }
      ]
      
      const response = await this.queueOpenAIRequest(() =>
        this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages,
          max_tokens: 150, // Reduced for faster responses
          temperature: 0.2
        })
      )
      
      const content = response.choices[0].message.content.trim()
      let result
      
      try {
        result = JSON.parse(content)
      } catch (e) {
        // Fallback parsing
        result = { hasPaymentIntent: false }
      }
      
      // Cache the result
      this.setCache(messageHash, result, 'paymentIntents')
      
      return result
    } catch (error) {
      console.error('[AI Agent] Error extracting payment intent:', error)
      return { hasPaymentIntent: false }
    }
  }

  /**
   * Manual payment extraction (regex-based, fast fallback)
   */
  manualExtractPayment(message) {
    const lowerMessage = message.toLowerCase()
    
    // Extract amount
    const amountPatterns = [
      /\$(\d+(?:\.\d+)?)/,
      /(\d+(?:\.\d+)?)\s*(?:usdc|usdt|wbtc|dollar|dollars)/i,
      /(?:send|pay|transfer)\s+(\d+(?:\.\d+)?)/
    ]
    
    let amount = null
    for (const pattern of amountPatterns) {
      const match = message.match(pattern)
      if (match) {
        amount = parseFloat(match[1])
        break
      }
    }
    
    // Extract recipient (allow underscores and hyphens in usernames)
    const recipientPatterns = [
      /@([a-zA-Z0-9_]+)/,  // Match @username with underscores
      /(?:to|for)\s+@?([a-zA-Z0-9_]+)/i,
      /(?:send|pay|transfer).*?@?([a-zA-Z0-9_]+)/
    ]
    
    let recipient = null
    for (const pattern of recipientPatterns) {
      const match = message.match(pattern)
      if (match && match[1] && match[1].length >= 3) {
        recipient = match[1].toLowerCase()
        break
      }
    }
    
    // Extract token
    let tokenSymbol = 'USDC'
    if (lowerMessage.includes('usdt')) tokenSymbol = 'USDT'
    else if (lowerMessage.includes('wbtc')) tokenSymbol = 'WBTC'
    
    // Extract memo
    const memoPatterns = [
      /(?:for|note|memo|purpose)[:\s]+(.+?)(?:\s+to|\s+@|$)/i,
      /"([^"]+)"/,
      /'([^']+)'/
    ]
    
    let memo = null
    for (const pattern of memoPatterns) {
      const match = message.match(pattern)
      if (match && match[1]) {
        memo = match[1].trim()
        break
      }
    }
    
    // Check if we need context (e.g., "send the same amount")
    const needsContext = lowerMessage.includes('same') || lowerMessage.includes('that') || lowerMessage.includes('it')
    
    if (amount && recipient) {
      return {
        amount: amount.toString(),
        recipient,
        tokenSymbol,
        memo: memo || null,
        needsContext: false
      }
    } else if (recipient && needsContext) {
      return {
        recipient,
        tokenSymbol,
        memo: memo || null,
        needsContext: true
      }
    }
    
    return null
  }

  /**
   * Execute action based on intent
   */
  async executeAction(intent, message, userId, context = {}, bot = null) {
    await this.initialize()
    
    switch (intent) {
      case 'check_balance':
        return await this.executeCheckBalance(context.walletAddress)
      
      case 'send_payment':
        return await this.executeSendPayment(message, userId, context.walletAddress, context.username, bot)
      
      case 'view_history':
        return await this.executeViewHistory(context.walletAddress)
      
      case 'get_insights':
        return await this.executeGetInsights(context.walletAddress)
      
      case 'payment_statistics':
        return await this.executePaymentStatistics(message, context.walletAddress)
      
      case 'transaction_report':
        return await this.executeTransactionReport(message, context.walletAddress)
      
      case 'swap_tokens':
        return await this.executeSwap(message, userId, context, bot)
      
      case 'register_username':
        return await this.executeRegisterUsername(message, userId, context, bot)
      
      case 'search_username':
        return await this.executeSearchUsername(message)
      
      case 'export_key':
      case 'export_private_key':
      case 'show_private_key':
        return await this.executeExportPrivateKey(userId, bot)
      
      case 'schedule_payment':
        return await this.executeSchedulePayment(message, userId, context.walletAddress, context.username, bot)
      
      case 'view_scheduled_payments':
        return await this.executeViewScheduledPayments(userId, bot)
      
      case 'cancel_scheduled_payment':
        return await this.executeCancelScheduledPayment(message, userId, bot)
      
      case 'help':
        return await this.executeHelp()
      
      case 'general_chat':
        return await this.executeGeneralChat(message, userId, context)
      
      default:
        return {
          success: false,
          message: "I'm not sure how to help with that. Try asking me about your balance, sending payments, or type 'help' for more options."
        }
    }
  }

  /**
   * Execute: Check Balance
   */
  async executeCheckBalance(walletAddress) {
    if (!walletAddress) {
      const friendlyError = getUserFriendlyError('Wallet not found', 'balance')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
    
    try {
      const balances = await this.getWalletBalances(walletAddress)
      
      let message = `💰 **Your Balances:**\n\n`
      let total = 0
      
      for (const [symbol, balance] of Object.entries(balances)) {
        const amount = parseFloat(balance.amount)
        total += amount
        message += `${symbol}: $${amount.toFixed(2)}\n`
      }
      
      message += `\n📍 **Wallet Address:**\n\`${walletAddress}\`\n\n`
      message += `**Total: $${total.toFixed(2)}**`
      
      return {
        success: true,
        message,
        data: { balances, walletAddress, total }
      }
    } catch (error) {
      console.error('[AI Agent] Error checking balance:', error)
      const friendlyError = getUserFriendlyError(error, 'balance')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: Send Payment
   */
  async executeSendPayment(message, userId, walletAddress, username, bot) {
    if (!walletAddress) {
      const friendlyError = getUserFriendlyError('Wallet not found', 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
    
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to send payments. Please try again."
      }
    }
    
    try {
      let contextAmount = null
      let contextToken = null
      
      // Proactively search conversation history for amounts
      const history = this.getConversationHistory(userId)
      for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i]
        const content = msg.content.toLowerCase()
        
        // Look for explicit amounts
        const amountMatch = content.match(/(?:send|pay|transfer|amount|balance|is)\s*(?:\$|usd|usdc|usdt|wbtc)?\s*(\d+(?:\.\d+)?)/i)
        if (amountMatch && amountMatch[1]) {
          contextAmount = amountMatch[1]
          const tokenMatch = content.match(/(usdc|usdt|wbtc)/i)
          if (tokenMatch) {
            contextToken = tokenMatch[1].toUpperCase()
          }
          break
        }
      }
      
      // Try manual extraction first (fast, no API call)
      const manualExtract = this.manualExtractPayment(message)
      if (manualExtract && manualExtract.amount && manualExtract.recipient && !manualExtract.needsContext) {
        console.log(`[AI Agent] Using fast manual extraction (no AI call)`)
        const amount = manualExtract.amount
        const recipient = manualExtract.recipient
        const memo = manualExtract.memo
        
        // ✅ Check if token was explicitly specified in the message
        const messageLower = message.toLowerCase()
        const hasTokenSpecified = 
          messageLower.includes('usdc') || 
          messageLower.includes('usdt') || 
          messageLower.includes('wbtc') ||
          messageLower.includes('bitcoin') ||
          messageLower.includes('tether') ||
          contextToken // If token was mentioned in conversation history
        
        // If no token was specified, ask user which asset to use
        if (!hasTokenSpecified && !contextToken) {
          return {
            success: false,
            message: `💰 **Which asset would you like to send?**\n\n` +
              `You want to send $${amount} to @${recipient}, but I need to know which token:\n\n` +
              `• **USDC** (USD Coin)\n` +
              `• **USDT** (Tether)\n` +
              `• **WBTC** (Wrapped Bitcoin)\n\n` +
              `Please specify, for example:\n` +
              `• "Send $${amount} USDC to @${recipient}"\n` +
              `• "Pay @${recipient} $${amount} USDT"\n` +
              `• "Send $${amount} WBTC to @${recipient}"`
          }
        }
        
        const tokenSymbol = manualExtract.tokenSymbol || contextToken || 'USDC'
        
        // ✅ VALIDATE USERNAME EXISTS BEFORE PROCEEDING
        console.log(`[AI Agent] Validating recipient username: @${recipient}`)
        const usernameValidation = await this.validateUsernameExists(recipient)
        
        if (!usernameValidation.exists) {
          console.log(`[AI Agent] ❌ Username @${recipient} not found`)
          let errorMessage = `❌ **Username Not Found**\n\n` +
            `The username @${recipient} is not registered in our system.\n\n`
          
          // Provide suggestions if available
          if (usernameValidation.suggestions && usernameValidation.suggestions.length > 0) {
            errorMessage += `💡 **Did you mean?**\n`
            usernameValidation.suggestions.slice(0, 5).forEach(suggestion => {
              errorMessage += `• @${suggestion}\n`
            })
            errorMessage += `\n`
          }
          
          errorMessage += `Please check the username and try again, or ask the recipient to register first.`
          
          return {
            success: false,
            message: errorMessage
          }
        }
        
        console.log(`[AI Agent] ✅ Username @${recipient} validated (address: ${usernameValidation.address})`)
        
        // CRITICAL: Store pending action BEFORE returning
        const actionKey = `payment_${userId}_${Date.now()}`
        const pendingActionData = {
          userId,
          action: 'send_payment',
          data: {
            recipient,
            amount: amount.toString(),
            tokenSymbol,
            memo: memo || null
          },
          timestamp: Date.now()
        }
        
        this.pendingActions.set(actionKey, pendingActionData)
        console.log(`[AI Agent] ✅ Stored pending action (fast manual extract): ${actionKey}`)
        console.log(`[AI Agent]   UserId: ${userId} (type: ${typeof userId})`)
        console.log(`[AI Agent]   Action: ${pendingActionData.action}`)
        console.log(`[AI Agent]   Recipient: @${recipient}, Amount: $${amount} ${tokenSymbol}`)
        console.log(`[AI Agent]   Total pending actions now: ${this.pendingActions.size}`)
        
        // Clean up old pending actions (older than 5 minutes)
        const now = Date.now()
        let cleanedCount = 0
        for (const [key, action] of this.pendingActions.entries()) {
          if (now - action.timestamp > 300000) {
            this.pendingActions.delete(key)
            cleanedCount++
          }
        }
        if (cleanedCount > 0) {
          console.log(`[AI Agent] Cleaned up ${cleanedCount} old pending actions`)
        }
        
        return {
          success: true,
          needsConfirmation: true,
          action: 'send_payment',
          message: `💸 **Payment Details:**\n\n` +
            `To: @${recipient}\n` +
            `Amount: $${amount} ${tokenSymbol}\n` +
            (memo ? `Note: ${memo}\n` : '') +
            `Fee: 0.5%\n\n` +
            `Reply "yes" or "confirm" to send, or "cancel" to abort.`,
          data: {
            recipient,
            amount: amount.toString(),
            tokenSymbol,
            memo: memo || null
          }
        }
      }
      
      // Use context amount if manual extract needs it
      if (manualExtract && manualExtract.needsContext && contextAmount) {
        manualExtract.amount = contextAmount
        manualExtract.tokenSymbol = contextToken || 'USDC'
        manualExtract.needsContext = false
      }
      
      // Try AI extraction
      let paymentIntent = await this.extractPaymentIntent(message, userId)
      
      // If AI extraction found an amount, use it; otherwise use context amount
      if (paymentIntent && paymentIntent.hasPaymentIntent && paymentIntent.amount) {
        // Use AI extraction
      } else if (contextAmount) {
        if (!paymentIntent) {
          paymentIntent = { hasPaymentIntent: true }
        }
        paymentIntent.amount = parseFloat(contextAmount)
        // Don't set default token here - let the check below handle it
        paymentIntent.token = contextToken || null
      } else if (manualExtract && manualExtract.amount && manualExtract.recipient) {
        // Use manual extraction with context
        const amount = manualExtract.amount
        const recipient = manualExtract.recipient
        const tokenSymbol = manualExtract.tokenSymbol || 'USDC'
        const memo = manualExtract.memo
        
        // Store pending action (CRITICAL: must store before returning)
        const actionKey = `payment_${userId}_${Date.now()}`
        const pendingActionData = {
          userId,
          action: 'send_payment',
          data: {
            recipient,
            amount: amount.toString(),
            tokenSymbol,
            memo: memo || null
          },
          timestamp: Date.now()
        }
        
        this.pendingActions.set(actionKey, pendingActionData)
        console.log(`[AI Agent] ✅ Stored pending action (early return): ${actionKey}`)
        console.log(`[AI Agent]   UserId: ${userId} (type: ${typeof userId})`)
        console.log(`[AI Agent]   Action: ${pendingActionData.action}`)
        console.log(`[AI Agent]   Recipient: @${recipient}, Amount: $${amount} ${tokenSymbol}`)
        console.log(`[AI Agent]   Total pending actions now: ${this.pendingActions.size}`)
        
        // Clean up old pending actions (older than 5 minutes)
        const now = Date.now()
        let cleanedCount = 0
        for (const [key, action] of this.pendingActions.entries()) {
          if (now - action.timestamp > 300000) {
            this.pendingActions.delete(key)
            cleanedCount++
          }
        }
        if (cleanedCount > 0) {
          console.log(`[AI Agent] Cleaned up ${cleanedCount} old pending actions`)
        }
        
        return {
          success: true,
          needsConfirmation: true,
          action: 'send_payment',
          message: `💸 **Payment Details:**\n\n` +
            `To: @${recipient}\n` +
            `Amount: $${amount} ${tokenSymbol}\n` +
            (memo ? `Note: ${memo}\n` : '') +
            `Fee: 0.5%\n\n` +
            `Reply "yes" or "confirm" to send, or "cancel" to abort.`,
          data: {
            recipient,
            amount: amount.toString(),
            tokenSymbol,
            memo: memo || null
          }
        }
      }
      
      if (!paymentIntent || !paymentIntent.hasPaymentIntent) {
        const friendlyError = getUserFriendlyError('Payment details unclear', 'payment')
        return {
          success: false,
          message: friendlyError.message || friendlyError
        }
      }
      
      const amount = paymentIntent.amount?.toString() || contextAmount
      const recipient = paymentIntent.recipient
      const token = paymentIntent.token || contextToken
      const memo = paymentIntent.memo || null
      
      if (!amount || !recipient) {
        const friendlyError = getUserFriendlyError('Missing payment details', 'payment')
        return {
          success: false,
          message: friendlyError.message || friendlyError
        }
      }

      // ✅ Check if token was explicitly specified in the message
      // If not, ask user which asset they want to use
      const messageLower = message.toLowerCase()
      const hasTokenSpecified = 
        token && token.toUpperCase() !== 'USDC' || // If token is explicitly set to something other than default
        messageLower.includes('usdc') || 
        messageLower.includes('usdt') || 
        messageLower.includes('wbtc') ||
        messageLower.includes('bitcoin') ||
        messageLower.includes('tether') ||
        contextToken // If token was mentioned in conversation history
      
      // If token is not specified (null/undefined) or is default USDC without explicit mention, ask for clarification
      if (!token || (token.toUpperCase() === 'USDC' && !messageLower.includes('usdc') && !contextToken)) {
        return {
          success: false,
          message: `💰 **Which asset would you like to send?**\n\n` +
            `You want to send $${amount} to @${recipient}, but I need to know which token:\n\n` +
            `• **USDC** (USD Coin)\n` +
            `• **USDT** (Tether)\n` +
            `• **WBTC** (Wrapped Bitcoin)\n\n` +
            `Please specify, for example:\n` +
            `• "Send $${amount} USDC to @${recipient}"\n` +
            `• "Pay @${recipient} $${amount} USDT"\n` +
            `• "Send $${amount} WBTC to @${recipient}"`
        }
      }

      const tokenSymbol = token.toUpperCase()
      
      // ✅ VALIDATE USERNAME EXISTS BEFORE PROCEEDING (AI extraction path)
      if (recipient) {
        console.log(`[AI Agent] Validating recipient username (AI path): @${recipient}`)
        const usernameValidation = await this.validateUsernameExists(recipient)
        
        if (!usernameValidation.exists) {
          console.log(`[AI Agent] ❌ Username @${recipient} not found (AI path)`)
          let errorMessage = `❌ **Username Not Found**\n\n` +
            `The username @${recipient} is not registered in our system.\n\n`
          
          // Provide suggestions if available
          if (usernameValidation.suggestions && usernameValidation.suggestions.length > 0) {
            errorMessage += `💡 **Did you mean?**\n`
            usernameValidation.suggestions.slice(0, 5).forEach(suggestion => {
              errorMessage += `• @${suggestion}\n`
            })
            errorMessage += `\n`
          }
          
          errorMessage += `Please check the username and try again, or ask the recipient to register first.`
          
          return {
            success: false,
            message: errorMessage
          }
        }
        
        console.log(`[AI Agent] ✅ Username @${recipient} validated (AI path, address: ${usernameValidation.address})`)
      }
      
      // Store pending action
      const actionKey = `payment_${userId}_${Date.now()}`
      const pendingActionData = {
        userId,
        action: 'send_payment',
        data: {
          recipient,
          amount: amount.toString(),
          tokenSymbol,
          memo
        },
        timestamp: Date.now()
      }
      
      this.pendingActions.set(actionKey, pendingActionData)
      console.log(`[AI Agent] ✅ Stored pending action: ${actionKey}`)
      console.log(`[AI Agent]   UserId: ${userId} (type: ${typeof userId})`)
      console.log(`[AI Agent]   Action: ${pendingActionData.action}`)
      console.log(`[AI Agent]   Recipient: @${recipient}, Amount: $${amount} ${tokenSymbol}`)
      console.log(`[AI Agent]   Total pending actions now: ${this.pendingActions.size}`)
      
      // Clean up old pending actions (older than 5 minutes)
      const now = Date.now()
      let cleanedCount = 0
      for (const [key, action] of this.pendingActions.entries()) {
        if (now - action.timestamp > 300000) {
          this.pendingActions.delete(key)
          cleanedCount++
        }
      }
      if (cleanedCount > 0) {
        console.log(`[AI Agent] Cleaned up ${cleanedCount} old pending actions`)
      }
      
      return {
        success: true,
        needsConfirmation: true,
        action: 'send_payment',
        message: `💸 **Payment Details:**\n\n` +
          `To: @${recipient}\n` +
          `Amount: $${amount} ${tokenSymbol}\n` +
          (memo ? `Note: ${memo}\n` : '') +
          `Fee: 0.5%\n\n` +
          `Reply "yes" or "confirm" to send, or "cancel" to abort.`,
        data: {
          recipient,
          amount: amount.toString(),
          tokenSymbol,
          memo
        }
      }
    } catch (error) {
      console.error('[AI Agent] Error executing send payment:', error)
      const friendlyError = getUserFriendlyError(error, 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: View History
   */
  async executeViewHistory(walletAddress) {
    if (!walletAddress) {
      const friendlyError = getUserFriendlyError('Wallet not found', 'history')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
    
    try {
      const transactions = await dbAll(
        `SELECT * FROM payments 
         WHERE LOWER(from_address) = LOWER(?) OR LOWER(to_address) = LOWER(?)
         ORDER BY created_at DESC 
         LIMIT 10`,
        [walletAddress, walletAddress]
      )
      
      if (transactions.length === 0) {
        return {
          success: true,
          message: `📋 **Your Transaction History:**\n\nNo transactions yet. Start by sending or receiving a payment! 💸`
        }
      }
      
      let message = `📋 **Your Recent Transactions:**\n\n`
      
      for (const tx of transactions) {
        const isSent = tx.from_address?.toLowerCase() === walletAddress.toLowerCase()
        const direction = isSent ? '➡️' : '⬅️'
        const action = isSent ? 'Sent' : 'Received'
        const counterparty = isSent 
          ? (tx.to_username ? `@${tx.to_username}` : tx.to_address?.slice(0, 10) + '...') 
          : (tx.from_username ? `@${tx.from_username}` : tx.from_address?.slice(0, 10) + '...')
        
        // Determine token symbol and decimals
        const tokenSymbol = Object.keys(TOKENS).find(s => TOKENS[s].address.toLowerCase() === tx.token_address?.toLowerCase()) || 'USDC'
        const tokenInfo = TOKENS[tokenSymbol] || TOKENS.USDC
        
        // Amount is stored in decimal format (e.g., "1.00")
        const amount = parseFloat(tx.amount || 0)
        
        // Format date (Nov 28 format)
        let dateStr = ''
        if (tx.created_at) {
          const date = new Date(tx.created_at * 1000) // created_at is in seconds
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          dateStr = ` • ${months[date.getMonth()]} ${date.getDate()}`
        }
        
        // Build explorer URL
        const explorerUrl = `https://sepolia-explorer.base.org/tx/${tx.tx_hash}`
        
        // Format transaction line
        message += `${direction} ${action} $${amount.toFixed(2)} ${tokenSymbol}${dateStr}\n\n`
        message += `   ${counterparty}\n\n`
        message += `   [View on Explorer](${explorerUrl})\n\n`
      }
      
      return {
        success: true,
        message,
        data: { transactions },
        hasCloseButton: true // Add close button for list views
      }
    } catch (error) {
      console.error('[AI Agent] Error viewing history:', error)
      const friendlyError = getUserFriendlyError(error, 'history')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: Get Insights
   */
  async executeGetInsights(walletAddress) {
    if (!walletAddress) {
      const friendlyError = getUserFriendlyError('Wallet not found', 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
    
    try {
      // Use enhanced analytics for better insights
      const stats = await getPaymentStatistics(walletAddress, { timeRange: 'all' })
      
      let message = `📊 **Your Wallet Insights:**\n\n`
      message += `💸 **Spending Summary:**\n`
      message += `• Total Sent: $${stats.sent.totalAmount.toFixed(2)}\n`
      message += `• Total Received: $${stats.received.totalAmount.toFixed(2)}\n`
      message += `• Net Flow: $${stats.netFlow >= 0 ? '+' : ''}${stats.netFlow.toFixed(2)}\n`
      message += `• Total Transactions: ${stats.totalTransactions}\n`
      message += `• Total Fees: $${stats.sent.totalFees.toFixed(2)}\n\n`
      
      // Sent breakdown
      if (stats.sent.count > 0) {
        message += `📤 **Sent Breakdown:**\n`
        message += `• Count: ${stats.sent.count}\n`
        message += `• Average: $${stats.sent.averageAmount.toFixed(2)}\n`
        message += `• Largest: $${stats.sent.largestAmount.toFixed(2)}\n\n`
      }
      
      // Received breakdown
      if (stats.received.count > 0) {
        message += `📥 **Received Breakdown:**\n`
        message += `• Count: ${stats.received.count}\n`
        message += `• Average: $${stats.received.averageAmount.toFixed(2)}\n`
        message += `• Largest: $${stats.received.largestAmount.toFixed(2)}\n\n`
      }
      
      // Top recipients
      if (stats.topRecipients.length > 0) {
        message += `👥 **Top Recipients:**\n`
        stats.topRecipients.slice(0, 5).forEach((recipient, idx) => {
          message += `${idx + 1}. @${recipient.username}: $${recipient.total.toFixed(2)} (${recipient.count} tx)\n`
        })
        message += `\n`
      }
      
      // Top senders
      if (stats.topSenders.length > 0) {
        message += `📥 **Top Senders:**\n`
        stats.topSenders.slice(0, 5).forEach((sender, idx) => {
          message += `${idx + 1}. @${sender.username}: $${sender.total.toFixed(2)} (${sender.count} tx)\n`
        })
        message += `\n`
      }
      
      // Token breakdown
      const tokenEntries = Object.entries(stats.byToken)
      if (tokenEntries.length > 0) {
        message += `🪙 **By Token:**\n`
        tokenEntries.forEach(([token, data]) => {
          message += `• ${token}: Sent $${data.sent.amount.toFixed(2)}, Received $${data.received.amount.toFixed(2)}\n`
        })
        message += `\n`
      }
      
      // Enhanced insights
      const insights = generateReportInsights(stats)
      if (insights.length > 0) {
        message += `💡 **Insights:**\n`
        insights.forEach((insight, idx) => {
          message += `${idx + 1}. ${insight}\n`
        })
      }
      
      return {
        success: true,
        message,
        data: { stats },
        hasCloseButton: true // Add close button for list views
      }
    } catch (error) {
      console.error('[AI Agent] Error getting insights:', error)
      const friendlyError = getUserFriendlyError(error, 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: Payment Statistics
   */
  async executePaymentStatistics(message, walletAddress) {
    if (!walletAddress) {
      const friendlyError = getUserFriendlyError('Wallet not found', 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    try {
      // Extract time range from message
      let timeRange = '30d' // Default to 30 days
      const messageLower = message.toLowerCase()
      
      if (messageLower.includes('all time') || messageLower.includes('all-time')) {
        timeRange = 'all'
      } else if (messageLower.includes('7 days') || messageLower.includes('week')) {
        timeRange = '7d'
      } else if (messageLower.includes('30 days') || messageLower.includes('month')) {
        timeRange = '30d'
      } else if (messageLower.includes('90 days') || messageLower.includes('3 months') || messageLower.includes('quarter')) {
        timeRange = '90d'
      } else if (messageLower.includes('year') || messageLower.includes('12 months')) {
        timeRange = '1y'
      }

      // Extract token if specified
      let tokenSymbol = null
      for (const token of Object.keys(TOKENS)) {
        if (messageLower.includes(token.toLowerCase())) {
          tokenSymbol = token
          break
        }
      }

      const stats = await getPaymentStatistics(walletAddress, { timeRange, tokenSymbol })
      const formattedMessage = formatStatisticsMessage(stats)

      return {
        success: true,
        message: formattedMessage,
        data: stats,
        hasCloseButton: true
      }
    } catch (error) {
      console.error('[AI Agent] Error getting payment statistics:', error)
      const friendlyError = getUserFriendlyError(error, 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: Transaction Report
   */
  async executeTransactionReport(message, walletAddress) {
    if (!walletAddress) {
      const friendlyError = getUserFriendlyError('Wallet not found', 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }

    try {
      // Extract time range and format from message
      let timeRange = '30d'
      let format = 'summary'
      const messageLower = message.toLowerCase()
      
      if (messageLower.includes('all time') || messageLower.includes('all-time')) {
        timeRange = 'all'
      } else if (messageLower.includes('7 days') || messageLower.includes('week')) {
        timeRange = '7d'
      } else if (messageLower.includes('30 days') || messageLower.includes('month')) {
        timeRange = '30d'
      } else if (messageLower.includes('90 days') || messageLower.includes('3 months') || messageLower.includes('quarter')) {
        timeRange = '90d'
      } else if (messageLower.includes('year') || messageLower.includes('12 months')) {
        timeRange = '1y'
      }

      if (messageLower.includes('detailed') || messageLower.includes('full')) {
        format = messageLower.includes('full') ? 'full' : 'detailed'
      }

      const report = await generateTransactionReport(walletAddress, { timeRange, format })
      const formattedMessage = formatReportMessage(report)

      return {
        success: true,
        message: formattedMessage,
        data: report,
        hasCloseButton: true
      }
    } catch (error) {
      console.error('[AI Agent] Error generating transaction report:', error)
      const friendlyError = getUserFriendlyError(error, 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: Swap Tokens
   */
  async executeSwap(message, userId, context, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to execute swaps. Please try again."
      }
    }

    try {
      // Extract swap details from message
      const swapDetails = await this.extractSwapIntent(message)
      
      if (!swapDetails || !swapDetails.fromToken || !swapDetails.toToken || !swapDetails.amount) {
        return {
          success: false,
          message: "I couldn't understand your swap request. Please specify:\n" +
            "• From token (e.g., USDC, USDT)\n" +
            "• To token (e.g., USDT, WBTC)\n" +
            "• Amount (e.g., 100)\n\n" +
            "Example: \"swap 100 USDC to USDT\""
        }
      }

      const { fromToken, toToken, amount, slippageBps = 100 } = swapDetails

      // Get user info
      const user = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
      if (!user || !user.username) {
        return {
          success: false,
          message: "❌ You don't have a registered wallet yet. Please register a username first."
        }
      }

      // Check if swap is already pending for confirmation
      const pendingSwapKey = `${userId}_swap`
      if (this.pendingSwaps && this.pendingSwaps[pendingSwapKey]) {
        // User is confirming a swap
        if (message.toLowerCase().includes('yes') || message.toLowerCase().includes('confirm')) {
          const pendingSwap = this.pendingSwaps[pendingSwapKey]
          delete this.pendingSwaps[pendingSwapKey]

          // Execute the swap
          const { executeSwap } = await import('./swapService.js')
          const result = await executeSwap(
            userId,
            user.username,
            pendingSwap.fromToken,
            pendingSwap.toToken,
            pendingSwap.amount,
            pendingSwap.slippageBps,
            bot
          )

          if (result.success) {
            return {
              success: true,
              message: `✅ Swap executed successfully!\n\n` +
                `💱 ${pendingSwap.amount} ${pendingSwap.fromToken} → ${result.toAmount} ${pendingSwap.toToken}\n` +
                `📊 Min received: ${result.minAmountOut} ${pendingSwap.toToken}\n` +
                `🔗 [View Transaction](${result.blockExplorerUrl})\n\n` +
                `⏳ Transaction is pending. Check your balance in a few moments.`
            }
          } else {
            return {
              success: false,
              message: result.message || "❌ Swap failed. Please try again."
            }
          }
        } else {
          // User cancelled
          delete this.pendingSwaps[pendingSwapKey]
          return {
            success: true,
            message: "❌ Swap cancelled."
          }
        }
      }

      // Get quote first
      const { getSwapQuote } = await import('./swapService.js')
      const quote = await getSwapQuote(
        fromToken,
        toToken,
        amount,
        user.wallet_address
      )

      if (quote.status !== 'success') {
        return {
          success: false,
          message: `❌ ${quote.message || 'Failed to get swap quote. Please try again.'}`
        }
      }

      // Store pending swap for confirmation
      if (!this.pendingSwaps) {
        this.pendingSwaps = {}
      }
      this.pendingSwaps[pendingSwapKey] = {
        fromToken,
        toToken,
        amount,
        slippageBps,
        quote
      }

      // Ask for confirmation
      return {
        success: true,
        message: `💱 **Swap Quote**\n\n` +
          `**From:** ${amount} ${fromToken}\n` +
          `**To:** ~${quote.toAmount} ${toToken}\n` +
          `**Slippage:** ${slippageBps / 100}%\n` +
          `**Pool:** ${quote.poolAddress ? 'Found' : 'N/A'}\n\n` +
          `⚠️ **Please confirm this swap**\n` +
          `Reply "yes" to confirm or "no" to cancel.`
      }
    } catch (error) {
      console.error('[AI Agent] Error executing swap:', error)
      const friendlyError = getUserFriendlyError(error, 'general')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Extract swap intent from message
   */
  async extractSwapIntent(message) {
    try {
      // Manual extraction for common patterns
      const manualResult = this.manualExtractSwap(message)
      if (manualResult) {
        return manualResult
      }

      // Use AI for complex extraction
      const systemPrompt = `Extract swap details from the user's message. Return JSON with:
{
  "fromToken": "USDC" (token symbol to swap FROM),
  "toToken": "USDT" (token symbol to swap TO),
  "amount": "100" (amount as string),
  "slippageBps": 100 (slippage in basis points, default 100 = 1%)
}

Common patterns to recognize:
- "swap [amount] [fromToken] to [toToken]"
- "convert [amount] [fromToken] to [toToken]"
- "exchange [amount] [fromToken] for [toToken]"
- "trade [amount] [fromToken] for [toToken]"
- "change [amount] [fromToken] to [toToken]"
- "switch [amount] [fromToken] to [toToken]"
- "[fromToken] to [toToken]" (amount may be in previous context)

Examples:
- "swap 100 USDC to USDT" → {"fromToken": "USDC", "toToken": "USDT", "amount": "100", "slippageBps": 100}
- "convert 50 USDT to WBTC" → {"fromToken": "USDT", "toToken": "WBTC", "amount": "50", "slippageBps": 100}
- "exchange 200 USDC for ETH" → {"fromToken": "USDC", "toToken": "ETH", "amount": "200", "slippageBps": 100}
- "I want to swap 10 USDC to USDT" → {"fromToken": "USDC", "toToken": "USDT", "amount": "10", "slippageBps": 100}
- "can you convert 25 USDT to WBTC?" → {"fromToken": "USDT", "toToken": "WBTC", "amount": "25", "slippageBps": 100}
- "trade 100 USDC for USDT" → {"fromToken": "USDC", "toToken": "USDT", "amount": "100", "slippageBps": 100}
- "change 50 USDC to USDT" → {"fromToken": "USDC", "toToken": "USDT", "amount": "50", "slippageBps": 100}
- "swap my USDC to USDT" → {"fromToken": "USDC", "toToken": "USDT", "amount": null, "slippageBps": 100} (amount needs context)
- "convert USDC to ETH" → {"fromToken": "USDC", "toToken": "ETH", "amount": null, "slippageBps": 100} (amount needs context)

Supported tokens: USDC, USDT, WBTC, ETH, WETH

Return ONLY valid JSON, no other text.`

      const response = await this.queueOpenAIRequest([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message }
      ])

      const jsonMatch = response.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0])
      }
    } catch (error) {
      console.error('[AI Agent] Error extracting swap intent:', error)
    }
    return null
  }

  /**
   * Manual extraction for common swap patterns
   */
  manualExtractSwap(message) {
    const lower = message.toLowerCase()
    
    // Multiple patterns to catch various ways users express swaps
    const patterns = [
      // "swap 100 USDC to USDT"
      /(?:swap|convert|exchange|trade|change|switch)\s+(\d+(?:\.\d+)?)\s+(\w+)\s+(?:to|for|into)\s+(\w+)/i,
      // "swap USDC to USDT" (no amount, will need context)
      /(?:swap|convert|exchange|trade|change|switch)\s+(\w+)\s+(?:to|for|into)\s+(\w+)/i,
      // "100 USDC to USDT"
      /(\d+(?:\.\d+)?)\s+(\w+)\s+(?:to|for|into)\s+(\w+)/i,
      // "USDC to USDT" (no amount)
      /(\w+)\s+(?:to|for|into)\s+(\w+)/i
    ]
    
    for (const pattern of patterns) {
      const match = message.match(pattern)
      if (match) {
        // Check if first capture is a number (amount) or token
        const firstGroup = match[1]
        const isAmount = /^\d+(?:\.\d+)?$/.test(firstGroup)
        
        if (isAmount && match.length >= 4) {
          // Pattern: "swap 100 USDC to USDT"
          const [, amount, fromToken, toToken] = match
          return {
            fromToken: fromToken.toUpperCase(),
            toToken: toToken.toUpperCase(),
            amount: amount,
            slippageBps: 100
          }
        } else if (!isAmount && match.length >= 3) {
          // Pattern: "swap USDC to USDT" (no amount specified)
          const [, fromToken, toToken] = match
          // Check if this looks like tokens (not common words)
          const tokenSymbols = ['USDC', 'USDT', 'WBTC', 'ETH', 'WETH']
          if (tokenSymbols.includes(fromToken.toUpperCase()) && tokenSymbols.includes(toToken.toUpperCase())) {
            return {
              fromToken: fromToken.toUpperCase(),
              toToken: toToken.toUpperCase(),
              amount: null, // Will need to ask user or get from context
              slippageBps: 100
            }
          }
        }
      }
    }
    
    return null
  }

  /**
   * Execute: Register Username
   */
  async executeRegisterUsername(message, userId, context, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to register usernames. Please try again."
      }
    }
    
    try {
      // Extract username from message
      let username = null
      
      // Try various patterns
      const patterns = [
        /register\s+@?(\w+)/i,
        /@(\w+)/,
        /username\s+(\w+)/i,
        /(\w+)(?:\s|$)/i
      ]
      
      for (const pattern of patterns) {
        const match = message.match(pattern)
        if (match && match[1] && match[1].toLowerCase() !== 'register' && match[1].length >= 3) {
          username = match[1].toLowerCase()
          break
        }
      }
      
      if (!username) {
        return {
          success: false,
          message: "I couldn't find a username in your message. Please try: \"Register @yourname\""
        }
      }
      
      // Validate username format
      if (!/^[a-z0-9_]{3,15}$/i.test(username)) {
        return {
          success: false,
          message: "Invalid username format. Usernames must be 3-15 characters, alphanumeric with underscores only."
        }
      }
      
      // Execute registration
      const result = await executeRegisterUsername(userId, username, bot)
      
      if (result.success) {
        // Add to conversation history
        this.addToConversationHistory(userId, 'assistant', result.message)
      }
      
      return result
    } catch (error) {
      console.error('[AI Agent] Error registering username:', error)
      const friendlyError = getUserFriendlyError(error, 'registration')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: Export Private Key
   */
  async executeExportPrivateKey(userId, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to export keys. Please try again."
      };
    }
    
    try {
      const { executeExportPrivateKey } = await import('./aiActions.js');
      const result = await executeExportPrivateKey(userId, bot);
      
      // If result indicates message should be auto-deleted, add metadata
      if (result.shouldDelete && result.deleteAfter) {
        result.autoDelete = {
          enabled: true,
          delay: result.deleteAfter
        };
      }
      
      return result;
    } catch (error) {
      console.error('[AI Agent] Error exporting private key:', error);
      const friendlyError = getUserFriendlyError(error, 'general');
      return {
        success: false,
        message: friendlyError.message || friendlyError
      };
    }
  }

  /**
   * Execute: Schedule Payment
   */
  async executeSchedulePayment(message, userId, walletAddress, username, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to schedule payments. Please try again."
      }
    }

    try {
      // Extract payment intent with scheduling info
      const paymentIntent = await this.extractPaymentIntent(message, userId)
      
      if (!paymentIntent || !paymentIntent.hasPaymentIntent) {
        return {
          success: false,
          message: "I couldn't understand the payment details. Please specify:\n" +
            "• Recipient (e.g., @alice)\n" +
            "• Amount (e.g., $10)\n" +
            "• Date/time (e.g., tomorrow at 3pm, December 25th)"
        }
      }

      const { amount, recipient, token, memo = null, scheduledDate, isScheduled } = paymentIntent

      if (!amount || !recipient) {
        return {
          success: false,
          message: "I need both the recipient and amount to schedule a payment. Please try again."
        }
      }

      // ✅ Check if token was explicitly specified
      // If token is null, undefined, or empty, ask user which asset they want to use
      const messageLower = message.toLowerCase()
      const hasTokenSpecified = 
        token && token !== 'USDC' || // If token is explicitly set to something other than default
        messageLower.includes('usdc') || 
        messageLower.includes('usdt') || 
        messageLower.includes('wbtc') ||
        messageLower.includes('bitcoin') ||
        messageLower.includes('tether')
      
      // If token is not specified (null/undefined) or is default USDC without explicit mention, ask for clarification
      if (!token || (token === 'USDC' && !messageLower.includes('usdc'))) {
        return {
          success: false,
          message: `💰 **Which asset would you like to send?**\n\n` +
            `You want to send $${amount} to @${recipient}, but I need to know which token:\n\n` +
            `• **USDC** (USD Coin)\n` +
            `• **USDT** (Tether)\n` +
            `• **WBTC** (Wrapped Bitcoin)\n\n` +
            `Please specify, for example:\n` +
            `• "Send $${amount} USDC to @${recipient} in 2 minutes"\n` +
            `• "Schedule $${amount} USDT to @${recipient} tomorrow"\n` +
            `• "Send $${amount} WBTC to @${recipient} next week"`
        }
      }

      if (!isScheduled || !scheduledDate) {
        return {
          success: false,
          message: "I couldn't find a scheduled date/time. Please specify when to send the payment, e.g.,\n" +
            "• \"tomorrow at 3pm\"\n" +
            "• \"on December 25th\"\n" +
            "• \"next week\""
        }
      }

      // Parse scheduled date - try manual parsing first for relative times
      let scheduledDateTime
      try {
        // First, try to manually parse relative time expressions from the original message
        const relativeTimeMatch = message.match(/in\s+(\d+)\s+(minute|minutes|hour|hours|day|days|second|seconds)/i)
        if (relativeTimeMatch) {
          const value = parseInt(relativeTimeMatch[1])
          const unit = relativeTimeMatch[2].toLowerCase()
          
          const now = new Date()
          let futureDate = new Date(now)
          
          if (unit.includes('second')) {
            futureDate.setSeconds(now.getSeconds() + value)
          } else if (unit.includes('minute')) {
            futureDate.setMinutes(now.getMinutes() + value)
          } else if (unit.includes('hour')) {
            futureDate.setHours(now.getHours() + value)
          } else if (unit.includes('day')) {
            futureDate.setDate(now.getDate() + value)
          }
          
          scheduledDateTime = futureDate
          console.log(`[AI Agent] Manually parsed relative time:`, {
            original: message,
            extracted: `${value} ${unit}`,
            calculated: futureDate.toISOString(),
            now: now.toISOString(),
            timeDiffSeconds: Math.floor((futureDate.getTime() - now.getTime()) / 1000)
          })
        } else {
          // Fall back to AI-extracted date
          scheduledDateTime = new Date(scheduledDate)
          if (isNaN(scheduledDateTime.getTime())) {
            throw new Error('Invalid date')
          }
          
          console.log(`[AI Agent] Parsed scheduled date from AI:`, {
            original: scheduledDate,
            parsed: scheduledDateTime.toISOString(),
            now: new Date().toISOString(),
            timeDiff: scheduledDateTime.getTime() - new Date().getTime(),
            timeDiffSeconds: Math.floor((scheduledDateTime.getTime() - new Date().getTime()) / 1000)
          })
        }
      } catch (error) {
        console.error(`[AI Agent] Error parsing scheduled date:`, { scheduledDate, message, error: error.message })
        return {
          success: false,
          message: "I couldn't parse the scheduled date. Please use a clear date/time format like 'in 2 minutes' or 'tomorrow at 3pm'."
        }
      }

      // Ensure token is uppercase
      const tokenSymbol = (token || 'USDC').toUpperCase()
      return await executeSchedulePayment(userId, recipient, amount.toString(), tokenSymbol, scheduledDateTime, bot, memo)
    } catch (error) {
      console.error('[AI Agent] Error scheduling payment:', error)
      const friendlyError = getUserFriendlyError(error, 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError
      }
    }
  }

  /**
   * Execute: View Scheduled Payments
   */
  async executeViewScheduledPayments(userId, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to view scheduled payments. Please try again."
      }
    }

    try {
      return await executeViewScheduledPayments(userId, bot)
    } catch (error) {
      console.error('[AI Agent] Error viewing scheduled payments:', error)
      return {
        success: false,
        message: "I encountered an error retrieving scheduled payments. Please try again."
      }
    }
  }

  /**
   * Execute: Cancel Scheduled Payment
   */
  async executeCancelScheduledPayment(message, userId, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to cancel scheduled payments. Please try again."
      }
    }

    try {
      // Extract payment ID from message
      const idPatterns = [
        /(?:cancel|delete|remove).*?(?:payment|scheduled).*?(?:#|id|number)\s*(\d+)/i,
        /(?:cancel|delete|remove).*?(\d+)/i,
        /payment\s*(?:id|#)?\s*(\d+)/i
      ]

      let paymentId = null
      for (const pattern of idPatterns) {
        const match = message.match(pattern)
        if (match && match[1]) {
          paymentId = parseInt(match[1])
          break
        }
      }

      if (!paymentId) {
        return {
          success: false,
          message: "I couldn't find the payment ID. Please specify which payment to cancel, e.g.,\n" +
            "• \"Cancel scheduled payment #1\"\n" +
            "• \"Cancel payment ID 1\"\n\n" +
            "Use \"show scheduled payments\" to see your scheduled payments and their IDs."
        }
      }

      return await executeCancelScheduledPayment(userId, paymentId, bot)
    } catch (error) {
      console.error('[AI Agent] Error cancelling scheduled payment:', error)
      return {
        success: false,
        message: "I encountered an error cancelling the scheduled payment. Please try again."
      }
    }
  }

  /**
   * Validate if username exists (checks both database and on-chain registry)
   * Also provides suggestions for similar usernames if not found
   * @param {string} username - Username to validate (without @)
   * @returns {Promise<Object>} { exists: boolean, address?: string, suggestions?: string[] }
   */
  async validateUsernameExists(username) {
    try {
      const cleanUsername = username.toLowerCase().replace('@', '')
      
      // Check database first (faster)
      const dbUser = await dbGet('SELECT * FROM telegram_users WHERE username = ?', [cleanUsername])
      if (dbUser && dbUser.wallet_address) {
        return {
          exists: true,
          address: dbUser.wallet_address
        }
      }
      
      // Check username registry cache
      const cached = await dbGet('SELECT * FROM usernames WHERE username = ?', [cleanUsername])
      if (cached && cached.address) {
        // ✅ FIX: Validate cached address - reject if it's the registry address or zero address
        const registryAddress = CONTRACTS.USERNAME_REGISTRY.toLowerCase()
        const cachedAddress = cached.address.toLowerCase()
        
        if (cachedAddress !== registryAddress && 
            cachedAddress !== ethers.ZeroAddress.toLowerCase() &&
            ethers.isAddress(cached.address)) {
          return {
            exists: true,
            address: cached.address
          }
        } else {
          // Cache has invalid address (registry or zero) - delete it and check on-chain
          console.warn(`[AI Agent] Invalid cached address for ${cleanUsername}, checking on-chain...`)
          try {
            await dbRun('DELETE FROM usernames WHERE username = ?', [cleanUsername])
          } catch (deleteError) {
            console.warn('[AI Agent] Could not delete invalid cache entry:', deleteError.message)
          }
        }
      }
      
      // Check on-chain registry
      // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
      // getAddress() has a bug that returns registry address for non-existent usernames
      // usernameToAddress mapping correctly returns zero address for non-existent usernames
      const registry = await this.getUsernameRegistry()
      const address = await registry.usernameToAddress(cleanUsername)
      
      // Get registry contract address to exclude it from valid results
      // The registry returns its own address for non-existent usernames
      const registryAddress = CONTRACTS.USERNAME_REGISTRY.toLowerCase()
      const returnedAddress = address ? address.toLowerCase() : null
      
      // Username exists if address is valid, not zero, and not the registry contract itself
      if (address && 
          address !== ethers.ZeroAddress && 
          returnedAddress !== registryAddress &&
          ethers.isAddress(address)) {
        // Cache it for future lookups
        try {
          await dbRun(
            'INSERT OR REPLACE INTO usernames (username, address) VALUES (?, ?)',
            [cleanUsername, address]
          )
        } catch (cacheError) {
          console.warn('[AI Agent] Could not cache username:', cacheError.message)
        }
        
        return {
          exists: true,
          address: address
        }
      }
      
      // Username not found - provide suggestions
      const suggestions = await this.findSimilarUsernames(cleanUsername)
      
      return {
        exists: false,
        suggestions: suggestions
      }
    } catch (error) {
      console.error('[AI Agent] Error validating username:', error)
      // On error, assume it doesn't exist (safer to fail than proceed)
      return {
        exists: false,
        suggestions: []
      }
    }
  }

  /**
   * Find similar usernames for suggestions
   * @param {string} username - Username to find similar matches for
   * @returns {Promise<string[]>} Array of similar usernames
   */
  async findSimilarUsernames(username) {
    try {
      // Get all usernames from database
      const allUsers = await dbAll('SELECT username FROM telegram_users WHERE username IS NOT NULL AND username != ""')
      const allCached = await dbAll('SELECT username FROM usernames')
      
      const allUsernames = [
        ...allUsers.map(u => u.username.toLowerCase()),
        ...allCached.map(u => u.username.toLowerCase())
      ]
      
      // Remove duplicates
      const uniqueUsernames = [...new Set(allUsernames)]
      
      // Simple similarity: check if username contains part of the search term or vice versa
      const suggestions = uniqueUsernames.filter(u => {
        // Exact prefix match
        if (u.startsWith(username.substring(0, Math.min(4, username.length)))) return true
        // Contains search term
        if (u.includes(username.substring(0, Math.min(4, username.length)))) return true
        // Search term contains username
        if (username.includes(u.substring(0, Math.min(4, u.length)))) return true
        return false
      })
      
      // Sort by similarity (simple: shorter difference = more similar)
      return suggestions
        .sort((a, b) => {
          const diffA = Math.abs(a.length - username.length)
          const diffB = Math.abs(b.length - username.length)
          return diffA - diffB
        })
        .slice(0, 10) // Return top 10 suggestions
    } catch (error) {
      console.error('[AI Agent] Error finding similar usernames:', error)
      return []
    }
  }

  /**
   * Execute: Search Username
   */
  async executeSearchUsername(message) {
    try {
      let username = null
      
      // Extract username from various search patterns
      const searchPattern = /(?:search|find|lookup|check|who\s+is|who's)\s+@?(\w+)/i
      const searchMatch = message.match(searchPattern)
      if (searchMatch) {
        username = searchMatch[1].toLowerCase()
      } else {
        const atPattern = /@(\w+)/i
        const atMatch = message.match(atPattern)
        if (atMatch) {
          username = atMatch[1].toLowerCase()
        } else {
          // Try to find username word (skip keywords)
          const words = message.split(/\s+/)
          const keywords = ['search', 'find', 'lookup', 'check', 'who', 'is', 'what', 'show', 'me']
          const usernameWord = words.find(w => {
            const cleanWord = w.replace('@', '').toLowerCase()
            return !keywords.includes(cleanWord) && /^\w+$/.test(cleanWord) && cleanWord.length >= 3
          })
          if (usernameWord) {
            username = usernameWord.replace('@', '').toLowerCase()
          }
        }
      }
      
      if (!username) {
        return {
          success: false,
          message: "I couldn't find a username to search. Try: \"Search @username\" or \"Who is @username?\""
        }
      }
      
      await this.initialize()
      const registry = await this.getUsernameRegistry()
      
      // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
      const address = await registry.usernameToAddress(username)
      
      if (!address || address === ethers.ZeroAddress) {
        return {
          success: true,
          message: `🔍 **Username Search:** @${username}\n\n` +
            `❌ Username not found or not registered.\n\n` +
            `This username is available! You can register it.`
        }
      }
      
      // Check if premium
      const isPremium = await registry.premiumUsernames(username)
      
      // Get registration date from database if available
      const userRecord = await dbGet('SELECT * FROM telegram_users WHERE LOWER(username) = LOWER(?)', [username])
      const registeredAt = userRecord?.created_at ? new Date(userRecord.created_at * 1000).toLocaleDateString() : 'Unknown'
      
      return {
        success: true,
        message: `🔍 **Username Search:** @${username}\n\n` +
          `✅ **Registered**\n` +
          `📍 Wallet: \`${address}\`\n` +
          `${isPremium ? '⭐ Premium Username' : 'Regular Username'}\n` +
          `📅 Registered: ${registeredAt}\n\n` +
          `You can send payments to this user using @${username}! 💸`
      }
    } catch (error) {
      console.error('[AI Agent] Error searching username:', error)
      return {
        success: false,
        message: `I encountered an error searching for that username. Please try again.`
      }
    }
  }

  /**
   * Execute: Help
   */
  async executeHelp() {
    return {
      success: true,
      message: `🤖 **I'm Sender, your AI assistant for SendCash!**\n\n` +
        `I can help you with:\n\n` +
        `💰 **Balance & Payments**\n` +
        `• "What's my balance?"\n` +
        `• "Send $10 to @alice"\n` +
        `• "Pay bob 50 USDC for lunch"\n` +
        `• "Schedule $10 to @alice for tomorrow at 3pm"\n` +
        `• "Show scheduled payments"\n\n` +
        `• "Cancel scheduled payment #1"\n\n` +
        `💱 **Token Swaps**\n` +
        `• "Swap 100 USDC to USDT"\n` +
        `• "Convert 50 USDT to WBTC"\n` +
        `• "Exchange 200 USDC for ETH"\n` +
        `• "Trade 75 USDC for USDT"\n` +
        `• "Change 25 USDC to USDT"\n` +
        `• "Swap my USDC to USDT"\n` +
        `• "Convert USDC to ETH"\n\n` +
        `📋 **History & Analytics**\n` +
        `• "Show my transactions"\n` +
        `• "How much did I spend?"\n` +
        `• "Wallet insights"\n` +
        `• "Payment statistics"\n` +
        `• "Transaction report"\n` +
        `• "Stats for last 30 days"\n` +
        `• "Monthly report"\n\n` +
        `🔍 **Search**\n` +
        `• "Search @username"\n` +
        `• "Who is @alice?"\n\n` +
        `🚀 **Registration**\n` +
        `• "Register @yourname"\n` +
        `• "Create account with username alice"\n\n` +
        `🔐 **Security**\n` +
        `• "Export my private key"\n` +
        `• "Show my private key"\n\n` +
        `Just chat with me naturally - I understand what you need! ✨`
    }
  }

  /**
   * Execute: General Chat
   */
  async executeGeneralChat(message, userId, context = {}) {
    if (!this.openai) {
      return {
        success: false,
        message: "I'm having trouble processing that. Please try again or ask about SendCash features."
      }
    }

    try {
      // Get current time for context
      const now = new Date()
      const currentTime = now.toLocaleString('en-US', { 
        timeZone: 'UTC',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })

      // Build context for the AI
      let contextInfo = `Current date and time: ${currentTime}\n`
      
      if (context.walletAddress) {
        contextInfo += `User has a SendCash wallet: ${context.walletAddress}\n`
        if (context.username) {
          contextInfo += `Username: @${context.username}\n`
        }
      } else {
        contextInfo += `User doesn't have a SendCash wallet yet.\n`
      }

      const systemPrompt = `You are Sender, a friendly and helpful AI assistant for SendCash - a crypto payment platform.

You help users with:
1. SendCash-related tasks (payments, balances, transactions)
2. General conversation and questions

IMPORTANT RULES:
- You do NOT have access to real-time data (crypto prices, weather, news, market data)
- If asked about real-time data, be honest and suggest reliable sources
- You CAN provide the current time (from server)
- You CAN answer general knowledge questions
- Be friendly, helpful, and conversational
- Keep responses concise and relevant

Current context:
${contextInfo}

User's message: ${message}

Remember: Be honest about limitations. Don't make up prices or real-time data.`

      // Get conversation history
      const history = this.getConversationHistory(userId)
      const recentHistory = history.slice(-8)
      
      const messages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: message }
      ]
      
      const response = await this.queueOpenAIRequest(() =>
        this.openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages,
          max_tokens: 300, // Reduced for faster responses
          temperature: 0.7
        })
      )
      
      const content = response.choices[0].message.content.trim()
      
      // Add to conversation history
      this.addToConversationHistory(userId, 'user', message)
      this.addToConversationHistory(userId, 'assistant', content)
      
      return {
        success: true,
        message: content
      }
    } catch (error) {
      console.error('[AI Agent] Error in general chat:', error)
      return {
        success: false,
        message: "I'm having trouble processing that right now. Please try again or ask about SendCash features."
      }
    }
  }

  /**
   * Confirm and execute pending action
   */
  async confirmAndExecute(userId, confirmationText, bot) {
    if (!bot) {
      return {
        success: false,
        message: "I need the bot instance to execute actions. Please try again."
      }
    }
    
    const lowerText = confirmationText.toLowerCase().trim()
    const isConfirm = ['yes', 'confirm', 'y', 'ok', 'proceed'].includes(lowerText)
    const isCancel = ['cancel', 'no', 'abort', 'nope'].includes(lowerText)
    
    if (!isConfirm && !isCancel) {
      return {
        success: false,
        message: "Please reply 'yes' or 'confirm' to proceed, or 'cancel' to abort."
      }
    }
    
    // Find pending action for this user
    let pendingAction = null
    let actionKey = null
    
    // Normalize userId for comparison (handle both number and string)
    const normalizedUserId = typeof userId === 'number' ? userId : Number(userId)
    
    console.log(`[AI Agent] ========== CONFIRMATION REQUEST ==========`)
    console.log(`[AI Agent] Looking for pending action for userId: ${normalizedUserId} (type: ${typeof normalizedUserId})`)
    console.log(`[AI Agent] Input userId: ${userId} (type: ${typeof userId})`)
    console.log(`[AI Agent] Total pending actions: ${this.pendingActions.size}`)
    
    // Log ALL pending actions for debugging
    if (this.pendingActions.size > 0) {
      console.log(`[AI Agent] All pending actions:`)
      for (const [key, action] of this.pendingActions.entries()) {
        const actionUserId = typeof action.userId === 'number' ? action.userId : Number(action.userId)
        const age = Date.now() - action.timestamp
        const isMatch = actionUserId === normalizedUserId
        const isExpired = age >= 300000
        console.log(`[AI Agent]   - Key: ${key}`)
        console.log(`[AI Agent]     UserId: ${actionUserId} (type: ${typeof actionUserId})`)
        console.log(`[AI Agent]     Action: ${action.action}`)
        console.log(`[AI Agent]     Age: ${age}ms (${isExpired ? 'EXPIRED' : 'valid'})`)
        console.log(`[AI Agent]     Match: ${isMatch ? '✅' : '❌'} (userId match: ${isMatch}, not expired: ${!isExpired})`)
      }
    } else {
      console.log(`[AI Agent] ⚠️ No pending actions in map!`)
    }
    
    for (const [key, action] of this.pendingActions.entries()) {
      // Compare userIds (both should be numbers)
      const actionUserId = typeof action.userId === 'number' ? action.userId : Number(action.userId)
      const age = Date.now() - action.timestamp
      
      if (actionUserId === normalizedUserId && age < 300000) {
        pendingAction = action
        actionKey = key
        console.log(`[AI Agent] ✅ Found matching pending action: ${key}`)
        break
      }
    }
    
    if (!pendingAction) {
      console.log(`[AI Agent] ❌ No pending action found for userId: ${normalizedUserId}`)
      console.log(`[AI Agent] ==========================================`)
      return {
        success: false,
        message: "I don't have a pending action to confirm. What would you like to do?"
      }
    }
    
    console.log(`[AI Agent] ==========================================`)
    
    if (isCancel) {
      this.pendingActions.delete(actionKey)
      return {
        success: true,
        message: "✅ Action cancelled. What would you like to do instead?"
      }
    }
    
    // Execute the action
    try {
      if (pendingAction.action === 'send_payment') {
        const { recipient, amount, tokenSymbol, memo } = pendingAction.data
        
        const result = await executePayment(
          userId,
          recipient,
          amount,
          tokenSymbol,
          bot,
          memo
        )
        
        // Remove pending action
        this.pendingActions.delete(actionKey)
        
        if (result.success) {
          // Add to conversation history
          this.addToConversationHistory(userId, 'assistant', result.message)
          return result
        } else {
          return {
            success: false,
            message: result.message || "Payment failed. Please check your balance and try again."
          }
        }
      } else if (pendingAction.action === 'register_username') {
        // Registration is handled directly in executeRegisterUsername
        this.pendingActions.delete(actionKey)
        return {
          success: true,
          message: "Registration confirmed. Processing..."
        }
      }
      
      return {
        success: false,
        message: "Unknown action type. Please try again."
      }
    } catch (error) {
      console.error('[AI Agent] Error executing confirmed action:', error)
      this.pendingActions.delete(actionKey)
      const friendlyError = getUserFriendlyError(error, 'payment')
      return {
        success: false,
        message: friendlyError.message || friendlyError || "I encountered an error. Please try again."
      }
    }
  }

  /**
   * Process natural language message
   */
  async processNaturalLanguage(message, userId, context = {}, bot = null) {
    await this.initialize()
    
    try {
      // Add user message to conversation history
      this.addToConversationHistory(userId, 'user', message)
      
      // Classify intent
      const intentResult = await this.classifyIntent(message, userId)
      const intent = intentResult.intent
      
      console.log(`[AI Agent] Intent classified: ${intent} (confidence: ${intentResult.confidence.toFixed(2)})`)
      
      // Execute action
      const actionResult = await this.executeAction(intent, message, userId, context, bot)
      
      console.log(`[AI Agent] Action executed:`, { success: actionResult.success, hasMessage: !!actionResult.message })
      
      // Add assistant response to conversation history
      if (actionResult.message) {
        this.addToConversationHistory(userId, 'assistant', actionResult.message)
      }
      
      // Return message string for bot, but preserve metadata if available
      const responseMessage = actionResult.message || "I'm not sure how to help with that. Try asking me about your balance or sending payments!"
      
      // If actionResult has hasCloseButton flag, attach it to the return value
      // We'll return an object that the handler can check
      if (actionResult.hasCloseButton) {
        return { message: responseMessage, hasCloseButton: true }
      }
      
      return responseMessage
    } catch (error) {
      console.error('[AI Agent] Error processing natural language:', error)
      console.error('[AI Agent] Error stack:', error.stack)
      const friendlyError = getUserFriendlyError(error, 'general')
      // Ensure we always return a string, not an object
      const errorMessage = typeof friendlyError === 'object' ? friendlyError.message : friendlyError
      return errorMessage || "I encountered an error. Please try again."
    }
  }
}

// Export singleton instance
const aiAgent = new SendCashAI()
export { aiAgent }
