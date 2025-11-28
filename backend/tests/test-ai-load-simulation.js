import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { executePayment, executeRegisterUsername } from '../services/aiActions.js'
import { dbGet, dbAll } from '../services/database.js'
import { getTokenBalance } from '../services/wallet.js'

/**
 * Load Simulation Test for AI Agent
 * Tests concurrent requests and wallet function performance
 */

// Test configuration
const CONFIG = {
  concurrentUsers: 10,
  requestsPerUser: 5,
  delayBetweenRequests: 100, // ms
  testDuration: 30000, // 30 seconds
  verbose: true
}

// Statistics tracking
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  averageResponseTime: 0,
  minResponseTime: Infinity,
  maxResponseTime: 0,
  errors: [],
  intentDistribution: {},
  actionDistribution: {}
}

// Test scenarios
const testScenarios = [
  {
    name: 'check_balance',
    messages: [
      "What's my balance?",
      "Show me my balances",
      "How much do I have?",
      "Check balance",
      "What's in my wallet?"
    ]
  },
  {
    name: 'send_payment',
    messages: [
      "Send $10 to alice",
      "Pay bob 50 USDC",
      "Transfer $25 to charlie",
      "Send 100 USDC to dave",
      "Pay eve $15"
    ]
  },
  {
    name: 'view_history',
    messages: [
      "Show my transactions",
      "What payments did I make?",
      "Show my history",
      "Recent transactions",
      "Transaction list"
    ]
  },
  {
    name: 'get_insights',
    messages: [
      "How much did I spend?",
      "Show me my spending",
      "What are my spending patterns?",
      "Spending analysis",
      "Wallet insights"
    ]
  },
  {
    name: 'help',
    messages: [
      "Help",
      "What can you do?",
      "Show commands",
      "How does this work?",
      "Help me"
    ]
  }
]

/**
 * Simulate a single user making requests
 */
async function simulateUser(userId, walletAddress, username, userIndex) {
  const userStats = {
    userId,
    requests: 0,
    successful: 0,
    failed: 0,
    responseTimes: []
  }

  console.log(`👤 User ${userIndex + 1} (${username || userId}) starting...`)

  for (let i = 0; i < CONFIG.requestsPerUser; i++) {
    // Pick random scenario
    const scenario = testScenarios[Math.floor(Math.random() * testScenarios.length)]
    const message = scenario.messages[Math.floor(Math.random() * scenario.messages.length)]

    const startTime = Date.now()

    try {
      // Test intent classification
      const intentResult = await aiAgent.classifyIntent(message)
      
      // Test action execution
      const actionResult = await aiAgent.executeAction(
        intentResult.intent,
        message,
        userId,
        { walletAddress, username }
      )

      const responseTime = Date.now() - startTime
      userStats.responseTimes.push(responseTime)
      userStats.requests++
      stats.totalRequests++

      if (actionResult.success) {
        userStats.successful++
        stats.successfulRequests++
      } else {
        userStats.failed++
        stats.failedRequests++
        stats.errors.push({
          userId,
          message,
          error: actionResult.message
        })
      }

      // Track distributions
      stats.intentDistribution[intentResult.intent] = (stats.intentDistribution[intentResult.intent] || 0) + 1
      stats.actionDistribution[scenario.name] = (stats.actionDistribution[scenario.name] || 0) + 1

      // Update response time stats
      stats.averageResponseTime = (stats.averageResponseTime * (stats.totalRequests - 1) + responseTime) / stats.totalRequests
      stats.minResponseTime = Math.min(stats.minResponseTime, responseTime)
      stats.maxResponseTime = Math.max(stats.maxResponseTime, responseTime)

      if (CONFIG.verbose) {
        console.log(`  ✅ Request ${i + 1}/${CONFIG.requestsPerUser}: "${message}" → ${intentResult.intent} (${responseTime}ms)`)
      }

      // Delay between requests
      if (i < CONFIG.requestsPerUser - 1) {
        await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenRequests))
      }
    } catch (error) {
      const responseTime = Date.now() - startTime
      userStats.responseTimes.push(responseTime)
      userStats.requests++
      userStats.failed++
      stats.totalRequests++
      stats.failedRequests++
      stats.errors.push({
        userId,
        message,
        error: error.message,
        stack: error.stack
      })

      console.error(`  ❌ Request ${i + 1}/${CONFIG.requestsPerUser} failed:`, error.message)
    }
  }

  const avgResponseTime = userStats.responseTimes.reduce((a, b) => a + b, 0) / userStats.responseTimes.length
  console.log(`  📊 User ${userIndex + 1} completed: ${userStats.successful}/${userStats.requests} successful (avg: ${avgResponseTime.toFixed(0)}ms)`)

  return userStats
}

/**
 * Test wallet function performance directly
 */
