/**
 * Test Bridge and Pay Prompts
 * Tests the 10 example prompts provided by user
 */

import { parseChainFromMessage } from '../services/chainDetector.js'

const testPrompts = [
  {
    prompt: "Send 25 USDC to my friend on Base. My funds are on Polygon.",
    expected: {
      chain: "BASE",
      sourceChain: "POLYGON",
      bridgeNeeded: true,
      amount: 25,
      token: "USDC"
    }
  },
  {
    prompt: "Pay this wallet 10 USDC on Arbitrum, but use the USDC in my Optimism account.",
    expected: {
      chain: "ARBITRUM",
      sourceChain: "OPTIMISM",
      bridgeNeeded: true,
      amount: 10,
      token: "USDC"
    }
  },
  {
    prompt: "I want to pay 5 USDT on BNB Chain. Bridge it from my Ethereum balance.",
    expected: {
      chain: "BSC",
      sourceChain: "ETHEREUM",
      bridgeNeeded: true,
      amount: 5,
      token: "USDT"
    }
  },
  {
    prompt: "Bridge 40 USDC to Solana and send it immediately to this address.",
    expected: {
      chain: "SOLANA", // Note: Not supported, but should extract
      bridgeNeeded: true,
      amount: 40,
      token: "USDC"
    }
  },
  {
    prompt: "Pay my Netflix subscription on Polygon using my USDC on Base.",
    expected: {
      chain: "POLYGON",
      sourceChain: "BASE",
      bridgeNeeded: true,
      amount: null, // Not specified
      token: "USDC"
    }
  },
  {
    prompt: "Bridge whatever amount I need to Starknet and send 15 USDC to this wallet.",
    expected: {
      chain: "STARKNET", // Note: Not supported
      bridgeNeeded: true,
      amount: 15,
      token: "USDC"
    }
  },
  {
    prompt: "Use the cheapest route to move 20 USDC from Arbitrum to Avalanche and pay this invoice.",
    expected: {
      chain: "AVALANCHE",
      sourceChain: "ARBITRUM",
      bridgeNeeded: true,
      cheapestRoute: true,
      amount: 20,
      token: "USDC"
    }
  },
  {
    prompt: "I need to send 12 USDC to a friend on Optimism. Bridge from any chain that has enough balance.",
    expected: {
      chain: "OPTIMISM",
      useAnyChain: true,
      bridgeNeeded: true,
      amount: 12,
      token: "USDC"
    }
  },
  {
    prompt: "Move 30 USDC from Polygon to zkSync and send the payment once it arrives.",
    expected: {
      chain: "ZKSYNC_ERA",
      sourceChain: "POLYGON",
      bridgeNeeded: true,
      amount: 30,
      token: "USDC"
    }
  },
  {
    prompt: "Bridge and pay 50 USDT on Ethereum using the funds I have on BNB Chain",
    expected: {
      chain: "ETHEREUM",
      sourceChain: "BSC",
      bridgeNeeded: true,
      amount: 50,
      token: "USDT"
    }
  }
]

console.log('🧪 Testing Bridge and Pay Prompts\n')
console.log('='.repeat(60))

let passed = 0
let failed = 0

for (const test of testPrompts) {
  console.log(`\n📝 Prompt: "${test.prompt}"`)
  
  const detected = parseChainFromMessage(test.prompt)
  const detectedChain = detected ? detected.key : null
  
  // Check chain detection
  if (test.expected.chain && detectedChain === test.expected.chain) {
    console.log(`✅ Chain detected: ${detectedChain}`)
    passed++
  } else if (test.expected.chain && !detectedChain) {
    console.log(`❌ Chain not detected (expected: ${test.expected.chain})`)
    failed++
  } else if (!test.expected.chain && !detectedChain) {
    console.log(`✅ No chain (as expected)`)
    passed++
  } else {
    console.log(`⚠️  Chain mismatch: expected ${test.expected.chain}, got ${detectedChain}`)
    failed++
  }
  
  // Note: Full extraction would require AI agent, but chain detection is a good start
  console.log(`   Expected: ${test.expected.chain || 'null'}, Got: ${detectedChain || 'null'}`)
}

console.log('\n' + '='.repeat(60))
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
console.log(`\nNote: Full prompt extraction requires AI agent integration.`)
console.log(`This test only validates chain detection from prompts.`)
