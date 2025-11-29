import { testSwapService, verifyTokenAddress, getSwapQuote } from '../services/swapService.js'
import dotenv from 'dotenv'

dotenv.config()

/**
 * Test Swap Service Setup
 * Verifies basic functionality before full implementation
 */

async function testSwap() {
  console.log('🧪 Testing Swap Service Setup\n')
  console.log('='.repeat(60))
  console.log('')

  // Test 1: Service setup test
  console.log('📋 Test 1: Service Setup')
  console.log('-'.repeat(60))
  try {
    const results = await testSwapService()
    
    console.log('✅ Service test completed:')
    console.log('')
    console.log('Tokens:')
    for (const [token, info] of Object.entries(results.tokens)) {
      console.log(`  ${token}: ${info.exists ? '✅' : '❌'} ${info.address}`)
    }
    console.log('')
    console.log('Contracts:')
    for (const [contract, info] of Object.entries(results.contracts)) {
      console.log(`  ${contract}: ${info.exists ? '✅' : '❌'} ${info.address}`)
    }
    
    if (results.errors.length > 0) {
      console.log('')
      console.log('⚠️  Errors:')
      results.errors.forEach(err => console.log(`  - ${err}`))
    }
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
  }
  console.log('')

  // Test 2: Token verification
  console.log('📋 Test 2: Token Verification')
  console.log('-'.repeat(60))
  const tokens = ['USDC', 'USDT', 'WBTC']
  for (const token of tokens) {
    try {
      const exists = await verifyTokenAddress(token)
      console.log(`${exists ? '✅' : '❌'} ${token}: ${exists ? 'Found' : 'Not found'}`)
    } catch (error) {
      console.log(`❌ ${token}: ${error.message}`)
    }
  }
  console.log('')

  // Test 3: Basic quote (will show pending message)
  console.log('📋 Test 3: Basic Quote Test')
  console.log('-'.repeat(60))
  try {
    const testWallet = '0x1234567890123456789012345678901234567890'
    const quote = await getSwapQuote('USDC', 'USDT', '100', testWallet)
    console.log('✅ Quote structure created:')
    console.log(`   From: ${quote.fromAmount} ${quote.fromToken}`)
    console.log(`   To: ${quote.toToken}`)
    console.log(`   Status: ${quote.status}`)
    console.log(`   Message: ${quote.message}`)
  } catch (error) {
    console.log(`❌ Error: ${error.message}`)
  }
  console.log('')

  console.log('='.repeat(60))
  console.log('✅ Basic swap service test completed!')
  console.log('')
  console.log('💡 Next steps:')
  console.log('   1. Verify token addresses are correct')
  console.log('   2. Verify Uniswap contracts exist')
  console.log('   3. Implement pool queries')
  console.log('   4. Add actual quote calculation')
  console.log('')
}

testSwap()
  .then(() => {
    console.log('Test completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Test failed:', error)
    process.exit(1)
  })



