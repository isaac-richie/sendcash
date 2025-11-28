import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { dbGet } from '../services/database.js'

/**
 * Test OpenAI integration with AI Agent
 */
async function testOpenAIIntegration() {
  console.log('🤖 Testing OpenAI Integration with AI Agent\n')
  console.log('='.repeat(80))
  
  try {
    // Check if OpenAI is configured
    if (!process.env.OPENAI_API_KEY) {
      console.log('❌ OPENAI_API_KEY not found in .env file')
      console.log('   Please add OPENAI_API_KEY to your .env file')
      return
    }
    
    console.log('✅ OpenAI API Key found')
    
    // Initialize AI Agent
    console.log('\n📋 Test 1: Initializing AI Agent')
    console.log('-'.repeat(80))
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized')
    
    // Get a test user
    const user = await dbGet('SELECT telegram_id, wallet_address, username FROM telegram_users LIMIT 1')
    if (!user) {
      console.log('\n⚠️  No users found. Register a user first with /register @username')
      return
    }
    
    const testUserId = user.telegram_id
    const testWallet = user.wallet_address
    const testUsername = user.username
    
    console.log(`\nTest User: @${testUsername}`)
    console.log(`Wallet: ${testWallet}`)
    
    // Test natural language processing
    const testQueries = [
      "What's my balance?",
      "How much did I spend this month?",
      "Who did I send money to recently?",
      "Send $10 to alice",
      "Show me my transaction history"
    ]
    
    console.log('\n📋 Test 2: Natural Language Processing')
    console.log('-'.repeat(80))
    
    for (const query of testQueries) {
      console.log(`\n💬 User: "${query}"`)
      console.log('🤖 AI Agent processing...')
      
      try {
        const response = await aiAgent.processNaturalLanguage(
          query,
          testUserId,
          { walletAddress: testWallet, username: testUsername }
        )
        
        console.log(`✅ Response: ${response.substring(0, 100)}...`)
      } catch (error) {
        console.log(`❌ Error: ${error.message}`)
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // Test payment intent extraction
    console.log('\n📋 Test 3: Payment Intent Extraction')
    console.log('-'.repeat(80))
    
    const paymentQueries = [
      "Send $50 to bob",
      "Pay alice 100 USDC for lunch",
      "Transfer 25 dollars to charlie"
    ]
    
    for (const query of paymentQueries) {
      console.log(`\n💬 User: "${query}"`)
      const intent = await aiAgent.extractPaymentIntent(query)
      
      if (intent && intent.hasPaymentIntent) {
        console.log('✅ Payment intent detected:')
        console.log(`   Amount: $${intent.amount || 'N/A'}`)
        console.log(`   Recipient: @${intent.recipient || 'N/A'}`)
        console.log(`   Token: ${intent.token || 'N/A'}`)
        console.log(`   Purpose: ${intent.purpose || 'N/A'}`)
      } else {
        console.log('ℹ️  No payment intent detected')
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ OpenAI integration test completed!')
    console.log('\n💡 The AI Agent is now ready to process natural language!')
    console.log('💡 Users can chat naturally with the bot instead of using commands.')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
  }
}

// Run tests
testOpenAIIntegration().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})

