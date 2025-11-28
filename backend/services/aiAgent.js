import { ethers } from 'ethers'
import { BASE_RPC, CONTRACTS, TOKENS } from './config.js'
import { dbGet, dbAll } from './database.js'
import { getTokenBalance } from './wallet.js'
import OpenAI from 'openai'
import dotenv from 'dotenv'
import { getUserFriendlyError } from './errorMessages.js'
import { executePayment, executeRegisterUsername } from './aiActions.js'

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
- check_balance: User wants to check their wallet balance
- send_payment: User wants to send a payment to someone
- view_history: User wants to see transaction history
- get_insights: User wants spending insights or analysis
- register_username: User wants to register a username
- search_username: User wants to search/lookup a username
- export_key: User wants to export/show their private key (e.g., "export my key", "show private key", "export key")
- help: User needs help or wants to know what the bot can do
- general_chat: General conversation, greetings, questions not related to SendCash

Return ONLY a JSON object with "intent" and "confidence" (0-1).
Example: {"intent": "check_balance", "confidence": 0.95}`

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
- token: string (USDC, USDT, WBTC - default to USDC if not specified)
- memo: string (optional note/purpose for the payment)

If no payment intent is found, return {"hasPaymentIntent": false}.
Example: {"hasPaymentIntent": true, "amount": 10, "recipient": "alice", "token": "USDC", "memo": "for lunch"}`

      const messages = [
        { role: 'system', content: systemPrompt },
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
    
    // Extract recipient
    const recipientPatterns = [
      /@(\w+)/,
      /(?:to|for)\s+@?(\w+)/i,
      /(?:send|pay|transfer).*?@?(\w+)/
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
      
      case 'register_username':
        return await this.executeRegisterUsername(message, userId, context, bot)
      
      case 'search_username':
        return await this.executeSearchUsername(message)
      
      case 'export_key':
      case 'export_private_key':
      case 'show_private_key':
        return await this.executeExportPrivateKey(userId, bot)
      
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
        const tokenSymbol = manualExtract.tokenSymbol || 'USDC'
        const memo = manualExtract.memo
        
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
        paymentIntent.token = contextToken || 'USDC'
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
      const tokenSymbol = (paymentIntent.token || contextToken || 'USDC').toUpperCase()
      const memo = paymentIntent.memo || null
      
      if (!amount || !recipient) {
        const friendlyError = getUserFriendlyError('Missing payment details', 'payment')
        return {
          success: false,
          message: friendlyError.message || friendlyError
        }
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
        data: { transactions }
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
      const analysis = await this.analyzeWalletActivity(walletAddress)
      
      let message = `📊 **Your Wallet Insights:**\n\n`
      message += `💸 **Spending Summary:**\n`
      message += `• Total Sent: $${analysis.paymentStats.totalSent.toFixed(2)}\n`
      message += `• Total Received: $${analysis.paymentStats.totalReceived.toFixed(2)}\n`
      message += `• Transactions: ${analysis.paymentStats.transactionCount}\n\n`
      
      if (analysis.paymentStats.topRecipients.length > 0) {
        message += `👥 **Top Recipients:**\n`
        analysis.paymentStats.topRecipients.slice(0, 3).forEach((recipient, idx) => {
          message += `${idx + 1}. @${recipient.username}: $${recipient.amount.toFixed(2)}\n`
        })
        message += `\n`
      }
      
      message += `💡 **Insights:**\n`
      analysis.insights.forEach((insight, idx) => {
        message += `${idx + 1}. ${insight}\n`
      })
      
      return {
        success: true,
        message,
        data: analysis
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
      
      const address = await registry.getAddress(username)
      
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
        `• "Pay bob 50 USDC for lunch"\n\n` +
        `📋 **History & Insights**\n` +
        `• "Show my transactions"\n` +
        `• "How much did I spend?"\n` +
        `• "Wallet insights"\n\n` +
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
      
      // Return message string for bot
      return actionResult.message || "I'm not sure how to help with that. Try asking me about your balance or sending payments!"
    } catch (error) {
      console.error('[AI Agent] Error processing natural language:', error)
      const friendlyError = getUserFriendlyError(error, 'general')
      return friendlyError.message || friendlyError || "I encountered an error. Please try again."
    }
  }
}

// Export singleton instance
const aiAgent = new SendCashAI()
export { aiAgent }
