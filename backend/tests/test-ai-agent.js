import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { dbGet, dbAll } from '../services/database.js'

/**
 * Test AI Agent's on-chain activity understanding
 */
async function testAIAgent() {
  console.log('🤖 Testing AI Agent - On-Chain Activity Understanding\n')
  console.log('='.repeat(80))
  
  try {
    // Test 1: Initialize AI Agent
    console.log('\n📋 Test 1: Initializing AI Agent')
    console.log('-'.repeat(80))
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized successfully')
    
    // Test 2: Get a test wallet address from database
    console.log('\n📋 Test 2: Getting Test Wallet')
    console.log('-'.repeat(80))
    const users = await dbAll('SELECT wallet_address, username, telegram_id FROM telegram_users LIMIT 1')
    
    if (users.length === 0) {
      console.log('⚠️  No users found in database. Register a user first with /register @username')
      return
    }
    
    const testWallet = users[0].wallet_address
    console.log(`Test Wallet: ${testWallet}`)
    console.log(`Username: @${users[0].username || 'N/A'}`)
    console.log(`Telegram ID: ${users[0].telegram_id}`)
    
    // Test 3: Analyze Wallet Activity
    console.log('\n📋 Test 3: Analyzing Wallet Activity')
    console.log('-'.repeat(80))
    console.log('Analyzing on-chain activities...')
    
    const analysis = await aiAgent.analyzeWalletActivity(testWallet)
    
    console.log('\n📊 Analysis Results:')
    console.log(`  Total Transactions: ${analysis.paymentStats.transactionCount}`)
    console.log(`  Total Sent: $${analysis.paymentStats.totalSent.toFixed(2)}`)
    console.log(`  Total Received: $${analysis.paymentStats.totalReceived.toFixed(2)}`)
    
    console.log('\n💰 Current Balances:')
    for (const [token, balance] of Object.entries(analysis.balances)) {
      console.log(`  ${token}: $${balance.amount}`)
    }
    
    console.log('\n👥 Top Recipients:')
    if (analysis.paymentStats.topRecipients.length > 0) {
      analysis.paymentStats.topRecipients.forEach((recipient, idx) => {
        console.log(`  ${idx + 1}. ${recipient.username}: $${recipient.amount}`)
      })
    } else {
      console.log('  No recipients yet')
    }
    
    console.log('\n👥 Top Senders:')
    if (analysis.paymentStats.topSenders.length > 0) {
      analysis.paymentStats.topSenders.forEach((sender, idx) => {
        console.log(`  ${idx + 1}. ${sender.username}: $${sender.amount}`)
      })
    } else {
      console.log('  No senders yet')
    }
    
    console.log('\n📈 Activity Patterns:')
    console.log(`  Transaction Frequency: ${analysis.patterns.transactionFrequency}`)
    console.log(`  Average Transaction Amount: $${analysis.patterns.averageTransactionAmount.toFixed(2)}`)
    if (analysis.patterns.mostActiveDay) {
      console.log(`  Most Active Day: ${analysis.patterns.mostActiveDay}`)
    }
    
    console.log('\n💡 AI-Generated Insights:')
    analysis.insights.forEach((insight, idx) => {
      console.log(`  ${idx + 1}. ${insight}`)
    })
    
    // Test 4: Format for LLM
    console.log('\n📋 Test 4: Formatting for LLM')
    console.log('-'.repeat(80))
    const llmFormat = aiAgent.formatForLLM(analysis)
    console.log(llmFormat)
    
    // Test 5: Activity Summary
    console.log('\n📋 Test 5: Activity Summary (Last 30 Days)')
    console.log('-'.repeat(80))
    const summary = await aiAgent.getActivitySummary(testWallet, 30)
    console.log(`  Period: ${summary.period}`)
    console.log(`  Total Transactions: ${summary.totalTransactions}`)
    console.log(`  Total Volume: $${summary.totalVolume.toFixed(2)}`)
    console.log(`  Unique Counterparties: ${summary.uniqueCounterparties}`)
    console.log(`  Tokens Used: ${Object.keys(summary.tokenUsage).length}`)
    
    // Test 6: Unusual Activity Detection
    console.log('\n📋 Test 6: Unusual Activity Detection')
    console.log('-'.repeat(80))
    const unusualActivity = await aiAgent.detectUnusualActivity(testWallet)
    console.log(`  Risk Level: ${unusualActivity.riskLevel}`)
    console.log(`  Alerts: ${unusualActivity.alerts.length}`)
    
    if (unusualActivity.alerts.length > 0) {
      unusualActivity.alerts.forEach((alert, idx) => {
        console.log(`\n  Alert ${idx + 1}:`)
        console.log(`    Type: ${alert.type}`)
        console.log(`    Severity: ${alert.severity}`)
        console.log(`    Message: ${alert.message}`)
      })
    } else {
      console.log('  ✅ No unusual activity detected')
    }
    
    // Test 7: Transaction Analysis (if we have a transaction hash)
    const txHash = process.argv[2]
    if (txHash) {
      console.log('\n📋 Test 7: Analyzing Specific Transaction')
      console.log('-'.repeat(80))
      console.log(`Transaction Hash: ${txHash}`)
      
      try {
        const txAnalysis = await aiAgent.analyzeTransaction(txHash)
        console.log(`  Status: ${txAnalysis.status}`)
        console.log(`  Block Number: ${txAnalysis.blockNumber}`)
        console.log(`  Gas Used: ${txAnalysis.gasUsed}`)
        
        if (txAnalysis.paymentData) {
          console.log('\n  Payment Data:')
          console.log(`    From: ${txAnalysis.paymentData.from}`)
          console.log(`    To: ${txAnalysis.paymentData.to}`)
          console.log(`    Amount: $${txAnalysis.paymentData.amountFormatted} ${txAnalysis.paymentData.tokenSymbol}`)
          console.log(`    Fee: $${txAnalysis.paymentData.feeFormatted}`)
        }
        
        console.log('\n  Insights:')
        txAnalysis.insights.forEach((insight, idx) => {
          console.log(`    ${idx + 1}. ${insight}`)
        })
      } catch (error) {
        console.log(`  ⚠️  Error analyzing transaction: ${error.message}`)
      }
    } else {
      console.log('\n📋 Test 7: Transaction Analysis (Skipped)')
      console.log('-'.repeat(80))
      console.log('💡 To test transaction analysis, provide a transaction hash:')
      console.log('   node tests/test-ai-agent.js <tx_hash>')
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ All tests completed!')
    console.log('\n💡 The AI Agent is ready to understand on-chain activities!')
    console.log('💡 It can be integrated with an LLM in the future for natural language processing.')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
  }
}

// Run tests
testAIAgent().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


