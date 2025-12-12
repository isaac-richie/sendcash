/**
 * Test Bridge Intent Extraction
 * Tests standalone bridge functionality (not tied to payments)
 */

import dotenv from 'dotenv'
dotenv.config()

// Simple test without full AI agent initialization
const testBridgeIntentExtraction = () => {
  console.log('🧪 Testing Bridge Intent Extraction\n')
  console.log('='.repeat(60))

  const testCases = [
    {
      message: 'bridge 10 usdc from arbitrum to base',
      expected: { fromChain: 'ARBITRUM', toChain: 'BASE', amount: '10', token: 'USDC' }
    },
    {
      message: 'bridge 25 USDC to Polygon',
      expected: { fromChain: 'BASE', toChain: 'POLYGON', amount: '25', token: 'USDC' }
    },
    {
      message: 'move 50 USDT from Optimism to BSC',
      expected: { fromChain: 'OPTIMISM', toChain: 'BSC', amount: '50', token: 'USDT' }
    },
    {
      message: 'bridge from Ethereum to Base',
      expected: { fromChain: 'ETHEREUM', toChain: 'BASE', amount: null, token: 'USDC' }
    },
    {
      message: 'bridge 100 USDC from Polygon to Arbitrum',
      expected: { fromChain: 'POLYGON', toChain: 'ARBITRUM', amount: '100', token: 'USDC' }
    },
  ]

  // Manual extraction logic (same as in extractBridgeIntent)
  const extractBridgeIntent = (message) => {
    const lowerMessage = message.toLowerCase()
    
    // Extract amount
    const amountMatch = message.match(/\$?(\d+(?:\.\d+)?)/)
    const amount = amountMatch ? amountMatch[1] : null

    // Extract token
    let tokenSymbol = 'USDC'
    if (lowerMessage.includes('usdt')) tokenSymbol = 'USDT'
    else if (lowerMessage.includes('usdc')) tokenSymbol = 'USDC'
    else if (lowerMessage.includes('wbtc')) tokenSymbol = 'WBTC'
    else if (lowerMessage.includes('dai')) tokenSymbol = 'DAI'

    const chainKeywords = {
      'ethereum': 'ETHEREUM',
      'eth': 'ETHEREUM',
      'mainnet': 'ETHEREUM',
      'base': 'BASE',
      'base mainnet': 'BASE_MAINNET',
      'polygon': 'POLYGON',
      'matic': 'POLYGON',
      'arbitrum': 'ARBITRUM',
      'arb': 'ARBITRUM',
      'optimism': 'OPTIMISM',
      'op': 'OPTIMISM',
      'avalanche': 'AVALANCHE',
      'avax': 'AVALANCHE',
      'bsc': 'BSC',
      'binance': 'BSC',
      'bnb': 'BSC',
      'bnb chain': 'BSC',
      'zksync': 'ZKSYNC_ERA',
      'zksync era': 'ZKSYNC_ERA',
      'zk sync': 'ZKSYNC_ERA',
      'linea': 'LINEA',
      'scroll': 'SCROLL',
      'mantle': 'MANTLE',
      'blast': 'BLAST'
    }

    // Extract source chain (from)
    let fromChain = null
    const fromPatterns = [
      /(?:bridge|move|send).*?from\s+([a-z\s]+?)(?:\s+chain)?(?:\s+to|\s|$)/i,
      /from\s+([a-z\s]+?)(?:\s+chain)?(?:\s+to)/i,
    ]
    
    for (const pattern of fromPatterns) {
      const match = lowerMessage.match(pattern)
      if (match) {
        const chainName = match[1]?.trim()
        if (chainName) {
          for (const [keyword, chain] of Object.entries(chainKeywords)) {
            if (chainName.includes(keyword)) {
              fromChain = chain
              break
            }
          }
          if (fromChain) break
        }
      }
    }

    // Extract destination chain (to)
    let toChain = null
    const toPatterns = [
      /(?:bridge|move|send).*?to\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
      /to\s+([a-z\s]+?)(?:\s+chain)?(?:\s|$|\.)/i,
    ]
    
    for (const pattern of toPatterns) {
      const match = lowerMessage.match(pattern)
      if (match) {
        const chainName = match[1]?.trim()
        if (chainName) {
          for (const [keyword, chain] of Object.entries(chainKeywords)) {
            if (chainName.includes(keyword)) {
              toChain = chain
              break
            }
          }
          if (toChain) break
        }
      }
    }

    // Fallback: if no explicit "from/to" patterns, try to find chains mentioned
    if (!fromChain || !toChain) {
      const foundChains = []
      for (const [keyword, chain] of Object.entries(chainKeywords)) {
        if (lowerMessage.includes(keyword)) {
          foundChains.push(chain)
        }
      }
      
      if (foundChains.length === 2) {
        if (!fromChain) fromChain = foundChains[0]
        if (!toChain) toChain = foundChains[1]
      } else if (foundChains.length === 1) {
        if (!toChain) toChain = foundChains[0]
        if (!fromChain) fromChain = 'BASE'
      }
    }

    if (toChain) {
      return {
        hasBridgeIntent: true,
        amount,
        tokenSymbol,
        toChain,
        fromChain: fromChain || 'BASE'
      }
    }

    return { hasBridgeIntent: false }
  }

  let passed = 0
  let failed = 0

  for (const testCase of testCases) {
    console.log(`\n📝 "${testCase.message}"`)
    const result = extractBridgeIntent(testCase.message)
    
    if (result.hasBridgeIntent) {
      const fromMatch = result.fromChain === testCase.expected.fromChain
      const toMatch = result.toChain === testCase.expected.toChain
      const amountMatch = result.amount === testCase.expected.amount
      const tokenMatch = result.tokenSymbol === testCase.expected.token
      
      if (fromMatch && toMatch && amountMatch && tokenMatch) {
        console.log(`✅ All fields match`)
        passed++
      } else {
        console.log(`⚠️  Partial match:`)
        if (!fromMatch) console.log(`   From: expected ${testCase.expected.fromChain}, got ${result.fromChain}`)
        if (!toMatch) console.log(`   To: expected ${testCase.expected.toChain}, got ${result.toChain}`)
        if (!amountMatch) console.log(`   Amount: expected ${testCase.expected.amount}, got ${result.amount}`)
        if (!tokenMatch) console.log(`   Token: expected ${testCase.expected.token}, got ${result.tokenSymbol}`)
        failed++
      }
      
      console.log(`   From: ${result.fromChain}, To: ${result.toChain}, Amount: ${result.amount}, Token: ${result.tokenSymbol}`)
    } else {
      console.log(`❌ No bridge intent detected`)
      failed++
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
}

testBridgeIntentExtraction()
