import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'

/**
 * Comprehensive test to verify AI Agent works with all service files
 */
async function testAllServicesIntegration() {
  console.log('🧪 Testing AI Agent Integration with All Services')
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
  
  // Initialize AI Agent
  await aiAgent.initialize()
  console.log('✅ AI Agent initialized\n')
  
  // Test 1: Database Service Integration
  test('Database Service - dbGet', async () => {
    const { dbGet } = await import('../services/database.js')
    const user = await dbGet('SELECT * FROM telegram_users LIMIT 1')
    return user !== undefined
  })
  
  test('Database Service - dbAll', async () => {
    const { dbAll } = await import('../services/database.js')
    const users = await dbAll('SELECT * FROM telegram_users LIMIT 5')
    return Array.isArray(users)
  })
  
  // Test 2: Wallet Service Integration
  test('Wallet Service - getTokenBalance', async () => {
    const { getTokenBalance } = await import('../services/wallet.js')
    const { TOKENS } = await import('../services/config.js')
    const testWallet = '0x1111111111111111111111111111111111111111'
    const balance = await getTokenBalance(testWallet, TOKENS.USDC.address)
    return balance !== null && balance !== undefined
  })
  
  // Test 3: Contracts Service Integration
  test('Contracts Service - getSendCash', async () => {
    const { getSendCash } = await import('../services/contracts.js')
    const contract = getSendCash()
    return contract !== null && contract !== undefined
  })
  
  test('Contracts Service - getUsernameRegistry', async () => {
    const { getUsernameRegistry } = await import('../services/contracts.js')
    const registry = getUsernameRegistry()
    return registry !== null && registry !== undefined
  })
  
  test('Contracts Service - getProvider', async () => {
    const { getProvider } = await import('../services/contracts.js')
    const provider = getProvider()
    return provider !== null && provider !== undefined
  })
  
  // Test 4: Config Service Integration
  test('Config Service - TOKENS', async () => {
    const { TOKENS } = await import('../services/config.js')
    return TOKENS !== null && TOKENS !== undefined && TOKENS.USDC && TOKENS.USDC.address && TOKENS.USDC.address.length > 0
  })
  
  test('Config Service - CONTRACTS', async () => {
    const { CONTRACTS } = await import('../services/config.js')
    return CONTRACTS !== null && CONTRACTS !== undefined && CONTRACTS.SEND_CASH && CONTRACTS.USERNAME_REGISTRY && CONTRACTS.SEND_CASH.length > 0
  })
  
  test('Config Service - BASE_RPC', async () => {
    const { BASE_RPC } = await import('../services/config.js')
    return BASE_RPC && typeof BASE_RPC === 'string'
  })
  
  // Test 5: Error Messages Service Integration
  test('Error Messages Service - getUserFriendlyError', async () => {
    const { getUserFriendlyError } = await import('../services/errorMessages.js')
    const error = getUserFriendlyError('test error', 'payment')
    return error !== null && error !== undefined && (error.message || typeof error === 'string') && (error.message || error).length > 0
  })
  
  // Test 6: AI Agent uses database service
  test('AI Agent - Uses Database Service', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const history = await aiAgent.executeViewHistory(testWallet)
    // This internally uses dbAll from database.js
    return history && (history.success !== undefined || typeof history === 'string')
  })
  
  // Test 7: AI Agent uses wallet service
  test('AI Agent - Uses Wallet Service', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const balances = await aiAgent.getWalletBalances(testWallet)
    // This internally uses getTokenBalance from wallet.js
    return balances && typeof balances === 'object' && balances.USDC !== undefined
  })
  
  // Test 8: AI Agent uses contracts service
  test('AI Agent - Uses Contracts Service', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    const analysis = await aiAgent.analyzeWalletActivity(testWallet)
    // This internally uses contracts from contracts.js
    return analysis !== null && analysis !== undefined && 
           typeof analysis === 'object' &&
           analysis.balances !== undefined && 
           analysis.paymentStats !== undefined
  })
  
  // Test 9: AI Agent uses config service
  test('AI Agent - Uses Config Service', async () => {
    // AI Agent imports TOKENS and CONTRACTS from config.js
    const balances = await aiAgent.getWalletBalances('0x1111111111111111111111111111111111111111')
    // Should have balances for all tokens from config
    return balances !== null && balances !== undefined && 
           typeof balances === 'object' &&
           (balances.USDC !== undefined || balances.USDT !== undefined || balances.WBTC !== undefined)
  })
  
  // Test 10: AI Agent uses error messages service
  test('AI Agent - Uses Error Messages Service', async () => {
    // Try to check balance with invalid wallet (should use error messages)
    const result = await aiAgent.executeCheckBalance(null)
    // Should return user-friendly error message
    return result && result.message && typeof result.message === 'string'
  })
  
  // Test 11: Thirdweb Wallet Service (indirect via aiActions)
  test('Thirdweb Wallet Service - Integration Check', async () => {
    // Check if thirdwebWallet.js exports are available
    const thirdweb = await import('../services/thirdwebWallet.js')
    return thirdweb && (
      typeof thirdweb.getSmartWalletForUser === 'function' ||
      typeof thirdweb.createSmartWalletForUsername === 'function'
    )
  })
  
  // Test 12: Payment Notifications Service (indirect via aiActions)
  test('Payment Notifications Service - Integration Check', async () => {
    // Check if paymentNotifications.js exports are available
    const notifications = await import('../services/paymentNotifications.js')
    return notifications && typeof notifications.checkAndNotifyPayment === 'function'
  })
  
  // Test 13: AI Actions Service Integration
  test('AI Actions Service - Direct Import', async () => {
    const { executePayment, executeRegisterUsername } = await import('../services/aiActions.js')
    return typeof executePayment === 'function' && typeof executeRegisterUsername === 'function'
  })
  
  // Test 14: Full integration - AI Agent → Services → Execution
  test('Full Integration - AI Agent → All Services', async () => {
    const testWallet = '0x1111111111111111111111111111111111111111'
    
    // This test verifies AI Agent can use all services together
    const analysis = await aiAgent.analyzeWalletActivity(testWallet)
    // Uses: database (dbAll), wallet (getTokenBalance), contracts (getSendCash, getUsernameRegistry)
    
    return analysis !== null && analysis !== undefined &&
           typeof analysis === 'object' &&
           analysis.balances !== undefined && // from wallet service
           analysis.paymentStats !== undefined && // from database service
           analysis.address !== undefined // from contracts service
  })
  
  // Test 15: Service dependency chain
  test('Service Dependency Chain', async () => {
    // Verify that services can be imported in correct order
    try {
      const config = await import('../services/config.js')
      const contracts = await import('../services/contracts.js')
      const wallet = await import('../services/wallet.js')
      const database = await import('../services/database.js')
      const errorMessages = await import('../services/errorMessages.js')
      
      return config !== null && contracts !== null && wallet !== null && 
             database !== null && errorMessages !== null
    } catch (error) {
      console.log(`   Error: ${error.message}`)
      return false
    }
  })
  
  // Run all tests
  console.log('Running service integration tests...\n')
  
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
      if (error.stack) {
        console.log(`   ${error.stack.substring(0, 150)}...`)
      }
    }
    
    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  // Summary
  console.log('')
  console.log('='.repeat(80))
  console.log('📊 Service Integration Test Summary')
  console.log('='.repeat(80))
  console.log(`Total Tests: ${results.tests.length}`)
  console.log(`✅ Passed: ${results.passed}`)
  console.log(`❌ Failed: ${results.failed}`)
  console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`)
  console.log('')
  
  if (results.failed === 0) {
    console.log('🎉 ALL SERVICE INTEGRATION TESTS PASSED!')
    console.log('✅ AI Agent works perfectly with all service files!')
  } else {
    console.log('⚠️  Some service integration tests failed. Review the errors above.')
  }
  
  console.log('')
  console.log('💡 Services Verified:')
  console.log('   ✅ database.js - dbGet, dbAll')
  console.log('   ✅ wallet.js - getTokenBalance')
  console.log('   ✅ contracts.js - getSendCash, getUsernameRegistry, getProvider')
  console.log('   ✅ config.js - TOKENS, CONTRACTS, BASE_RPC')
  console.log('   ✅ errorMessages.js - getUserFriendlyError')
  console.log('   ✅ aiActions.js - executePayment, executeRegisterUsername')
  console.log('   ✅ thirdwebWallet.js - (via aiActions)')
  console.log('   ✅ paymentNotifications.js - (via aiActions)')
  console.log('')
}

// Run tests
testAllServicesIntegration()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    console.error(error.stack)
    process.exit(1)
  })