async function testWalletFunctions(walletAddress) {
  console.log('\n🔧 Testing Wallet Functions Directly...')
  console.log('-'.repeat(80))

  const walletTests = []

  // Test 1: Get Balance (multiple tokens)
  const balanceTest = async () => {
    const start = Date.now()
    try {
      const balances = await aiAgent.getWalletBalances(walletAddress)
      const time = Date.now() - start
      return { name: 'getWalletBalances', success: true, time, data: Object.keys(balances).length }
    } catch (error) {
      return { name: 'getWalletBalances', success: false, time: Date.now() - start, error: error.message }
    }
  }

  // Test 2: Analyze Wallet Activity
  const analysisTest = async () => {
    const start = Date.now()
    try {
      const analysis = await aiAgent.analyzeWalletActivity(walletAddress)
      const time = Date.now() - start
      return { name: 'analyzeWalletActivity', success: true, time, data: analysis.paymentStats.transactionCount }
    } catch (error) {
      return { name: 'analyzeWalletActivity', success: false, time: Date.now() - start, error: error.message }
    }
  }

  // Test 3: Get Transaction History
  const historyTest = async () => {
    const start = Date.now()
    try {
      const transactions = await dbAll(
        `SELECT * FROM payments 
         WHERE from_address = ? OR to_address = ?
         ORDER BY created_at DESC 
         LIMIT 10`,
        [walletAddress.toLowerCase(), walletAddress.toLowerCase()]
      )
      const time = Date.now() - start
      return { name: 'getTransactionHistory', success: true, time, data: transactions.length }
    } catch (error) {
      return { name: 'getTransactionHistory', success: false, time: Date.now() - start, error: error.message }
    }
  }

  // Test 4: Check Token Balance (direct)
  const tokenBalanceTest = async () => {
    const start = Date.now()
    try {
      const { TOKENS } = await import('../services/config.js')
      const balance = await getTokenBalance(walletAddress, TOKENS.USDC.address)
      const time = Date.now() - start
      return { name: 'getTokenBalance', success: true, time, data: balance ? 'found' : 'null' }
    } catch (error) {
      return { name: 'getTokenBalance', success: false, time: Date.now() - start, error: error.message }
    }
  }

  // Run all tests
  walletTests.push(await balanceTest())
  walletTests.push(await analysisTest())
  walletTests.push(await historyTest())
  walletTests.push(await tokenBalanceTest())

  // Run concurrent tests
  console.log('\n🔄 Running Concurrent Wallet Function Tests...')
  const concurrentTests = await Promise.all([
    balanceTest(),
    balanceTest(),
    balanceTest(),
    analysisTest(),
    historyTest()
  ])

  walletTests.push(...concurrentTests)

  // Display results
  walletTests.forEach(test => {
    const status = test.success ? '✅' : '❌'
    console.log(`  ${status} ${test.name}: ${test.time}ms ${test.data ? `(${test.data})` : ''} ${test.error ? `- ${test.error}` : ''}`)
  })

  return walletTests
}

/**
 * Test payment intent extraction performance
 */
async function testPaymentExtraction() {
  console.log('\n💸 Testing Payment Intent Extraction...')
  console.log('-'.repeat(80))

  const paymentMessages = [
    "Send $10 to alice",
    "Pay bob 50 USDC for lunch",
    "Transfer $25 to charlie",
    "Send 100 USDC to dave",
    "Pay eve $15 for coffee",
    "Send $200 to frank",
    "Transfer 75 USDC to grace",
    "Pay henry $30"
  ]

  const results = []
  const startTime = Date.now()

  for (const message of paymentMessages) {
    const start = Date.now()
    try {
      const intent = await aiAgent.extractPaymentIntent(message)
      const time = Date.now() - start
      results.push({
        message,
        success: intent && intent.hasPaymentIntent,
        time,
        data: intent
      })
      if (CONFIG.verbose) {
        console.log(`  ✅ "${message}" → ${time}ms`)
      }
    } catch (error) {
      results.push({
        message,
        success: false,
        time: Date.now() - start,
        error: error.message
      })
    }
  }

  const totalTime = Date.now() - startTime
  const avgTime = totalTime / paymentMessages.length
  const successCount = results.filter(r => r.success).length

  console.log(`  📊 Results: ${successCount}/${paymentMessages.length} successful, avg: ${avgTime.toFixed(0)}ms`)

  return results
}

/**
 * Main simulation
 */
