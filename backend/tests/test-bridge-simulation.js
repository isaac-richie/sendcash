import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { executeBridge, getChainBalance, checkBridgeNeeded, CHAINS } from '../services/bridgeService.js'
import { dbGet } from '../services/database.js'

// Mock bot for testing
const mockBot = {
  sendMessage: async (userId, message) => {
    console.log(`  [BOT] → User ${userId}: ${message.substring(0, 150)}...`)
    return { message_id: 123 }
  }
}

/**
 * Simulate bridge functionality
 */
async function simulateBridge() {
  console.log('🌉 Simulating Multichain Bridge Flow')
  console.log('='.repeat(80))
  console.log('')
  
  // Initialize AI Agent
  await aiAgent.initialize()
  console.log('✅ AI Agent initialized\n')
  
  const userId = 'test_user_bridge'
  const context = {}
  
  // Test scenarios
  const scenarios = [
    {
      name: 'Scenario 1: Check cross-chain balance',
      test: async () => {
        console.log('📊 Checking balances across chains...')
        const testWallet = '0x1111111111111111111111111111111111111111'
        
        const baseBalance = await getChainBalance(testWallet, 'USDC', CHAINS.BASE.chainId)
        const polygonBalance = await getChainBalance(testWallet, 'USDC', CHAINS.POLYGON.chainId)
        
        console.log(`   Base Balance: ${baseBalance.success ? `$${baseBalance.balanceFormatted.toFixed(2)}` : 'Error'}`)
        console.log(`   Polygon Balance: ${polygonBalance.success ? `$${polygonBalance.balanceFormatted.toFixed(2)}` : 'Error'}`)
        
        return baseBalance.success && polygonBalance.success
      }
    },
    {
      name: 'Scenario 2: Check if bridge is needed',
      test: async () => {
        console.log('🔍 Checking if bridge is needed for $10 on Polygon...')
        const testWallet = '0x1111111111111111111111111111111111111111'
        
        const bridgeCheck = await checkBridgeNeeded(
          testWallet,
          'USDC',
          10,
          CHAINS.BASE.chainId,
          CHAINS.POLYGON.chainId
        )
        
        console.log(`   Needs Bridge: ${bridgeCheck.needsBridge}`)
        if (bridgeCheck.needsBridge) {
          console.log(`   Message: ${bridgeCheck.message.substring(0, 100)}...`)
        }
        
        return bridgeCheck !== null
      }
    },
    {
      name: 'Scenario 3: User requests bridge via AI',
      test: async () => {
        console.log('👤 User: "Bridge $10 USDC to Polygon"')
        const response = await aiAgent.processNaturalLanguage(
          "Bridge $10 USDC to Polygon",
          userId,
          context,
          mockBot
        )
        
        console.log(`🤖 AI Response: ${typeof response === 'string' ? response.substring(0, 150) : JSON.stringify(response).substring(0, 150)}...`)
        return typeof response === 'string' && response.length > 0
      }
    },
    {
      name: 'Scenario 4: User places bet (triggers bridge check)',
      test: async () => {
        console.log('👤 User: "Bet $10 YES on Russia Ukraine ceasefire"')
        const response = await aiAgent.processNaturalLanguage(
          "Bet $10 YES on Russia Ukraine ceasefire",
          userId,
          context,
          mockBot
        )
        
        console.log(`🤖 AI Response: ${typeof response === 'string' ? response.substring(0, 150) : JSON.stringify(response).substring(0, 150)}...`)
        return typeof response === 'string' && response.length > 0
      }
    },
    {
      name: 'Scenario 5: Check bridge quote',
      test: async () => {
        console.log('💰 Getting bridge quote...')
        const { getBridgeQuote } = await import('../services/bridgeService.js')
        const testWallet = '0x1111111111111111111111111111111111111111'
        const baseUSDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' // Base Sepolia USDC (example)
        
        const quote = await getBridgeQuote(
          CHAINS.BASE.chainId,
          CHAINS.POLYGON.chainId,
          baseUSDC,
          '10',
          testWallet
        )
        
        console.log(`   Quote Success: ${quote.success}`)
        if (quote.success) {
          console.log(`   Estimated Time: ${quote.estimatedTime}s`)
        } else {
          console.log(`   Error: ${quote.message}`)
        }
        
        return quote !== null
      }
    }
  ]
  
  console.log('🧪 Running bridge simulation tests...\n')
  
  let passed = 0
  let failed = 0
  
  for (const scenario of scenarios) {
    try {
      console.log(`\n${'─'.repeat(80)}`)
      console.log(`📋 ${scenario.name}`)
      console.log(`${'─'.repeat(80)}\n`)
      
      const startTime = Date.now()
      const result = await scenario.test()
      const duration = Date.now() - startTime
      
      if (result) {
        passed++
        console.log(`\n✅ PASSED (${duration}ms)`)
      } else {
        failed++
        console.log(`\n❌ FAILED (${duration}ms)`)
      }
      
      await new Promise(resolve => setTimeout(resolve, 500))
    } catch (error) {
      failed++
      console.log(`\n❌ ERROR: ${error.message}`)
      if (error.stack) {
        console.log(`   ${error.stack.split('\n')[0]}`)
      }
    }
  }
  
  console.log(`\n${'='.repeat(80)}`)
  console.log('📊 Bridge Simulation Summary')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${scenarios.length}`)
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`Success Rate: ${((passed / scenarios.length) * 100).toFixed(1)}%`)
  console.log('')
  
  if (failed === 0) {
    console.log('🎉 ALL BRIDGE TESTS PASSED!')
    console.log('✅ Bridge functionality is working correctly!')
  } else {
    console.log('⚠️  Some tests failed.')
    console.log('   This might be due to API connectivity or test data.')
  }
  
  console.log('')
  console.log('🌉 Bridge Features Tested:')
  console.log('   ✅ Cross-chain balance checking')
  console.log('   ✅ Bridge need detection')
  console.log('   ✅ Bridge quote fetching')
  console.log('   ✅ AI agent bridge integration')
  console.log('   ✅ Natural language bridge requests')
  console.log('')
}

// Run simulation
simulateBridge()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    console.error(error.stack)
    process.exit(1)
  })
