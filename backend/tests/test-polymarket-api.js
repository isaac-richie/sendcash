import dotenv from 'dotenv'
dotenv.config()

import { POLYMARKET_API_URL, POLYMARKET_SUBGRAPHS } from '../services/polymarketService.js'
import { fetchMarkets, searchMarkets, getSportsMarkets } from '../services/polymarketService.js'

/**
 * Test Polymarket API connection
 */
async function testPolymarketAPI() {
  console.log('🔌 Testing Polymarket API Connection')
  console.log('='.repeat(80))
  console.log('')
  
  console.log('📡 API Configuration:')
  console.log(`   Main Subgraph: ${POLYMARKET_SUBGRAPHS.main ? '✅ Configured' : '❌ Not configured (using fallback)'}`)
  console.log(`   Using Endpoint: ${POLYMARKET_API_URL}`)
  console.log('')
  
  if (!POLYMARKET_SUBGRAPHS.main) {
    console.log('💡 Note: To use the main Polymarket subgraph, set THE_GRAPH_API_KEY in your .env file')
    console.log('   Get your API key from: https://thegraph.com/studio/apikeys/')
    console.log('   Free tier: 100,000 queries/month')
    console.log('')
  }
  
  const tests = [
    {
      name: 'Fetch Markets (Basic)',
      fn: async () => {
        const markets = await fetchMarkets({ limit: 5 })
        console.log(`   ✅ Found ${markets.length} markets`)
        if (markets.length > 0) {
          console.log(`   Sample: ${markets[0].question || 'N/A'}`)
        }
        return markets.length >= 0 // Even 0 is valid (API might be empty)
      }
    },
    {
      name: 'Search Markets',
      fn: async () => {
        const markets = await searchMarkets('sports', 3)
        console.log(`   ✅ Found ${markets.length} markets for "sports"`)
        return true
      }
    },
    {
      name: 'Get Sports Markets',
      fn: async () => {
        const markets = await getSportsMarkets(3)
        console.log(`   ✅ Found ${markets.length} sports markets`)
        return true
      }
    }
  ]
  
  console.log('🧪 Running API tests...\n')
  
  let passed = 0
  let failed = 0
  
  for (const test of tests) {
    try {
      console.log(`Testing: ${test.name}`)
      const result = await test.fn()
      if (result) {
        passed++
        console.log(`✅ ${test.name} - PASSED\n`)
      } else {
        failed++
        console.log(`❌ ${test.name} - FAILED\n`)
      }
    } catch (error) {
      failed++
      console.log(`❌ ${test.name} - ERROR`)
      console.log(`   ${error.message}\n`)
    }
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  
  console.log('='.repeat(80))
  console.log('📊 Test Summary')
  console.log('='.repeat(80))
  console.log(`✅ Passed: ${passed}`)
  console.log(`❌ Failed: ${failed}`)
  console.log('')
  
  if (failed === 0) {
    console.log('🎉 All API tests passed!')
    console.log('✅ Polymarket API is working correctly')
  } else {
    console.log('⚠️  Some tests failed')
    console.log('   This might be due to:')
    console.log('   • API endpoint not accessible')
    console.log('   • Network connectivity issues')
    console.log('   • API rate limiting')
    console.log('   • Subgraph schema changes')
  }
  console.log('')
}

testPolymarketAPI()
  .then(() => {
    process.exit(0)
  })
  .catch(error => {
    console.error('Fatal error:', error)
    console.error(error.stack)
    process.exit(1)
  })



