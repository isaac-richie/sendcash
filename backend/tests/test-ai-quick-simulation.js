import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { dbGet } from '../services/database.js'

// Mock bot for testing
const mockBot = {
  sendMessage: async (userId, message) => {
    console.log(`  [BOT] → User ${userId}: ${message.substring(0, 100)}...`)
    return { message_id: 123 }
  }
}

/**
 * Quick simulation test for all AI functions
 */
async function quickSimulation() {
  console.log('🚀 Quick AI Functions Simulation')
  console.log('='.repeat(80))
  console.log('')
  
  const results = {
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: []
  }
  
  const test = (name, fn) => {
    results.tests.push({ name, fn })
  }
  
  // Initialize
  console.log('📦 Initializing AI Agent...')
  await aiAgent.initialize()
  console.log('✅ AI Agent initialized\n')
  
  // Test 1: Core Functions
  test('Initialize', async () => {
    return aiAgent.initialized === true
  })
  
  test('Conversation Memory', async () => {
    aiAgent.addToConversationHistory('test_user', 'user', 'Hello')
    const history = aiAgent.getConversationHistory('test_user')
    aiAgent.clearConversationHistory('test_user')
    return history.length > 0
  })
  
  test('Cache System', async () => {
    aiAgent.setCache('test', { value: 123 }, 'intents')
    const cached = aiAgent.getCached('test', 'intents')
    return cached && cached.value === 123
  })
  
  // Test 2: Intent Classification
  test('Classify Intent - Balance', async () => {
    const result = await aiAgent.classifyIntent("What's my balance?")
    return result && result.intent === 'check_balance' && result.confidence > 0
  })
  
  test('Classify Intent - Payment', async () => {
    const result = await aiAgent.classifyIntent("Send $10 to @alice")
    return result && result.intent === 'send_payment' && result.confidence > 0
  })
  
  test('Classify Intent - History', async () => {
    const result = await aiAgent.classifyIntent("Show my transactions")
    return result && result.intent === 'view_history' && result.confidence > 0
  })
  
  test('Classify Intent - Swap', async () => {
    const result = await aiAgent.classifyIntent("Swap 100 USDC to USDT")
    return result && result.intent === 'swap_tokens' && result.confidence > 0
  })
  
  test('Classify Intent - Schedule Payment', async () => {
    const result = await aiAgent.classifyIntent("Send $10 to @alice in 2 minutes")
    return result && result.intent === 'schedule_payment' && result.confidence > 0
  })
  
  // Test 3: Payment Extraction
  test('Extract Payment Intent', async () => {
    const result = await aiAgent.extractPaymentIntent("Send $10 USDC to @alice")
    return result && result.hasPaymentIntent === true && 
           result.amount === 10 && result.recipient === 'alice'
  })
  
  test('Extract Scheduled Payment', async () => {
    const result = await aiAgent.extractPaymentIntent("Send $10 to @alice in 2 minutes")
    return result && result.hasPaymentIntent === true && 
           result.isScheduled === true && result.scheduledDate !== null
  })
  
  test('Manual Extract Payment', async () => {
    const result = aiAgent.manualExtractPayment("Send $10 to @alice")
    return result && result.amount === '10' && result.recipient === 'alice'
  })
  
  // Test 4: Wallet Functions
  test('Get Wallet Balances', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const balances = await aiAgent.getWalletBalances(testWallet)
    return balances && typeof balances === 'object' && 
           (balances.USDC !== undefined || balances.USDT !== undefined)
  })
  
  test('Analyze Wallet Activity', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const analysis = await aiAgent.analyzeWalletActivity(testWallet)
    return analysis && analysis.balances && analysis.paymentStats && 
           analysis.insights && Array.isArray(analysis.insights)
  })
  
  // Test 5: Execute Functions (with mock wallet)
  test('Execute Check Balance', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.executeCheckBalance(testWallet)
    return result && result.success !== undefined
  })
  
  test('Execute View History', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.executeViewHistory(testWallet)
    return result && result.success !== undefined
  })
  
  test('Execute Get Insights', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.executeGetInsights(testWallet)
    return result && result.success !== undefined
  })
  
  test('Execute Help', async () => {
    const result = await aiAgent.executeHelp()
    return result && result.success === true && result.message.length > 0
  })
  
  test('Execute Search Username', async () => {
    const result = await aiAgent.executeSearchUsername("Search @testuser")
    return result && result.success !== undefined
  })
  
  // Test 6: Swap Functions
  test('Manual Extract Swap', async () => {
    const result = aiAgent.manualExtractSwap("Swap 100 USDC to USDT")
    return result && result.fromToken === 'USDC' && 
           result.toToken === 'USDT' && result.amount === '100'
  })
  
  // Test 7: Username Validation
  test('Validate Username Exists', async () => {
    const result = await aiAgent.validateUsernameExists('nonexistentuser12345')
    return result && typeof result.exists === 'boolean'
  })
  
  // Test 8: Process Natural Language
  test('Process Natural Language - Balance', async () => {
    const result = await aiAgent.processNaturalLanguage(
      "What's my balance?",
      'test_user',
      { walletAddress: '0x1111111111111111111111111111111111111111' },
      mockBot
    )
    return typeof result === 'string' && result.length > 0
  })
  
  test('Process Natural Language - Help', async () => {
    const result = await aiAgent.processNaturalLanguage(
      "help",
      'test_user',
      {},
      mockBot
    )
    return typeof result === 'string' && result.length > 0
  })
  
  // Test 9: Action Execution
  test('Execute Action - Check Balance', async () => {
    const result = await aiAgent.executeAction(
      'check_balance',
      "What's my balance?",
      'test_user',
      { walletAddress: '0x1111111111111111111111111111111111111111' }
    )
    return result && result.success !== undefined
  })
  
  test('Execute Action - View History', async () => {
    const result = await aiAgent.executeAction(
      'view_history',
      "Show my transactions",
      'test_user',
      { walletAddress: '0x1111111111111111111111111111111111111111' }
    )
    return result && result.success !== undefined
  })
  
  test('Execute Action - Get Insights', async () => {
    const result = await aiAgent.executeAction(
      'get_insights',
      "Wallet insights",
      'test_user',
      { walletAddress: '0x1111111111111111111111111111111111111111' }
    )
    return result && result.success !== undefined
  })
  
  // Test 10: Analytics Functions
  test('Get Activity Summary', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const summary = await aiAgent.getActivitySummary(testWallet, 30)
    return summary && summary.period && typeof summary.totalTransactions === 'number'
  })
  
  test('Detect Unusual Activity', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.detectUnusualActivity(testWallet)
    return result && result.riskLevel && Array.isArray(result.alerts)
  })
  
  // Test 11: Format Functions
  test('Format for LLM', async () => {
    const testAnalysis = {
      address: '0x123',
      balances: { USDC: { amount: '10' } },
      paymentStats: { totalSent: 0, totalReceived: 0, transactionCount: 0 },
      insights: []
    }
    const formatted = aiAgent.formatForLLM(testAnalysis)
    return typeof formatted === 'string' && formatted.length > 0
  })
  
  // Run all tests
  console.log('🧪 Running quick simulation tests...\n')
  
  for (const { name, fn } of results.tests) {
    try {
      const startTime = Date.now()
      const result = await fn()
      const duration = Date.now() - startTime
      
      if (result === true) {
        results.passed++
        console.log(`✅ ${name} (${duration}ms)`)
      } else if (result === null || result === 'skip') {
        results.skipped++
        console.log(`⏭️  ${name} (skipped)`)
      } else {
        results.failed++
        console.log(`❌ ${name} - Returned: ${result}`)
      }
    } catch (error) {
      results.failed++
      console.log(`❌ ${name} - Error: ${error.message}`)
      if (error.stack) {
        console.log(`   ${error.stack.split('\n')[0]}`)
      }
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  // Summary
  console.log('')
  console.log('='.repeat(80))
  console.log('📊 Quick Simulation Summary')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${results.tests.length}`)
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`⏭️  Skipped: ${results.skipped}`)
  console.log(`Success Rate: ${((results.passed / (results.tests.length - results.skipped)) * 100).toFixed(1)}%`)
  console.log('')
  
  if (results.failed === 0) {
    console.log('🎉 ALL AI FUNCTIONS WORKING CORRECTLY!')
    console.log('✅ All core AI functions passed the simulation!')
  } else {
    console.log('⚠️  Some functions failed. Review the errors above.')
  }
  
  console.log('')
  console.log('📋 Functions Tested:')
  console.log('   ✅ Intent Classification')
  console.log('   ✅ Payment Extraction')
  console.log('   ✅ Wallet Operations')
  console.log('   ✅ Action Execution')
  console.log('   ✅ Natural Language Processing')
  console.log('   ✅ Analytics & Insights')
  console.log('   ✅ Username Validation')
  console.log('   ✅ Swap Operations')
  console.log('   ✅ Conversation Memory')
  console.log('   ✅ Caching System')
  console.log('')
}

// Run simulation
quickSimulation()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    console.error(error.stack)
    process.exit(1)
  })
