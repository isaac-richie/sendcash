/**
 * Test Education Interface - Gen Z Style
 * Tests the new educational interface that explains SendCash features
 */

import { aiAgent } from '../services/aiAgent.js'

console.log('🧪 Testing Education Interface\n')
console.log('='.repeat(80))

async function testEducation() {
  const testCases = [
    {
      name: 'Direct Education Intent',
      message: 'what can you do',
      expected: 'education'
    },
    {
      name: 'Tell Me About SendCash',
      message: 'tell me about sendcash',
      expected: 'education'
    },
    {
      name: 'What Is This',
      message: 'what is this',
      expected: 'education'
    },
    {
      name: 'How Does This Work',
      message: 'how does this work',
      expected: 'education'
    },
    {
      name: 'What Are You Cooking',
      message: 'what are you cooking',
      expected: 'education'
    }
  ]

  for (const testCase of testCases) {
    console.log(`\n📋 Testing: ${testCase.name}`)
    console.log(`👤 User: "${testCase.message}"`)
    
    try {
      // Classify intent
      const intent = await aiAgent.classifyIntent(testCase.message, 'test_user')
      console.log(`🎯 Intent: ${intent.intent} (confidence: ${intent.confidence})`)
      
      // Execute education
      if (intent.intent === 'education' || intent.intent === 'help') {
        const result = await aiAgent.executeEducation()
        
        if (result && result.success) {
          console.log(`✅ Education response generated`)
          console.log(`📝 Response length: ${result.message.length} characters`)
          console.log(`\n📄 Preview (first 200 chars):`)
          console.log(result.message.substring(0, 200) + '...\n')
        } else {
          console.log(`❌ Failed to generate education response`)
        }
      } else {
        // Try general chat (should detect education keywords)
        const result = await aiAgent.executeGeneralChat(testCase.message, 'test_user', {})
        if (result && result.success && result.message.includes('what we\'re cooking')) {
          console.log(`✅ Education detected via general chat`)
        } else {
          console.log(`⚠️  Intent classified as: ${intent.intent} (expected education)`)
        }
      }
    } catch (error) {
      console.error(`❌ Error: ${error.message}`)
    }
    
    console.log('-'.repeat(80))
  }
}

// Run tests
testEducation().then(() => {
  console.log('\n✅ Education Interface Tests Complete!\n')
  process.exit(0)
}).catch(error => {
  console.error('\n❌ Test failed:', error)
  process.exit(1)
})



