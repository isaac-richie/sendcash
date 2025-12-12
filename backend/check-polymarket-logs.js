/**
 * Quick script to check recent Polymarket-related activity
 * Checks database for recent bet records and logs
 */

import { dbAll } from './services/databaseSupabase.js'

async function checkPolymarketActivity() {
  console.log('🔍 Checking Polymarket Activity...\n')
  
  try {
    // Check recent bets
    const recentBets = await dbAll(
      `SELECT * FROM polymarket_bets 
       ORDER BY created_at DESC 
       LIMIT 5`
    )
    
    console.log(`📊 Recent Bets: ${recentBets.length}`)
    if (recentBets.length > 0) {
      recentBets.forEach((bet, i) => {
        console.log(`\n${i + 1}. Market: ${bet.market_question}`)
        console.log(`   Side: ${bet.side}, Amount: $${bet.amount}`)
        console.log(`   Status: ${bet.status}, Created: ${new Date(bet.created_at * 1000).toLocaleString()}`)
      })
    } else {
      console.log('   No bets found')
    }
    
    // Check database type
    const { getDatabaseType } = await import('./services/databaseSupabase.js')
    console.log(`\n🗄️  Database Type: ${getDatabaseType()}`)
    
  } catch (error) {
    console.error('Error checking activity:', error.message)
  }
}

checkPolymarketActivity()



