/**
 * Stress Test: Bridge and Pay Feature
 * Tests multi-chain payment routing, bridging, and payment execution
 */

import dotenv from 'dotenv'
import { executeMultiChainPayment, routePayment } from '../services/multiChainPayment.js'
import { parseChainFromMessage, validateChainSupport, getChainConfig } from '../services/chainDetector.js'
import { getBridgeQuote, getChainBalance, bridgeAndPay } from '../services/bridgeService.js'
import { CHAINS } from '../services/bridgeService.js'
import { dbGet, dbAll } from '../services/database.js'

dotenv.config()

// Mock bot for testing
const mockBot = {
  sendMessage: async (userId, message) => {
    console.log(`[Bot] User ${userId}: ${message}`)
    return { message_id: Date.now() }
  }
}

// Test user data
const TEST_USER = {
  userId: 123456789,
  username: 'testuser',
  walletAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb' // Example address - will be validated
}

// Helper to validate address format
function isValidAddress(address) {
  return /^0x[a-fA-F0-9]{40}$/.test(address)
}

/**
 * Test 1: Chain Detection
 */
async function testChainDetection() {
  console.log('\n🧪 TEST 1: Chain Detection')
  console.log('='.repeat(50))

  const testCases = [
    { message: 'send @jamiu 10 USDC on BNB chain', expected: 'BSC' },
    { message: 'pay bob 50 USDT on polygon', expected: 'POLYGON' },
    { message: 'send 100 USDC to alice on arbitrum', expected: 'ARBITRUM' },
    { message: 'transfer 25 USDC to charlie on optimism', expected: 'OPTIMISM' },
    { message: 'send @user 10 USDC on bsc', expected: 'BSC' },
    { message: 'send @user 10 USDC on arb', expected: 'ARBITRUM' },
    { message: 'send @user 10 USDC', expected: null },
  ]

  for (const testCase of testCases) {
    const detected = parseChainFromMessage(testCase.message)
    const result = detected ? detected.key : null
    const passed = result === testCase.expected
    console.log(`${passed ? '✅' : '❌'} "${testCase.message}"`)
    console.log(`   Expected: ${testCase.expected}, Got: ${result}`)
    if (!passed) {
      console.log(`   ⚠️  FAILED`)
    }
  }
}

/**
 * Test 2: Chain Validation
 */
async function testChainValidation() {
  console.log('\n🧪 TEST 2: Chain Validation')
  console.log('='.repeat(50))

  const validChains = ['BSC', 'POLYGON', 'ARBITRUM', 'OPTIMISM', 'BASE']
  const invalidChains = ['INVALID', 'UNKNOWN', 'FAKE_CHAIN', '']

  console.log('Valid chains:')
  for (const chain of validChains) {
    const isValid = validateChainSupport(chain)
    const config = getChainConfig(chain)
    console.log(`${isValid ? '✅' : '❌'} ${chain}: ${isValid ? 'Valid' : 'Invalid'}`)
    if (config) {
      console.log(`   Chain ID: ${config.chainId}, Name: ${config.name}`)
    }
  }

  console.log('\nInvalid chains:')
  for (const chain of invalidChains) {
    const isValid = validateChainSupport(chain)
    console.log(`${!isValid ? '✅' : '❌'} ${chain}: ${isValid ? 'Valid (UNEXPECTED)' : 'Invalid (EXPECTED)'}`)
  }
}

/**
 * Test 3: Bridge Quote Fetching
 */
async function testBridgeQuotes() {
  console.log('\n🧪 TEST 3: Bridge Quote Fetching')
  console.log('='.repeat(50))

  const testRoutes = [
    { from: CHAINS.BASE.chainId, to: CHAINS.BSC.chainId, token: 'USDC', amount: '10' },
    { from: CHAINS.BASE.chainId, to: CHAINS.POLYGON.chainId, token: 'USDC', amount: '50' },
    { from: CHAINS.BASE.chainId, to: CHAINS.ARBITRUM.chainId, token: 'USDT', amount: '100' },
  ]

  for (const route of testRoutes) {
    try {
      console.log(`\nTesting: ${CHAINS.BASE.name} → ${Object.values(CHAINS).find(c => c.chainId === route.to)?.name}`)
      console.log(`Amount: ${route.amount} ${route.token}`)
      
      const quote = await getBridgeQuote(
        route.from,
        route.to,
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base USDC (example)
        route.amount,
        TEST_USER.walletAddress
      )

      if (quote.success) {
        console.log(`✅ Quote received`)
        console.log(`   Estimated time: ${quote.estimatedTime}s`)
        console.log(`   Estimated amount out: ${quote.estimatedAmountOut}`)
        console.log(`   Has transaction data: ${!!quote.transaction}`)
      } else {
        console.log(`❌ Quote failed: ${quote.message}`)
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`)
    }
  }
}

/**
 * Test 4: Balance Checks
 */
async function testBalanceChecks() {
  console.log('\n🧪 TEST 4: Balance Checks')
  console.log('='.repeat(50))

  const chains = [
    { chain: CHAINS.BASE, token: 'USDC' },
    { chain: CHAINS.BSC, token: 'USDC' },
    { chain: CHAINS.POLYGON, token: 'USDC' },
  ]

  for (const { chain, token } of chains) {
    try {
      console.log(`\nChecking balance on ${chain.name}...`)
      const balance = await getChainBalance(TEST_USER.walletAddress, token, chain.chainId)
      
      if (balance.success) {
        console.log(`✅ Balance: $${balance.balanceFormatted.toFixed(2)} ${token}`)
      } else {
        console.log(`⚠️  ${balance.message}`)
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`)
    }
  }
}

