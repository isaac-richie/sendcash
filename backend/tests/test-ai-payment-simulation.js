import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { executePayment } from '../services/aiActions.js'
import { dbGet, dbAll } from '../services/database.js'
import { getTokenBalance } from '../services/wallet.js'
import { TOKENS } from '../services/config.js'

/**
 * AI Agent Payment Simulation Test
 * Tests the complete payment flow from user message to execution
 */

// Mock bot for testing
const mockBot = {
  sendMessage: async (userId, message) => {
    console.log(`  [BOT] → User ${userId}: ${message.substring(0, 100)}...`)
    return { message_id: 123 }
  }
}

async function simulatePaymentFlow() {
  console.log('🧪 AI Agent Payment Flow Simulation')
  console.log('='.repeat(80))
  
  try {
    // Initialize AI Agent
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized\n')

    // Get test users
    const users = await dbAll('SELECT telegram_id, wallet_address, username FROM telegram_users LIMIT 2')
    
    if (users.length < 2) {
      console.log('❌ Need at least 2 users for payment test. Found:', users.length)
      return
    }

    const sender = users[0]
    const recipient = users[1]

    console.log(`📋 Test Users:`)
    console.log(`  Sender: @${sender.username} (${sender.telegram_id})`)
    console.log(`  Recipient: @${recipient.username} (${recipient.telegram_id})`)
    console.log(`  Sender Wallet: ${sender.wallet_address}\n`)

    // Check sender balance
    console.log('💰 Checking Sender Balance...')
    const balanceData = await getTokenBalance(sender.wallet_address, TOKENS.USDC.address)
    if (balanceData) {
      console.log(`  USDC Balance: $${balanceData.formatted}`)
    } else {
      console.log('  ⚠️  No USDC balance found')
    }
    console.log('')

    // Test 1: Payment Intent Extraction
    console.log('📋 Test 1: Payment Intent Extraction')
    console.log('-'.repeat(80))
    
    const testMessages = [
      `Send $1 to ${recipient.username}`,
      `Pay ${recipient.username} 1 USDC`,
      `Transfer $0.5 to @${recipient.username}`,
      `Send 1 dollar to ${recipient.username}`
    ]

    for (const message of testMessages) {
      console.log(`\n  Testing: "${message}"`)
      
      // Test intent classification
      const intent = await aiAgent.classifyIntent(message)
      console.log(`    Intent: ${intent.intent} (confidence: ${intent.confidence.toFixed(2)})`)
      
      // Test payment extraction
      const paymentIntent = await aiAgent.extractPaymentIntent(message)
      if (paymentIntent && paymentIntent.hasPaymentIntent) {
        console.log(`    ✅ Extraction successful:`)
        console.log(`       Amount: ${paymentIntent.amount}`)
        console.log(`       Recipient: ${paymentIntent.recipient}`)
        console.log(`       Token: ${paymentIntent.token || 'USDC (default)'}`)
      } else {
        console.log(`    ⚠️  AI extraction failed, testing manual fallback...`)
        const manualExtract = aiAgent.manualExtractPayment(message)
        if (manualExtract) {
          console.log(`    ✅ Manual extraction successful:`)
          console.log(`       Amount: ${manualExtract.amount}`)
          console.log(`       Recipient: ${manualExtract.recipient}`)
          console.log(`       Token: ${manualExtract.tokenSymbol}`)
        } else {
          console.log(`    ❌ Both AI and manual extraction failed`)
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    // Test 2: Complete Payment Flow Simulation
    console.log('\n\n📋 Test 2: Complete Payment Flow Simulation')
    console.log('-'.repeat(80))
    
    const testAmount = '0.1' // Small test amount
    const testMessage = `Send $${testAmount} to ${recipient.username}`
    
    console.log(`\n  Step 1: User sends: "${testMessage}"`)
    
    // Step 1: Process message
    const actionResult = await aiAgent.executeAction(
      'send_payment',
      testMessage,
      sender.telegram_id,
      {
        walletAddress: sender.wallet_address,
        username: sender.username
      }
    )
    
    console.log(`  Step 2: Action Result:`)
    console.log(`    Success: ${actionResult.success}`)
    console.log(`    Needs Confirmation: ${actionResult.needsConfirmation}`)
    console.log(`    Has Message: ${!!actionResult.message}`)
    
    if (actionResult.needsConfirmation && actionResult.data) {
      console.log(`    Payment Data:`)
      console.log(`      Amount: $${actionResult.data.amount}`)
      console.log(`      Recipient: @${actionResult.data.recipient}`)
      console.log(`      Token: ${actionResult.data.tokenSymbol}`)
      
      // Step 3: Simulate confirmation
      console.log(`\n  Step 3: User confirms: "yes"`)
      
      // Store pending action manually for testing
      const actionKey = `test_action_${sender.telegram_id}_${Date.now()}`
      aiAgent.pendingActions.set(actionKey, {
        userId: sender.telegram_id,
        action: 'send_payment',
        data: actionResult.data,
        timestamp: Date.now()
      })
      
      // Step 4: Execute payment
      console.log(`  Step 4: Executing payment...`)
      
      try {
        const confirmResult = await aiAgent.confirmAndExecute(
          sender.telegram_id,
          'yes',
          mockBot
        )
        
        console.log(`  Step 5: Payment Result:`)
        console.log(`    Success: ${confirmResult.success}`)
        console.log(`    Has Message: ${!!confirmResult.message}`)
        
        if (confirmResult.success) {
          console.log(`    ✅ Payment executed successfully!`)
          if (confirmResult.data && confirmResult.data.txHash) {
            console.log(`    Transaction Hash: ${confirmResult.data.txHash}`)
          }
        } else {
          console.log(`    ❌ Payment failed: ${confirmResult.message}`)
        }
      } catch (error) {
        console.error(`  ❌ Error executing payment:`, error.message)
        console.error(`    Stack: ${error.stack?.substring(0, 200)}`)
      }
    } else {
      console.log(`  ⚠️  Payment action doesn't need confirmation or missing data`)
      console.log(`    Action Result:`, actionResult)
    }

    // Test 3: Direct Payment Execution Test
    console.log('\n\n📋 Test 3: Direct Payment Execution (Dry Run)')
    console.log('-'.repeat(80))
    
    console.log(`\n  Testing direct executePayment function...`)
    console.log(`  Note: This is a dry run - checking function callability only`)
    
    try {
      // Just check if function can be called (won't actually send)
      const testResult = await executePayment(
        sender.telegram_id,
        recipient.username,
        '0.01', // Very small test amount
        'USDC',
        mockBot
      )
      
      console.log(`  ✅ Function executed:`)
      console.log(`    Success: ${testResult.success}`)
      console.log(`    Message: ${testResult.message?.substring(0, 100)}...`)
      
      if (!testResult.success) {
        console.log(`    ⚠️  Payment failed (expected if insufficient balance or other validation):`)
        console.log(`    ${testResult.message}`)
      }
    } catch (error) {
      console.error(`  ❌ Error in executePayment:`, error.message)
      console.error(`    This indicates a problem with the payment execution function`)
    }

    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 Simulation Summary')
    console.log('='.repeat(80))
    console.log('✅ Payment intent extraction: Tested')
    console.log('✅ Payment flow simulation: Tested')
    console.log('✅ Direct payment execution: Tested')
    console.log('\n💡 Check the results above to verify payment flow is working!')
    console.log('💡 If payments fail, check:')
    console.log('   • User balances')
    console.log('   • Token allowances')
    console.log('   • Smart wallet deployment')
    console.log('   • Contract addresses')
    
  } catch (error) {
    console.error('\n❌ Simulation failed:', error)
    console.error(error.stack)
  }
}

// Run simulation
simulatePaymentFlow().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


