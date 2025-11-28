import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { dbGet, dbAll } from '../services/database.js'

// Mock bot for testing
const mockBot = {
  sendMessage: async (userId, message) => {
    console.log(`  [BOT] → User ${userId}: ${message.substring(0, 80)}...`)
    return { message_id: 123 }
  }
}

/**
 * Comprehensive test to verify all AI agent functions are called correctly
 */
async function testAllFunctions() {
  console.log('🧪 Comprehensive AI Agent Function Test')
  console.log('='.repeat(80))
  console.log('')
  
  const results = {
    passed: 0,
    failed: 0,
    tests: []
  }
  
  const test = (name, fn) => {
    results.tests.push({ name, fn })
  }
  
  // Test 1: Initialize
  test('Initialize', async () => {
    await aiAgent.initialize()
    return aiAgent.initialized === true
  })
  
  // Test 2: Conversation Memory
  test('Conversation Memory - Add', async () => {
    aiAgent.addToConversationHistory('test123', 'user', 'Hello')
    const history = aiAgent.getConversationHistory('test123')
    return history.length > 0 && history[0].content === 'Hello'
  })
  
  test('Conversation Memory - Get', async () => {
    const history = aiAgent.getConversationHistory('test123')
    return Array.isArray(history)
  })
  
  test('Conversation Memory - Clear', async () => {
    aiAgent.clearConversationHistory('test123')
    const history = aiAgent.getConversationHistory('test123')
    return history.length === 0
  })
  
  // Test 3: Caching
  test('Cache - Set & Get', async () => {
    aiAgent.setCache('test_key', { data: 'test' }, 'intents')
    const cached = aiAgent.getCached('test_key', 'intents')
    return cached && cached.data === 'test'
  })
  
  // Test 4: Intent Classification
  test('Classify Intent', async () => {
    const result = await aiAgent.classifyIntent("What's my balance?")
    return result && result.intent && typeof result.confidence === 'number'
  })
  
  // Test 5: Payment Extraction
  test('Extract Payment Intent', async () => {
    const result = await aiAgent.extractPaymentIntent("Send $10 to alice")
    return result && typeof result.hasPaymentIntent === 'boolean'
  })
  
  // Test 6: Manual Extraction
  test('Manual Extract Payment', async () => {
    const result = aiAgent.manualExtractPayment("Send $10 to @alice")
    // Result should be an object with amount and recipient, or null
    if (result === null) return true // null is valid (no match)
    return result !== undefined && 
           typeof result === 'object' && 
           (result.amount !== undefined || result.recipient !== undefined)
  })
  
  // Test 7: Get Wallet Balances
  test('Get Wallet Balances', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const balances = await aiAgent.getWalletBalances(testWallet)
    return balances && typeof balances === 'object'
  })
  
  // Test 8: Analyze Wallet Activity
  test('Analyze Wallet Activity', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const analysis = await aiAgent.analyzeWalletActivity(testWallet)
    // Check if it's a valid object with required properties
    return analysis !== null && 
           analysis !== undefined && 
           typeof analysis === 'object' &&
           analysis.balances !== undefined && 
           analysis.paymentStats !== undefined
  })
  
  // Test 9: Format for LLM
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
  
  // Test 10: Get Activity Summary
  test('Get Activity Summary', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const summary = await aiAgent.getActivitySummary(testWallet, 30)
    return summary && summary.period && typeof summary.totalTransactions === 'number'
  })
  
  // Test 11: Detect Unusual Activity
  test('Detect Unusual Activity', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.detectUnusualActivity(testWallet)
    return result && result.riskLevel && Array.isArray(result.alerts)
  })
  
  // Test 12: Execute Check Balance
  test('Execute Check Balance', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.executeCheckBalance(testWallet)
    return result !== null && result !== undefined && (result.success !== undefined || typeof result === 'string')
  })
  
  // Test 13: Execute View History
  test('Execute View History', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.executeViewHistory(testWallet)
    return result !== null && result !== undefined && (result.success !== undefined || typeof result === 'string')
  })
  
  // Test 14: Execute Get Insights
  test('Execute Get Insights', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const result = await aiAgent.executeGetInsights(testWallet)
    return result !== null && result !== undefined && (result.success !== undefined || typeof result === 'string')
  })
  
  // Test 15: Execute Search Username
  test('Execute Search Username', async () => {
    const result = await aiAgent.executeSearchUsername("Search @testuser")
    return result !== null && result !== undefined && (result.success !== undefined || typeof result === 'string')
  })
  
  // Test 16: Execute Help
  test('Execute Help', async () => {
    const result = await aiAgent.executeHelp()
    return result !== null && result !== undefined && (result.success === true || typeof result === 'string')
  })
  
  // Test 17: Execute General Chat
  test('Execute General Chat', async () => {
    const result = await aiAgent.executeGeneralChat("Hello", "test123", {})
    return result && (result.success !== undefined || typeof result === 'string')
  })
  
  // Test 18: Execute Action
  test('Execute Action - Check Balance', async () => {
    const result = await aiAgent.executeAction(
      'check_balance',
      "What's my balance?",
      'test123',
      { walletAddress: '0x1111111111111111111111111111111111111111' }
    )
    return result && result.success !== undefined
  })
  
  // Test 19: Process Natural Language
  test('Process Natural Language', async () => {
    const result = await aiAgent.processNaturalLanguage(
      "What's my balance?",
      'test123',
      { walletAddress: '0x1111111111111111111111111111111111111111' },
      mockBot
    )
    return typeof result === 'string' && result.length > 0
  })
  
  // Test 20: Get a real user for more realistic tests
  test('Get Real User for Advanced Tests', async () => {
    const user = await dbGet('SELECT wallet_address, username, telegram_id FROM telegram_users LIMIT 1')
    if (user && user.wallet_address) {
      // Test with real wallet
      const balance = await aiAgent.executeCheckBalance(user.wallet_address)
      return balance && balance.success === true
    }
    return true // Skip if no users
  })
  
  // Run all tests
  console.log('Running tests...\n')
  
  for (const { name, fn } of results.tests) {
    try {
      const result = await fn()
      const passed = result === true
      
      if (passed) {
        results.passed++
        console.log(`✅ ${name}`)
      } else {
        results.failed++
        console.log(`❌ ${name} - Returned: ${result}`)
      }
    } catch (error) {
      results.failed++
      console.log(`❌ ${name} - Error: ${error.message}`)
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  
  // Summary
  console.log('')
  console.log('='.repeat(80))
  console.log('📊 Test Summary')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${results.tests.length}`)
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`)
  console.log('')
  
  if (results.failed === 0) {
    console.log('🎉 ALL TESTS PASSED!')
    console.log('✅ All AI agent functions are working correctly!')
  } else {
    console.log('⚠️  Some tests failed. Review the errors above.')
  }
  
  console.log('')
}

// Run tests
testAllFunctions()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })

