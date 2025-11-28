import dotenv from 'dotenv'
dotenv.config()

import { aiAgent } from '../services/aiAgent.js'
import { dbAll } from '../services/database.js'

/**
 * Test history fetching functionality
 */

async function testHistoryFetch() {
  console.log('🧪 Testing History Fetch')
  console.log('='.repeat(80))
  
  try {
    // Initialize AI Agent
    await aiAgent.initialize()
    console.log('✅ AI Agent initialized\n')

    // Get a test user with wallet
    const users = await dbAll('SELECT telegram_id, wallet_address, username FROM telegram_users WHERE wallet_address IS NOT NULL LIMIT 1')
    
    if (users.length === 0) {
      console.log('❌ No users with wallets found')
      return
    }

    const user = users[0]
    console.log(`📋 Test User:`)
    console.log(`  Username: @${user.username}`)
    console.log(`  Wallet: ${user.wallet_address}\n`)

    // Check total transactions in DB
    const allTx = await dbAll('SELECT COUNT(*) as count FROM payments')
    console.log(`📊 Total transactions in database: ${allTx[0]?.count || 0}\n`)

    // Check transactions for this specific wallet
    const walletTx = await dbAll(
      `SELECT * FROM payments 
       WHERE LOWER(from_address) = ? OR LOWER(to_address) = ?
       ORDER BY created_at DESC 
       LIMIT 10`,
      [user.wallet_address.toLowerCase(), user.wallet_address.toLowerCase()]
    )
    console.log(`📋 Transactions for this wallet: ${walletTx.length}`)
    
    if (walletTx.length > 0) {
      console.log(`\n  Sample transactions:`)
      walletTx.slice(0, 3).forEach((tx, idx) => {
        console.log(`  ${idx + 1}. ${tx.from_address === user.wallet_address ? 'Sent' : 'Received'} $${tx.amount} (${tx.tx_hash.slice(0, 10)}...)`)
      })
    }
    console.log('')

    // Test history function
    console.log('📋 Testing executeViewHistory...')
    const historyResult = await aiAgent.executeViewHistory(user.wallet_address)
    
    console.log(`\n  Result:`)
    console.log(`    Success: ${historyResult.success}`)
    console.log(`    Has Message: ${!!historyResult.message}`)
    console.log(`    Message Preview: ${historyResult.message?.substring(0, 100)}...`)
    
    if (historyResult.data && historyResult.data.transactions) {
      console.log(`    Transactions Found: ${historyResult.data.transactions.length}`)
    }

    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 Test Summary')
    console.log('='.repeat(80))
    console.log(`✅ History function executed: ${historyResult.success ? 'YES' : 'NO'}`)
    console.log(`✅ Transactions found: ${walletTx.length}`)
    console.log(`✅ History message generated: ${!!historyResult.message ? 'YES' : 'NO'}`)
    
    if (!historyResult.success) {
      console.log(`\n❌ Error: ${historyResult.message}`)
    } else if (walletTx.length === 0) {
      console.log(`\n💡 No transactions found for this wallet (this is expected if no payments have been made)`)
    } else {
      console.log(`\n✅ History fetch is working correctly!`)
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
  }
}

// Run test
testHistoryFetch().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