/**
 * Test 5: Multi-Chain Payment Routing
 */
async function testMultiChainPaymentRouting() {
  console.log('\n🧪 TEST 5: Multi-Chain Payment Routing')
  console.log('='.repeat(50))

  const testCases = [
    {
      name: 'Same chain (Base)',
      recipient: 'testrecipient',
      amount: '10',
      token: 'USDC',
      chain: 'BASE',
      expected: 'same-chain'
    },
    {
      name: 'Cross-chain (BSC)',
      recipient: 'testrecipient',
      amount: '10',
      token: 'USDC',
      chain: 'BSC',
      expected: 'cross-chain'
    },
    {
      name: 'Invalid chain',
      recipient: 'testrecipient',
      amount: '10',
      token: 'USDC',
      chain: 'INVALID_CHAIN',
      expected: 'error'
    },
  ]

  for (const testCase of testCases) {
    console.log(`\n${testCase.name}:`)
    try {
      const result = await executeMultiChainPayment(
        TEST_USER.userId,
        testCase.recipient,
        testCase.amount,
        testCase.token,
        testCase.chain,
        mockBot
      )

      if (result.success) {
        console.log(`✅ Payment routed successfully`)
        console.log(`   Message: ${result.message.substring(0, 100)}...`)
      } else {
        console.log(`⚠️  ${result.message}`)
        if (testCase.expected === 'error') {
          console.log(`   ✅ Expected error for invalid chain`)
        }
      }
    } catch (error) {
      console.log(`❌ Error: ${error.message}`)
      if (testCase.expected === 'error') {
        console.log(`   ✅ Expected error`)
      }
    }
  }
}

/**
 * Test 6: Payment Intent Extraction with Chain
 */
async function testPaymentIntentWithChain() {
  console.log('\n🧪 TEST 6: Payment Intent with Chain Detection')
  console.log('='.repeat(50))

  // This would require importing the AI agent class
  // For now, we'll test the chain detection part
  const messages = [
    'send @jamiu 10 USDC on BNB chain',
    'pay bob 50 USDT on polygon',
    'send 100 USDC to alice on arbitrum',
    'send @user 10 USDC', // No chain
  ]

  for (const message of messages) {
    const detected = parseChainFromMessage(message)
    console.log(`\n"${message}"`)
    if (detected) {
      console.log(`✅ Chain detected: ${detected.key} (${detected.name})`)
    } else {
      console.log(`ℹ️  No chain detected (expected for same-chain payments)`)
    }
  }
}

/**
 * Test 7: Edge Cases
 */
async function testEdgeCases() {
  console.log('\n🧪 TEST 7: Edge Cases')
  console.log('='.repeat(50))

  const edgeCases = [
    {
      name: 'Empty message',
      message: '',
      expected: null
    },
    {
      name: 'Chain name in different case',
      message: 'send @user 10 USDC on BNB CHAIN',
      expected: 'BSC'
    },
    {
      name: 'Chain name with spaces',
      message: 'send @user 10 USDC on bnb chain',
      expected: 'BSC'
    },
    {
      name: 'Multiple chain mentions',
      message: 'send @user 10 USDC on polygon and arbitrum',
      expected: 'POLYGON' // Should pick first
    },
  ]

  for (const testCase of edgeCases) {
    const detected = parseChainFromMessage(testCase.message)
    const result = detected ? detected.key : null
    const passed = result === testCase.expected || (testCase.expected === null && result === null)
    console.log(`${passed ? '✅' : '⚠️'} ${testCase.name}`)
    console.log(`   Result: ${result || 'null'}`)
  }
}

/**
 * Test 8: Database Integration
 */
