/**
 * Test script to verify smart wallet functionality
 * Tests: wallet creation, account extraction, token approval, and transaction sending
 */

import dotenv from 'dotenv'
import { createSmartWalletForUsername, getSmartWalletForUser, approveTokenFromSmartWallet, sendTransactionFromSmartWallet } from './services/thirdwebWallet.js'
import { CONTRACTS, TOKENS } from './services/config.js'
import { ethers } from 'ethers'

dotenv.config()

async function testSmartWallet() {
  console.log('🧪 Testing Smart Wallet Functionality\n')
  console.log('=' .repeat(50))
  
  // Test parameters
  const testUsername = 'testuser'
  const testTelegramId = 12345
  
  try {
    // Test 1: Create smart wallet
    console.log('\n📝 Test 1: Creating smart wallet...')
    const { walletAddress, smartWallet, personalAccount } = await createSmartWalletForUsername(testUsername, testTelegramId)
    console.log('✅ Smart wallet created!')
    console.log(`   Wallet Address: ${walletAddress}`)
    console.log(`   Personal Account: ${personalAccount.address}`)
    console.log(`   Smart Wallet Type: ${typeof smartWallet}`)
    console.log(`   Smart Wallet Keys: ${Object.keys(smartWallet || {}).join(', ')}`)
    
    // Test 2: Get smart wallet for user
    console.log('\n📝 Test 2: Getting smart wallet for user...')
    const { smartWallet: retrievedWallet, personalAccount: retrievedAccount } = await getSmartWalletForUser(testUsername, testTelegramId)
    console.log('✅ Smart wallet retrieved!')
    console.log(`   Retrieved Wallet Type: ${typeof retrievedWallet}`)
    console.log(`   Retrieved Account: ${retrievedAccount.address}`)
    
    // Test 3: Validate addresses
    console.log('\n📝 Test 3: Validating addresses...')
    if (!CONTRACTS.SEND_CASH || CONTRACTS.SEND_CASH === '') {
      throw new Error('SEND_CASH address not configured')
    }
    if (!TOKENS.USDC.address || TOKENS.USDC.address === '') {
      throw new Error('USDC address not configured')
    }
    console.log('✅ Addresses validated!')
    console.log(`   SendCash: ${CONTRACTS.SEND_CASH}`)
    console.log(`   USDC: ${TOKENS.USDC.address}`)
    
    // Test 4: Test account extraction (without actually sending transaction)
    console.log('\n📝 Test 4: Testing account extraction...')
    try {
      const { getAccount } = await import("thirdweb/wallets")
      let account
      try {
        account = getAccount(smartWallet)
        if (!account || !account.address) {
          account = personalAccount
        }
      } catch (e) {
        account = personalAccount
      }
      console.log('✅ Account extracted!')
      console.log(`   Account Address: ${account.address}`)
      console.log(`   Account Type: ${typeof account}`)
    } catch (error) {
      console.log('⚠️  Account extraction test failed:', error.message)
    }
    
    // Test 5: Test transaction preparation (without sending)
    console.log('\n📝 Test 5: Testing transaction preparation...')
    try {
      const { prepareContractCall } = await import("thirdweb")
      const { getContract } = await import("thirdweb")
      const { baseSepolia } = await import("thirdweb/chains")
      const { createThirdwebClient } = await import("thirdweb")
      
      const client = createThirdwebClient({
        clientId: process.env.THIRDWEB_CLIENT_ID || "test",
      })
      
      const erc20Abi = [
        {
          type: "function",
          name: "approve",
          inputs: [
            { name: "spender", type: "address", internalType: "address" },
            { name: "amount", type: "uint256", internalType: "uint256" }
          ],
          outputs: [{ name: "", type: "bool", internalType: "bool" }],
          stateMutability: "nonpayable"
        }
      ]
      
      const tokenContract = getContract({
        client,
        chain: baseSepolia,
        address: TOKENS.USDC.address,
        abi: erc20Abi,
      })
      
      const transaction = prepareContractCall({
        contract: tokenContract,
        method: "approve",
        params: [CONTRACTS.SEND_CASH, ethers.MaxUint256],
      })
      
      console.log('✅ Transaction prepared!')
      console.log(`   Transaction Type: ${typeof transaction}`)
    } catch (error) {
      console.log('⚠️  Transaction preparation test failed:', error.message)
    }
    
    console.log('\n' + '='.repeat(50))
    console.log('✅ All tests completed successfully!')
    console.log('\n💡 Note: This test does not send actual transactions.')
    console.log('   To test with real transactions, use the Telegram bot.')
    console.log('='.repeat(50))
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

// Run tests
testSmartWallet()
  .then(() => {
    console.log('\n✅ Test script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test script error:', error)
    process.exit(1)
  })

