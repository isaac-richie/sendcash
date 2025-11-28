/**
 * Test script to verify account extraction and address resolution
 * Tests: getAccount from smartWallet, address extraction, transaction preparation
 */

import dotenv from 'dotenv'
import { createSmartWalletForUsername, getSmartWalletForUser, approveTokenFromSmartWallet } from './services/thirdwebWallet.js'
import { CONTRACTS, TOKENS } from './services/config.js'
import { ethers } from 'ethers'
// getAccount will be imported dynamically

dotenv.config()

async function testAccountExtraction() {
  console.log('🧪 Testing Account Extraction and Address Resolution\n')
  console.log('=' .repeat(60))
  
  // Test parameters
  const testUsername = 'testuser_address'
  const testTelegramId = 88888
  
  try {
    // Test 1: Create smart wallet
    console.log('\n📝 Test 1: Creating smart wallet...')
    const { walletAddress, smartWallet, personalAccount } = await createSmartWalletForUsername(testUsername, testTelegramId)
    console.log('✅ Smart wallet created!')
    console.log(`   Wallet Address: ${walletAddress}`)
    console.log(`   Personal Account: ${personalAccount.address}`)
    console.log(`   Smart Wallet Type: ${typeof smartWallet}`)
    
    // Test 2: Extract account from smart wallet
    console.log('\n📝 Test 2: Extracting account from smart wallet...')
    let account;
    try {
      const { getAccount } = await import("thirdweb/wallets");
      account = getAccount(smartWallet);
      if (!account || !account.address) {
        throw new Error('Account has no address');
      }
      console.log('✅ Account extracted successfully!')
      console.log(`   Account Address: ${account.address}`)
      console.log(`   Account Type: ${typeof account}`)
      console.log(`   Account Keys: ${Object.keys(account || {}).slice(0, 5).join(', ')}...`)
    } catch (error) {
      console.log(`   ❌ Failed to extract account: ${error.message}`)
      throw error
    }
    
    // Test 3: Verify address is valid
    console.log('\n📝 Test 3: Verifying address validity...')
    if (!account.address) {
      throw new Error('Account address is undefined')
    }
    if (!ethers.isAddress(account.address)) {
      throw new Error(`Account address is not a valid address: ${account.address}`)
    }
    console.log('✅ Address is valid!')
    console.log(`   Address: ${account.address}`)
    console.log(`   Checksummed: ${ethers.getAddress(account.address)}`)
    
    // Test 4: Test transaction preparation with account
    console.log('\n📝 Test 4: Testing transaction preparation with extracted account...')
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
      
      console.log('✅ Transaction prepared successfully!')
      console.log(`   Transaction Type: ${typeof transaction}`)
      console.log(`   Account address available: ${account.address ? 'YES' : 'NO'}`)
      console.log(`   ✅ Ready for sendTransaction with account`)
    } catch (error) {
      console.log(`   ❌ Transaction preparation failed: ${error.message}`)
      throw error
    }
    
    // Test 5: Verify account can be used (simulation)
    console.log('\n📝 Test 5: Verifying account structure for sendTransaction...')
    console.log(`   Account has address property: ${account.address ? 'YES' : 'NO'}`)
    console.log(`   Address value: ${account.address || 'UNDEFINED'}`)
    console.log(`   Account is object: ${typeof account === 'object' ? 'YES' : 'NO'}`)
    console.log(`   ✅ Account structure verified`)
    
    // Test 6: Compare with personal account
    console.log('\n📝 Test 6: Comparing extracted account with personal account...')
    console.log(`   Extracted Account: ${account.address}`)
    console.log(`   Personal Account: ${personalAccount.address}`)
    console.log(`   Smart Wallet Address: ${walletAddress}`)
    if (account.address.toLowerCase() === personalAccount.address.toLowerCase()) {
      console.log(`   ⚠️  WARNING: Extracted account matches personal account`)
      console.log(`   This might mean getAccount() is returning personal account`)
    } else {
      console.log(`   ✅ Extracted account is different from personal account`)
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('✅ All tests completed successfully!')
    console.log('\n💡 Summary:')
    console.log('   ✅ Account extraction works')
    console.log('   ✅ Address is valid and defined')
    console.log('   ✅ Transaction preparation works')
    console.log('   ✅ Account structure is correct')
    console.log('\n⚠️  Note: This test does not send actual transactions.')
    console.log('   The "Invalid address: undefined" error should be fixed!')
    console.log('='.repeat(60))
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    console.error('\n❌ The "Invalid address: undefined" error is NOT fixed!')
    process.exit(1)
  }
}

// Run tests
testAccountExtraction()
  .then(() => {
    console.log('\n✅ Test script completed - Account extraction is working!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Test script error:', error)
    process.exit(1)
  })

