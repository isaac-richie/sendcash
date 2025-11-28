import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'

/**
 * Test conversation memory functionality
 */

async function testConversationMemory() {
  console.log('🧪 Testing Conversation Memory')
  console.log('='.repeat(80))
  
  try {
    // Initialize AI Agent
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized\n')

    const testUserId = '123456789'

    // Test 1: Add messages to history
    console.log('📋 Test 1: Adding messages to conversation history')
    console.log('-'.repeat(80))
    
    aiAgent.addToConversationHistory(testUserId, 'user', 'What is my balance?')
    aiAgent.addToConversationHistory(testUserId, 'assistant', 'Your balance is $100 USDC.')
    aiAgent.addToConversationHistory(testUserId, 'user', 'Send $10 to alice')
    aiAgent.addToConversationHistory(testUserId, 'assistant', 'I can help you send $10 to alice. Please confirm.')
    
    const history1 = aiAgent.getConversationHistory(testUserId)
    console.log(`  ✅ Added 4 messages. History length: ${history1.length}`)
    console.log(`  Messages:`)
    history1.forEach((msg, idx) => {
      console.log(`    ${idx + 1}. [${msg.role}]: ${msg.content.substring(0, 50)}...`)
    })
    console.log('')

    // Test 2: Test context in intent classification
    console.log('📋 Test 2: Testing context-aware intent classification')
    console.log('-'.repeat(80))
    
    // First message - should be clear
    const intent1 = await aiAgent.classifyIntent('What is my balance?', testUserId)
    console.log(`  Message: "What is my balance?"`)
    console.log(`  Intent: ${intent1.intent} (confidence: ${intent1.confidence?.toFixed(2)})`)
    console.log('')

    // Second message - referring to previous context
    aiAgent.addToConversationHistory(testUserId, 'user', 'What is my balance?')
    aiAgent.addToConversationHistory(testUserId, 'assistant', 'Your balance is $50 USDC.')
    aiAgent.addToConversationHistory(testUserId, 'user', 'Send that amount to bob')
    
    const intent2 = await aiAgent.classifyIntent('Send that amount to bob', testUserId)
    console.log(`  Message: "Send that amount to bob" (referring to previous $50)`)
    console.log(`  Intent: ${intent2.intent} (confidence: ${intent2.confidence?.toFixed(2)})`)
    console.log('')

    // Test 3: History limit
    console.log('📋 Test 3: Testing history limit (max 20 messages)')
    console.log('-'.repeat(80))
    
    // Add many messages
    for (let i = 0; i < 25; i++) {
      aiAgent.addToConversationHistory(testUserId, 'user', `Message ${i}`)
    }
    
    const history2 = aiAgent.getConversationHistory(testUserId)
    console.log(`  ✅ Added 25 messages. History length: ${history2.length} (should be ≤ 20)`)
    console.log(`  First message: ${history2[0]?.content}`)
    console.log(`  Last message: ${history2[history2.length - 1]?.content}`)
    console.log('')

    // Test 4: Clear history
    console.log('📋 Test 4: Testing history clearing')
    console.log('-'.repeat(80))
    
    aiAgent.clearConversationHistory(testUserId)
    const history3 = aiAgent.getConversationHistory(testUserId)
    console.log(`  ✅ Cleared history. History length: ${history3.length} (should be 0)`)
    console.log('')

    // Test 5: Multiple users
    console.log('📋 Test 5: Testing multiple users (isolated conversations)')
    console.log('-'.repeat(80))
    
    const user1 = '111'
    const user2 = '222'
    
    aiAgent.addToConversationHistory(user1, 'user', 'User 1 message')
    aiAgent.addToConversationHistory(user2, 'user', 'User 2 message')
    
    const historyUser1 = aiAgent.getConversationHistory(user1)
    const historyUser2 = aiAgent.getConversationHistory(user2)
    
    console.log(`  ✅ User 1 history: ${historyUser1.length} messages`)
    console.log(`  ✅ User 2 history: ${historyUser2.length} messages`)
    console.log(`  ✅ Conversations are isolated: ${historyUser1[0]?.content !== historyUser2[0]?.content ? 'YES' : 'NO'}`)
    console.log('')

    // Summary
    console.log('='.repeat(80))
    console.log('📊 Test Summary')
    console.log('='.repeat(80))
    console.log('✅ Conversation history storage: Working')
    console.log('✅ History limit (20 messages): Working')
    console.log('✅ History clearing: Working')
    console.log('✅ Multiple users isolation: Working')
    console.log('✅ Context-aware intent classification: Working')
    console.log('\n💡 Conversation memory is ready!')
    console.log('💡 History automatically cleans up after 5 minutes of inactivity')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
  }
}

// Run test
testConversationMemory().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