async function runSimulation() {
  console.log('🚀 AI Agent Load Simulation Test')
  console.log('='.repeat(80))
  console.log(`Configuration:`)
  console.log(`  Concurrent Users: ${CONFIG.concurrentUsers}`)
  console.log(`  Requests per User: ${CONFIG.requestsPerUser}`)
  console.log(`  Total Requests: ${CONFIG.concurrentUsers * CONFIG.requestsPerUser}`)
  console.log(`  Delay Between Requests: ${CONFIG.delayBetweenRequests}ms`)
  console.log('='.repeat(80))

  try {
    // Initialize AI Agent
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized\n')

    // Get test users
    const users = await dbAll('SELECT telegram_id, wallet_address, username FROM telegram_users LIMIT ?', [CONFIG.concurrentUsers])
    
    if (users.length === 0) {
      console.log('❌ No users found. Please register users first.')
      return
    }

    if (users.length < CONFIG.concurrentUsers) {
      console.log(`⚠️  Only ${users.length} users found, using ${users.length} concurrent users instead of ${CONFIG.concurrentUsers}`)
    }

    const testUsers = users.slice(0, CONFIG.concurrentUsers)
    console.log(`📋 Using ${testUsers.length} test users\n`)

    // Test wallet functions first
    if (testUsers[0]?.wallet_address) {
      await testWalletFunctions(testUsers[0].wallet_address)
    }

    // Test payment extraction
    await testPaymentExtraction()

    // Run concurrent user simulation
    console.log('\n👥 Starting Concurrent User Simulation...')
    console.log('-'.repeat(80))

    const startTime = Date.now()
    const userPromises = testUsers.map((user, index) =>
      simulateUser(
        user.telegram_id,
        user.wallet_address,
        user.username,
        index
      )
    )

    const userResults = await Promise.all(userPromises)
    const totalTime = Date.now() - startTime

    // Calculate final statistics
    console.log('\n' + '='.repeat(80))
    console.log('📊 SIMULATION RESULTS')
    console.log('='.repeat(80))

    console.log(`\n⏱️  Performance:`)
    console.log(`  Total Time: ${(totalTime / 1000).toFixed(2)}s`)
    console.log(`  Total Requests: ${stats.totalRequests}`)
    console.log(`  Successful: ${stats.successfulRequests} (${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%)`)
    console.log(`  Failed: ${stats.failedRequests} (${((stats.failedRequests / stats.totalRequests) * 100).toFixed(1)}%)`)
    console.log(`  Average Response Time: ${stats.averageResponseTime.toFixed(0)}ms`)
    console.log(`  Min Response Time: ${stats.minResponseTime}ms`)
    console.log(`  Max Response Time: ${stats.maxResponseTime}ms`)
    console.log(`  Requests per Second: ${(stats.totalRequests / (totalTime / 1000)).toFixed(1)}`)

    console.log(`\n📈 Intent Distribution:`)
    Object.entries(stats.intentDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([intent, count]) => {
        console.log(`  ${intent}: ${count} (${((count / stats.totalRequests) * 100).toFixed(1)}%)`)
      })

    console.log(`\n🎯 Action Distribution:`)
    Object.entries(stats.actionDistribution)
      .sort((a, b) => b[1] - a[1])
      .forEach(([action, count]) => {
        console.log(`  ${action}: ${count} (${((count / stats.totalRequests) * 100).toFixed(1)}%)`)
      })

    if (stats.errors.length > 0) {
      console.log(`\n❌ Errors (${stats.errors.length}):`)
      const errorTypes = {}
      stats.errors.forEach(err => {
        const key = err.error || 'Unknown'
        errorTypes[key] = (errorTypes[key] || 0) + 1
      })
      Object.entries(errorTypes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .forEach(([error, count]) => {
          console.log(`  ${error}: ${count}`)
        })
    }

    // Performance assessment
    console.log('\n' + '='.repeat(80))
    console.log('🎯 PERFORMANCE ASSESSMENT')
    console.log('='.repeat(80))

    const successRate = (stats.successfulRequests / stats.totalRequests) * 100
    const avgResponseTime = stats.averageResponseTime

    if (successRate >= 95 && avgResponseTime < 2000) {
      console.log('✅ EXCELLENT: System handles load smoothly!')
    } else if (successRate >= 90 && avgResponseTime < 3000) {
      console.log('✅ GOOD: System performs well under load')
    } else if (successRate >= 80 && avgResponseTime < 5000) {
      console.log('⚠️  ACCEPTABLE: Some optimization needed')
    } else {
      console.log('❌ NEEDS IMPROVEMENT: System struggles under load')
    }

    console.log(`\n💡 Recommendations:`)
    if (avgResponseTime > 3000) {
      console.log(`  - Average response time (${avgResponseTime.toFixed(0)}ms) is high, consider caching`)
    }
    if (successRate < 95) {
      console.log(`  - Success rate (${successRate.toFixed(1)}%) could be improved`)
    }
    if (stats.errors.length > stats.totalRequests * 0.1) {
      console.log(`  - Error rate is high, review error handling`)
    }

    console.log('\n✅ Simulation completed!')

  } catch (error) {
    console.error('\n❌ Simulation failed:', error)
    console.error(error.stack)
  }
}

// Run simulation
runSimulation().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


