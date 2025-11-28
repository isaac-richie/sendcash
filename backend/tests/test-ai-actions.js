import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { executePayment, executeRegisterUsername } from '../services/aiActions.js'
import { dbGet } from '../services/database.js'

/**
 * Test AI Agent Action Execution
 */
async function testAIActions() {
  console.log('🤖 Testing AI Agent Action Execution\n')
  console.log('='.repeat(80))
  
  try {
    // Initialize
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized\n')
    
    // Get test user
    const user = await dbGet('SELECT telegram_id, wallet_address, username FROM telegram_users LIMIT 1')
    if (!user) {
      console.log('⚠️  No users found. Register a user first.')
      return
    }
    
    console.log(`Test User: @${user.username}`)
    console.log(`Wallet: ${user.wallet_address}\n`)
    
    // Test 1: Intent Classification
    console.log('📋 Test 1: Intent Classification')
    console.log('-'.repeat(80))
    
    const testMessages = [
      "What's my balance?",
      "Send $10 to alice",
      "Show my transactions",
      "How much did I spend?",
      "Register @testuser"
    ]
    
    for (const msg of testMessages) {
      const intent = await aiAgent.classifyIntent(msg)
      console.log(`"${msg}" → ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Test 2: Action Execution - Check Balance
    console.log('\n📋 Test 2: Execute Check Balance')
    console.log('-'.repeat(80))
    const balanceResult = await aiAgent.executeCheckBalance(user.wallet_address)
    console.log(`Success: ${balanceResult.success}`)
    console.log(`Message: ${balanceResult.message.substring(0, 100)}...`)
    
    // Test 3: Action Execution - View History
    console.log('\n📋 Test 3: Execute View History')
    console.log('-'.repeat(80))
    const historyResult = await aiAgent.executeViewHistory(user.wallet_address)
    console.log(`Success: ${historyResult.success}`)
    console.log(`Message: ${historyResult.message.substring(0, 100)}...`)
    
    // Test 4: Action Execution - Get Insights
    console.log('\n📋 Test 4: Execute Get Insights')
    console.log('-'.repeat(80))
    const insightsResult = await aiAgent.executeGetInsights(user.wallet_address)
    console.log(`Success: ${insightsResult.success}`)
    console.log(`Message: ${insightsResult.message.substring(0, 150)}...`)
    
    // Test 5: Payment Intent Extraction
    console.log('\n📋 Test 5: Payment Intent Extraction')
    console.log('-'.repeat(80))
    const paymentQueries = [
      "Send $50 to bob",
      "Pay alice 100 USDC for lunch",
      "Transfer 25 dollars to charlie"
    ]
    
    for (const query of paymentQueries) {
      const intent = await aiAgent.extractPaymentIntent(query)
      if (intent && intent.hasPaymentIntent) {
        console.log(`"${query}"`)
        console.log(`  Amount: $${intent.amount || 'N/A'}`)
        console.log(`  Recipient: @${intent.recipient || 'N/A'}`)
        console.log(`  Token: ${intent.token || 'N/A'}`)
        console.log(`  Purpose: ${intent.purpose || 'N/A'}`)
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Test 6: Full Flow - Natural Language Processing
    console.log('\n📋 Test 6: Full Flow - Natural Language Processing')
    console.log('-'.repeat(80))
    console.log('Testing complete flow: Intent → Action → Response')
    
    const testQuery = "What's my balance?"
    console.log(`\nUser: "${testQuery}"`)
    
    const intent = await aiAgent.classifyIntent(testQuery)
    console.log(`Intent: ${intent.intent}`)
    
    const actionResult = await aiAgent.executeAction(
      intent.intent,
      testQuery,
      user.telegram_id,
      { walletAddress: user.wallet_address, username: user.username }
    )
    
    console.log(`Result: ${actionResult.success ? '✅' : '❌'}`)
    console.log(`Response: ${actionResult.message.substring(0, 150)}...`)
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ All action execution tests completed!')
    console.log('\n💡 The AI Agent can now execute tasks based on natural language!')
    console.log('💡 Users can chat naturally and the AI will perform actions automatically.')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
  }
}

// Run tests
testAIActions().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


