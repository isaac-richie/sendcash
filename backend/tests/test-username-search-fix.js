/**
 * Test: Username Search Extraction Fix
 * Tests improved username extraction from various message formats
 */

import { aiAgent } from '../services/aiAgent.js'

// Mock Telegram bot
const mockBot = {
  sendMessage: async (chatId, message) => {
    console.log(`\n📱 [Mock Bot] Message to ${chatId}:`)
    console.log(`   ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`)
    return { message_id: Date.now() }
  }
}

async function testUsernameSearchExtraction() {
  console.log('🧪 Testing Username Search Extraction Fix\n')
  console.log('='.repeat(60))

  try {
    // Initialize AI Agent
    console.log('\n1️⃣ Initializing AI Agent...')
    await aiAgent.initialize()
    console.log('   ✅ AI Agent initialized')

    // Test cases
    const testCases = [
      { message: 'Search @alice', expected: 'alice', description: 'Basic search format' },
      { message: 'search @bob', expected: 'bob', description: 'Lowercase search' },
      { message: 'Who is @charlie?', expected: 'charlie', description: 'Who is format' },
      { message: 'Who\'s @dave', expected: 'dave', description: 'Who\'s format' },
      { message: 'Find @eve', expected: 'eve', description: 'Find format' },
      { message: 'Check @frank', expected: 'frank', description: 'Check format' },
      { message: 'Lookup @grace', expected: 'grace', description: 'Lookup format' },
      { message: '@alice', expected: 'alice', description: 'Just @username' },
      { message: 'Show me @bob', expected: 'bob', description: 'Show me format' },
      { message: 'What is @charlie', expected: 'charlie', description: 'What is format' },
      { message: 'Search for @dave', expected: 'dave', description: 'Search for format' },
    ]

    console.log('\n2️⃣ Testing Username Extraction:')
    console.log('')

    let passed = 0
    let failed = 0

    for (const testCase of testCases) {
      const result = await aiAgent.processNaturalLanguage(
        testCase.message,
        '999999999',
        {},
        mockBot
      )

      // Check if result contains the expected username
      const containsExpected = result && result.toLowerCase().includes(`@${testCase.expected}`)
      const status = containsExpected ? '✅' : '❌'
      
      console.log(`   ${status} "${testCase.message}"`)
      console.log(`      Expected: @${testCase.expected}`)
      
      if (containsExpected) {
        console.log(`      Result: SUCCESS (found @${testCase.expected})`)
        passed++
      } else {
        console.log(`      Result: FAILED`)
        console.log(`      Preview: ${result?.substring(0, 100) || 'No result'}...`)
        failed++
      }
      console.log('')
    }

    // Summary
    console.log('='.repeat(60))
    console.log('\n📊 Test Results:')
    console.log(`   ✅ Passed: ${passed}/${testCases.length}`)
    console.log(`   ❌ Failed: ${failed}/${testCases.length}`)
    console.log(`   Success Rate: ${((passed / testCases.length) * 100).toFixed(1)}%`)

    if (failed === 0) {
      console.log('\n🎉 All username extraction tests passed!')
    } else {
      console.log('\n⚠️  Some tests failed. Review the results above.')
    }

  } catch (error) {
    console.error('\n❌ Test failed with error:')
    console.error(error)
    console.error('\nStack trace:')
    console.error(error.stack)
    process.exit(1)
  }
}

// Run test
testUsernameSearchExtraction()
  .then(() => {
    console.log('\n✅ Test completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test suite failed:', error)
    process.exit(1)
  })


