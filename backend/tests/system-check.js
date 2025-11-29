import { initDatabase, dbGet, dbAll, dbRun } from '../services/database.js'
import { aiAgent } from '../services/aiAgent.js'
import { getPaymentScheduler } from '../services/paymentScheduler.js'
import { TOKENS, CONTRACTS, BASE_RPC } from '../services/config.js'
import { ethers } from 'ethers'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Comprehensive System Check
 * Verifies all major functions are working correctly
 */

const results = {
  passed: [],
  failed: [],
  warnings: []
}

function logResult(test, status, message = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️'
  console.log(`${icon} ${test}: ${message || (status === 'pass' ? 'OK' : 'FAILED')}`)
  
  if (status === 'pass') {
    results.passed.push(test)
  } else if (status === 'fail') {
    results.failed.push(test)
  } else {
    results.warnings.push(test)
  }
}

async function runSystemCheck() {
  console.log('🔍 Running Comprehensive System Check...\n')
  console.log('='.repeat(60))
  console.log('')

  // 1. Environment Variables
  console.log('📋 1. Environment Variables')
  console.log('-'.repeat(60))
  
  const requiredEnvVars = ['TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY']
  const optionalEnvVars = ['OPENAI_MODEL']
  
  for (const envVar of requiredEnvVars) {
    if (process.env[envVar]) {
      logResult(`Env: ${envVar}`, 'pass', 'Set')
    } else {
      logResult(`Env: ${envVar}`, 'fail', 'Missing')
    }
  }
  
  for (const envVar of optionalEnvVars) {
    if (process.env[envVar]) {
      logResult(`Env: ${envVar}`, 'pass', `Set to ${process.env[envVar]}`)
    } else {
      logResult(`Env: ${envVar}`, 'warn', 'Using default')
    }
  }
  console.log('')

  // 2. Database
  console.log('📋 2. Database')
  console.log('-'.repeat(60))
  
  try {
    initDatabase()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Test database connection
    const testQuery = await dbGet('SELECT 1 as test')
    if (testQuery && testQuery.test === 1) {
      logResult('Database Connection', 'pass')
    } else {
      logResult('Database Connection', 'fail', 'Query returned unexpected result')
    }
    
    // Check required tables
    const tables = ['telegram_users', 'payments', 'scheduled_payments', 'usernames']
    for (const table of tables) {
      try {
        const result = await dbGet(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [table])
        if (result) {
          logResult(`Table: ${table}`, 'pass')
        } else {
          logResult(`Table: ${table}`, 'fail', 'Table not found')
        }
      } catch (e) {
        logResult(`Table: ${table}`, 'fail', e.message)
      }
    }
  } catch (error) {
    logResult('Database', 'fail', error.message)
  }
  console.log('')

  // 3. Blockchain Connection
  console.log('📋 3. Blockchain Connection')
  console.log('-'.repeat(60))
  
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    const blockNumber = await provider.getBlockNumber()
    if (blockNumber > 0) {
      logResult('RPC Connection', 'pass', `Block #${blockNumber}`)
    } else {
      logResult('RPC Connection', 'fail', 'Invalid block number')
    }
    
    // Check network
    const network = await provider.getNetwork()
    logResult('Network', 'pass', `${network.name} (Chain ID: ${network.chainId})`)
  } catch (error) {
    logResult('Blockchain Connection', 'fail', error.message)
  }
  console.log('')

  // 4. Contracts Configuration
  console.log('📋 4. Contracts Configuration')
  console.log('-'.repeat(60))
  
  if (CONTRACTS.SEND_CASH && ethers.isAddress(CONTRACTS.SEND_CASH)) {
    logResult('SendCash Contract', 'pass', CONTRACTS.SEND_CASH)
  } else {
    logResult('SendCash Contract', 'fail', 'Invalid address')
  }
  
  if (CONTRACTS.USERNAME_REGISTRY && ethers.isAddress(CONTRACTS.USERNAME_REGISTRY)) {
    logResult('UsernameRegistry Contract', 'pass', CONTRACTS.USERNAME_REGISTRY)
  } else {
    logResult('UsernameRegistry Contract', 'fail', 'Invalid address')
  }
  
  // Check tokens
  const tokenSymbols = Object.keys(TOKENS)
  if (tokenSymbols.length > 0) {
    logResult('Tokens Configured', 'pass', `${tokenSymbols.length} tokens: ${tokenSymbols.join(', ')}`)
    for (const symbol of tokenSymbols) {
      if (TOKENS[symbol].address && ethers.isAddress(TOKENS[symbol].address)) {
        logResult(`Token: ${symbol}`, 'pass', TOKENS[symbol].address)
      } else {
        logResult(`Token: ${symbol}`, 'fail', 'Invalid address')
      }
    }
  } else {
    logResult('Tokens Configured', 'fail', 'No tokens configured')
  }
  console.log('')

  // 5. AI Agent
  console.log('📋 5. AI Agent')
  console.log('-'.repeat(60))
  
  try {
    await aiAgent.initialize()
    logResult('AI Agent Initialization', 'pass')
    
    if (aiAgent.openai) {
      logResult('OpenAI Client', 'pass')
    } else {
      logResult('OpenAI Client', 'warn', 'Not initialized (API key missing?)')
    }
    
    // Test intent classification
    try {
      const intentResult = await aiAgent.classifyIntent('what is my balance?', 12345)
      if (intentResult && intentResult.intent) {
        logResult('Intent Classification', 'pass', `Detected: ${intentResult.intent}`)
      } else {
        logResult('Intent Classification', 'fail', 'No intent returned')
      }
    } catch (e) {
      logResult('Intent Classification', 'fail', e.message)
    }
    
    // Test payment intent extraction
    try {
      const paymentIntent = await aiAgent.extractPaymentIntent('send $10 to @alice', 12345)
      if (paymentIntent !== null && typeof paymentIntent === 'object') {
        logResult('Payment Intent Extraction', 'pass')
      } else {
        logResult('Payment Intent Extraction', 'warn', 'Returned null (may be expected)')
      }
    } catch (e) {
      logResult('Payment Intent Extraction', 'fail', e.message)
    }
  } catch (error) {
    logResult('AI Agent', 'fail', error.message)
  }
  console.log('')

  // 6. AI Agent Actions
  console.log('📋 6. AI Agent Actions')
  console.log('-'.repeat(60))
  
  try {
    // Test balance check (with invalid address - should handle gracefully)
    const balanceResult = await aiAgent.executeCheckBalance('0x0000000000000000000000000000000000000000')
    if (balanceResult && typeof balanceResult === 'object' && 'success' in balanceResult) {
      logResult('Check Balance Action', 'pass')
    } else {
      logResult('Check Balance Action', 'fail', 'Unexpected return format')
    }
    
    // Test history view (with invalid address - should handle gracefully)
    const historyResult = await aiAgent.executeViewHistory('0x0000000000000000000000000000000000000000')
    if (historyResult && typeof historyResult === 'object' && 'success' in historyResult) {
      logResult('View History Action', 'pass')
    } else {
      logResult('View History Action', 'fail', 'Unexpected return format')
    }
    
    // Test help
    const helpResult = await aiAgent.executeHelp()
    if (helpResult && helpResult.success && helpResult.message) {
      logResult('Help Action', 'pass')
    } else {
      logResult('Help Action', 'fail', 'Unexpected return format')
    }
  } catch (error) {
    logResult('AI Agent Actions', 'fail', error.message)
  }
  console.log('')

  // 7. Payment Scheduler
  console.log('📋 7. Payment Scheduler')
  console.log('-'.repeat(60))
  
  try {
    // Create mock bot for scheduler
    const mockBot = {
      sendMessage: async () => ({ message_id: 1 })
    }
    
    const scheduler = getPaymentScheduler(mockBot)
    if (scheduler) {
      logResult('Scheduler Instance', 'pass')
      
      // Check if scheduler methods exist
      if (typeof scheduler.getScheduledPayments === 'function') {
        logResult('Scheduler: getScheduledPayments', 'pass')
      } else {
        logResult('Scheduler: getScheduledPayments', 'fail', 'Method not found')
      }
      
      if (typeof scheduler.cancelScheduledPayment === 'function') {
        logResult('Scheduler: cancelScheduledPayment', 'pass')
      } else {
        logResult('Scheduler: cancelScheduledPayment', 'fail', 'Method not found')
      }
      
      if (typeof scheduler.checkAndProcessScheduledPayments === 'function') {
        logResult('Scheduler: checkAndProcessScheduledPayments', 'pass')
      } else {
        logResult('Scheduler: checkAndProcessScheduledPayments', 'fail', 'Method not found')
      }
    } else {
      logResult('Scheduler Instance', 'fail', 'Could not create instance')
    }
  } catch (error) {
    logResult('Payment Scheduler', 'fail', error.message)
  }
  console.log('')

  // 8. Database Queries
  console.log('📋 8. Database Queries')
  console.log('-'.repeat(60))
  
  try {
    // Test user query
    const users = await dbAll('SELECT COUNT(*) as count FROM telegram_users')
    logResult('Query: telegram_users', 'pass', `${users[0]?.count || 0} users`)
    
    // Test payments query
    const payments = await dbAll('SELECT COUNT(*) as count FROM payments')
    logResult('Query: payments', 'pass', `${payments[0]?.count || 0} payments`)
    
    // Test scheduled payments query
    const scheduled = await dbAll('SELECT COUNT(*) as count FROM scheduled_payments')
    logResult('Query: scheduled_payments', 'pass', `${scheduled[0]?.count || 0} scheduled`)
    
    // Test usernames query
    const usernames = await dbAll('SELECT COUNT(*) as count FROM usernames')
    logResult('Query: usernames', 'pass', `${usernames[0]?.count || 0} usernames`)
  } catch (error) {
    logResult('Database Queries', 'fail', error.message)
  }
  console.log('')

  // 9. Process Natural Language
  console.log('📋 9. Process Natural Language')
  console.log('-'.repeat(60))
  
  try {
    const testMessages = [
      { text: 'what is my balance?', expected: 'balance' },
      { text: 'show my history', expected: 'history' },
      { text: 'help', expected: 'help' }
    ]
    
    for (const test of testMessages) {
      try {
        const result = await aiAgent.processNaturalLanguage(
          test.text,
          12345,
          { walletAddress: '0x0000000000000000000000000000000000000000' },
          null
        )
        
        if (result && (typeof result === 'string' || (typeof result === 'object' && result.message))) {
          logResult(`Process: "${test.text}"`, 'pass')
        } else {
          logResult(`Process: "${test.text}"`, 'fail', 'Unexpected return format')
        }
      } catch (e) {
        logResult(`Process: "${test.text}"`, 'fail', e.message)
      }
    }
  } catch (error) {
    logResult('Process Natural Language', 'fail', error.message)
  }
  console.log('')

  // Summary
  console.log('')
  console.log('='.repeat(60))
  console.log('📊 SYSTEM CHECK SUMMARY')
  console.log('='.repeat(60))
  console.log(`✅ Passed: ${results.passed.length}`)
  console.log(`❌ Failed: ${results.failed.length}`)
  console.log(`⚠️  Warnings: ${results.warnings.length}`)
  console.log('')
  
  if (results.failed.length > 0) {
    console.log('❌ Failed Tests:')
    results.failed.forEach(test => console.log(`   - ${test}`))
    console.log('')
  }
  
  if (results.warnings.length > 0) {
    console.log('⚠️  Warnings:')
    results.warnings.forEach(test => console.log(`   - ${test}`))
    console.log('')
  }
  
  const successRate = ((results.passed.length / (results.passed.length + results.failed.length)) * 100).toFixed(1)
  console.log(`📈 Success Rate: ${successRate}%`)
  console.log('')
  
  if (results.failed.length === 0) {
    console.log('🎉 All critical tests passed! System is operational.')
    process.exit(0)
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.')
    process.exit(1)
  }
}

// Run the check
runSystemCheck().catch(error => {
  console.error('❌ System check failed:', error)
  process.exit(1)
})