async function testDatabaseIntegration() {
  console.log('\n🧪 TEST 8: Database Integration')
  console.log('='.repeat(50))

  try {
    // Check if payments table has target_chain columns
    const tables = await dbAll("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'")
    if (tables.length > 0) {
      console.log('✅ Payments table exists')
      
      // Try to get table schema
      const schema = await dbAll("PRAGMA table_info(payments)")
      const hasTargetChain = schema.some(col => col.name === 'target_chain')
      const hasTargetChainId = schema.some(col => col.name === 'target_chain_id')
      
      console.log(`   Has target_chain column: ${hasTargetChain ? '✅' : '❌'}`)
      console.log(`   Has target_chain_id column: ${hasTargetChainId ? '✅' : '❌'}`)
    } else {
      console.log('⚠️  Payments table not found')
    }

    // Check bridge_transactions table
    const bridgeTable = await dbAll("SELECT name FROM sqlite_master WHERE type='table' AND name='bridge_transactions'")
    if (bridgeTable.length > 0) {
      console.log('✅ Bridge transactions table exists')
    } else {
      console.log('⚠️  Bridge transactions table not found')
    }
  } catch (error) {
    console.log(`❌ Database error: ${error.message}`)
  }
}

/**
 * Test 9: Error Handling
 */
async function testErrorHandling() {
  console.log('\n🧪 TEST 9: Error Handling')
  console.log('='.repeat(50))

  const errorCases = [
    {
      name: 'Invalid user ID',
      userId: null,
      recipient: 'test',
      amount: '10',
      token: 'USDC',
      chain: 'BSC'
    },
    {
      name: 'Invalid recipient',
      userId: TEST_USER.userId,
      recipient: '',
      amount: '10',
      token: 'USDC',
      chain: 'BSC'
    },
    {
      name: 'Invalid amount',
      userId: TEST_USER.userId,
      recipient: 'test',
      amount: '-10',
      token: 'USDC',
      chain: 'BSC'
    },
    {
      name: 'Unsupported chain',
      userId: TEST_USER.userId,
      recipient: 'test',
      amount: '10',
      token: 'USDC',
      chain: 'INVALID_CHAIN'
    },
  ]

  for (const testCase of errorCases) {
    try {
      const result = await executeMultiChainPayment(
        testCase.userId,
        testCase.recipient,
        testCase.amount,
        testCase.token,
        testCase.chain,
        mockBot
      )

      if (!result.success) {
        console.log(`✅ ${testCase.name}: Error handled correctly`)
        console.log(`   Message: ${result.message.substring(0, 80)}...`)
      } else {
        console.log(`⚠️  ${testCase.name}: Should have failed but succeeded`)
      }
    } catch (error) {
      console.log(`✅ ${testCase.name}: Exception caught`)
      console.log(`   Error: ${error.message}`)
    }
  }
}

/**
 * Test 10: Performance Test
 */
async function testPerformance() {
  console.log('\n🧪 TEST 10: Performance Test')
  console.log('='.repeat(50))

  const iterations = 10
  const times = []

  console.log(`Running ${iterations} chain detection operations...`)
  
  for (let i = 0; i < iterations; i++) {
    const start = Date.now()
    parseChainFromMessage('send @user 10 USDC on BNB chain')
    const end = Date.now()
    times.push(end - start)
  }

  const avgTime = times.reduce((a, b) => a + b, 0) / times.length
  const minTime = Math.min(...times)
  const maxTime = Math.max(...times)

  console.log(`✅ Average time: ${avgTime.toFixed(2)}ms`)
  console.log(`   Min: ${minTime}ms, Max: ${maxTime}ms`)
  
  if (avgTime > 100) {
    console.log(`⚠️  Performance warning: Average time > 100ms`)
  }
}

/**
 * Run all tests
 */
async function runAllTests() {
  console.log('\n🚀 Starting Bridge and Pay Stress Tests')
  console.log('='.repeat(50))
  console.log(`Test User: ${TEST_USER.username} (${TEST_USER.userId})`)
  console.log(`Wallet: ${TEST_USER.walletAddress}`)
  console.log(`Valid Address: ${isValidAddress(TEST_USER.walletAddress) ? '✅' : '❌'}`)
  console.log(`Socket API Key: ${process.env.SOCKET_API_KEY ? '✅ Set' : '❌ Not Set (API may be rate-limited)'}`)
  console.log('='.repeat(50))

  try {
    await testChainDetection()
    await testChainValidation()
    await testBridgeQuotes()
    await testBalanceChecks()
    await testMultiChainPaymentRouting()
    await testPaymentIntentWithChain()
    await testEdgeCases()
    await testDatabaseIntegration()
    await testErrorHandling()
    await testPerformance()

    console.log('\n✅ All tests completed!')
    console.log('='.repeat(50))
  } catch (error) {
    console.error('\n❌ Test suite failed:', error)
    console.error(error.stack)
  }
}

// Run tests if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().then(() => {
    process.exit(0)
  }).catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

export { runAllTests, testChainDetection, testChainValidation, testBridgeQuotes }
