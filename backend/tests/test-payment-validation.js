/**
 * Test Payment Validation
 * Simulates payment sending to verify username validation works correctly
 */

import { aiAgent } from '../services/aiAgent.js'
import { initDatabase, dbGet, dbAll } from '../services/database.js'
import dotenv from 'dotenv'

dotenv.config()

async function testPaymentValidation() {
  console.log('🧪 Testing Payment Validation\n')
  console.log('='.repeat(60))
  
  try {
    // Initialize database
    initDatabase()
    await new Promise(r => setTimeout(r, 500))
    
    // Initialize AI agent
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized\n')
    
    // Get test users
    const testUsers = await dbAll('SELECT * FROM telegram_users WHERE username IS NOT NULL LIMIT 3')
    if (testUsers.length < 2) {
      console.log('⚠️  Need at least 2 registered users for testing')
      console.log('   Found:', testUsers.length)
      return
    }
    
    const sender = testUsers[0]
    const recipient = testUsers[1]
    
    console.log('📋 Test Users:')
    console.log(`   Sender: @${sender.username} (ID: ${sender.telegram_id})`)
    console.log(`   Recipient: @${recipient.username} (ID: ${recipient.telegram_id})`)
    console.log(`   Recipient Wallet: ${recipient.wallet_address}\n`)
    
    // Test 1: Valid username (should pass)
    console.log('📋 Test 1: Valid Username Payment')
    console.log('-'.repeat(60))
    const validMessage = `send 0.1 usdc to @${recipient.username}`
    console.log(`Message: "${validMessage}"`)
    
    try {
      const result = await aiAgent.processNaturalLanguage(
        validMessage,
        sender.telegram_id,
        {
          walletAddress: sender.wallet_address,
          username: sender.username
        },
        null // No bot for testing
      )
      
      console.log('\n✅ Result:')
      if (typeof result === 'object') {
        console.log('   Success:', result.success)
        console.log('   Message preview:', result.message?.substring(0, 150))
      } else {
        console.log('   Response preview:', result.substring(0, 150))
      }
      
      // Check if validation passed
      if (typeof result === 'object' && result.message) {
        if (result.message.includes('Username Not Found') || result.message.includes('Recipient Not Found')) {
          console.log('   ❌ ERROR: Username validation failed for valid username!')
        } else if (result.message.includes('Payment Details') || result.message.includes('confirm')) {
          console.log('   ✅ Validation passed - payment confirmation requested')
        }
      }
    } catch (error) {
      console.error('   ❌ Error:', error.message)
    }
    
    // Test 2: Invalid username (should fail with suggestions)
    console.log('\n📋 Test 2: Invalid Username Payment')
    console.log('-'.repeat(60))
    const invalidMessage = 'send 0.1 usdc to @nonexistentuser12345'
    console.log(`Message: "${invalidMessage}"`)
    
    try {
      const result = await aiAgent.processNaturalLanguage(
        invalidMessage,
        sender.telegram_id,
        {
          walletAddress: sender.wallet_address,
          username: sender.username
        },
        null
      )
      
      console.log('\n✅ Result:')
      if (typeof result === 'object') {
        console.log('   Success:', result.success)
        console.log('   Message preview:', result.message?.substring(0, 200))
      } else {
        console.log('   Response preview:', result.substring(0, 200))
      }
      
      // Check if validation correctly rejected
      if (typeof result === 'object' && result.message) {
        if (result.message.includes('Username Not Found') || result.message.includes('not registered')) {
          console.log('   ✅ Validation correctly rejected invalid username')
        } else {
          console.log('   ⚠️  Validation may not have caught invalid username')
        }
      }
    } catch (error) {
      console.error('   ❌ Error:', error.message)
    }
    
    // Test 3: Test validateUsernameExists directly
    console.log('\n📋 Test 3: Direct Username Validation')
    console.log('-'.repeat(60))
    
    const testUsernames = [
      recipient.username, // Should exist
      'nonexistent123',   // Should not exist
      'blackjinada'       // Should exist (from user's issue)
    ]
    
    for (const username of testUsernames) {
      try {
        const validation = await aiAgent.validateUsernameExists(username)
        console.log(`\n@${username}:`)
        console.log(`   Exists: ${validation.exists}`)
        if (validation.exists) {
          console.log(`   Address: ${validation.address}`)
        } else {
          console.log(`   Suggestions: ${validation.suggestions?.slice(0, 3).join(', ') || 'None'}`)
        }
      } catch (error) {
        console.error(`   ❌ Error validating @${username}:`, error.message)
      }
    }
    
    // Test 4: Test with blackjinada specifically
    console.log('\n📋 Test 4: Specific Test - blackjinada')
    console.log('-'.repeat(60))
    
    const blackjinadaMessage = 'send 0.15 usdc to @blackjinada'
    console.log(`Message: "${blackjinadaMessage}"`)
    
    try {
      // First validate username
      const validation = await aiAgent.validateUsernameExists('blackjinada')
      console.log(`\nUsername validation:`)
      console.log(`   Exists: ${validation.exists}`)
      console.log(`   Address: ${validation.address}`)
      
      if (validation.exists) {
        // Try processing payment
        const result = await aiAgent.processNaturalLanguage(
          blackjinadaMessage,
          sender.telegram_id,
          {
            walletAddress: sender.wallet_address,
            username: sender.username
          },
          null
        )
        
        console.log('\nPayment processing result:')
        if (typeof result === 'object') {
          console.log('   Success:', result.success)
          console.log('   Message preview:', result.message?.substring(0, 200))
          
          if (result.message && (result.message.includes('Username Not Found') || result.message.includes('Recipient Not Found'))) {
            console.log('   ❌ ERROR: Payment failed even though username exists!')
          } else if (result.message && (result.message.includes('Payment Details') || result.message.includes('confirm'))) {
            console.log('   ✅ SUCCESS: Payment validation passed!')
          }
        } else {
          console.log('   Response:', result.substring(0, 200))
        }
      } else {
        console.log('   ⚠️  Username not found - cannot test payment')
      }
    } catch (error) {
      console.error('   ❌ Error:', error.message)
      console.error('   Stack:', error.stack?.split('\n').slice(0, 3).join('\n'))
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ Payment validation tests completed!')
    console.log('\n💡 Summary:')
    console.log('   - Valid usernames should pass validation')
    console.log('   - Invalid usernames should be rejected with suggestions')
    console.log('   - blackjinada should work if registered')
    
  } catch (error) {
    console.error('\n❌ Test error:', error.message)
    console.error('Stack:', error.stack?.split('\n').slice(0, 10).join('\n'))
  }
}

// Run tests
testPaymentValidation().catch(console.error)



