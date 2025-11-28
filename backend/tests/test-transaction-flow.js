/**
 * Test script to debug the "Invalid address: undefined" error
 * Simulates the actual transaction flow from the bot
 */

import dotenv from 'dotenv'
import { createSmartWalletForUsername, getSmartWalletForUser, approveTokenFromSmartWallet } from './services/thirdwebWallet.js'
import { CONTRACTS, TOKENS } from './services/config.js'
import { ethers } from 'ethers'

dotenv.config()

async function testTransactionFlow() {
  console.log('🧪 Testing Transaction Flow (Debugging Invalid Address Error)\n')
  console.log('=' .repeat(70))
  
  const testUsername = 'testuser_debug'
  const testTelegramId = 77777
  
  try {
    // Step 1: Create smart wallet (same as bot does)
    console.log('\n📝 Step 1: Creating smart wallet...')
    const { walletAddress, smartWallet, personalAccount } = await createSmartWalletForUsername(testUsername, testTelegramId)
    console.log('✅ Smart wallet created')
    console.log(`   Wallet Address: ${walletAddress}`)
    console.log(`   Personal Account: ${personalAccount.address}`)
    console.log(`   Smart Wallet Type: ${typeof smartWallet}`)
    console.log(`   Smart Wallet Constructor: ${smartWallet?.constructor?.name || 'unknown'}`)
    
    // Step 2: Get smart wallet (same as bot does)
    console.log('\n📝 Step 2: Getting smart wallet for user...')
    const { smartWallet: retrievedWallet, personalAccount: retrievedAccount } = await getSmartWalletForUser(testUsername, testTelegramId)
    console.log('✅ Smart wallet retrieved')
    console.log(`   Retrieved Type: ${typeof retrievedWallet}`)
    
    // Step 3: Inspect smartWallet structure
    console.log('\n📝 Step 3: Inspecting smartWallet structure...')
    if (typeof smartWallet === 'function') {
      console.log('   ⚠️  smartWallet is a function - might need to be called')
      try {
        const called = smartWallet()
        console.log(`   Called result type: ${typeof called}`)
        console.log(`   Called result keys: ${Object.keys(called || {}).slice(0, 10).join(', ')}`)
      } catch (e) {
        console.log(`   ❌ Error calling smartWallet: ${e.message}`)
      }
    } else if (typeof smartWallet === 'object') {
      console.log('   ✅ smartWallet is an object')
      console.log(`   Keys: ${Object.keys(smartWallet || {}).slice(0, 10).join(', ')}`)
      if (smartWallet.address) {
        console.log(`   Has address property: ${smartWallet.address}`)
      }
      if (smartWallet.getAddress) {
        try {
          const addr = await smartWallet.getAddress()
          console.log(`   getAddress() returns: ${addr}`)
        } catch (e) {
          console.log(`   getAddress() error: ${e.message}`)
        }
      }
    }
    
    // Step 4: Try to prepare transaction (this is where error occurs)
    console.log('\n📝 Step 4: Preparing transaction (this is where error occurs)...')
    try {
      const { prepareContractCall } = await import("thirdweb")
      const { getContract } = await import("thirdweb")
      const { sendTransaction } = await import("thirdweb")
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
      
      console.log('✅ Transaction prepared')
      
      // Step 5: Try sendTransaction with smartWallet (using our fixed function)
      console.log('\n📝 Step 5: Attempting sendTransaction with fixed function...')
      console.log(`   Using walletAddress: ${walletAddress}`)
      console.log(`   SponsorGas: ${process.env.SPONSOR_GAS === "true"}`)
      
      try {
        // Use our fixed function that adds address to wallet instance
        const { approveTokenFromSmartWallet } = await import('./services/thirdwebWallet.js')
        const result = await approveTokenFromSmartWallet(
          smartWallet,
          TOKENS.USDC.address,
          CONTRACTS.SEND_CASH,
          ethers.MaxUint256,
          personalAccount,
          walletAddress // Pass wallet address
        )
        console.log('✅✅✅ SUCCESS! Transaction sent! ✅✅✅')
        console.log(`   Transaction Hash: ${result}`)
        console.log('\n🎉 BUG FIXED! The address property is now added to wallet instance!')
      } catch (sendError) {
        console.log('❌ FAILED to send transaction')
        console.log(`   Error: ${sendError.message}`)
        console.log(`   Error Stack: ${sendError.stack}`)
        
        // Try alternative approaches
        console.log('\n📝 Step 6: Trying alternative approaches...')
        
        // Approach 1: Try personalAccount
        console.log('\n   Approach 1: Trying with personalAccount...')
        try {
          const result1 = await sendTransaction({
            transaction,
            account: personalAccount,
          })
          console.log('   ✅ SUCCESS with personalAccount!')
          console.log(`   Transaction Hash: ${result1.transactionHash}`)
        } catch (e1) {
          console.log(`   ❌ Failed: ${e1.message}`)
        }
        
        // Approach 2: Call smartWallet() to get instance, then use it
        console.log('\n   Approach 2: Calling smartWallet() to get instance...')
        try {
          const walletInstance = smartWallet()
          console.log(`   ✅ smartWallet() called, type: ${typeof walletInstance}`)
          console.log(`   Instance keys: ${Object.keys(walletInstance || {}).slice(0, 10).join(', ')}`)
          
          // Try using wallet instance directly
          try {
            const result2 = await sendTransaction({
              transaction,
              account: walletInstance,
            })
            console.log('   ✅ SUCCESS with wallet instance!')
            console.log(`   Transaction Hash: ${result2.transactionHash}`)
          } catch (e2) {
            console.log(`   ❌ Failed with wallet instance: ${e2.message}`)
            
            // Try getAccount() on wallet instance
            if (walletInstance.getAccount) {
              try {
                const account = await walletInstance.getAccount()
                console.log(`   getAccount() result: ${account ? 'got account' : 'undefined'}`)
                if (account && account.address) {
                  console.log(`   Account address: ${account.address}`)
                  try {
                    const result3 = await sendTransaction({
                      transaction,
                      account: account,
                    })
                    console.log('   ✅ SUCCESS with getAccount() result!')
                    console.log(`   Transaction Hash: ${result3.transactionHash}`)
                  } catch (e3) {
                    console.log(`   ❌ Failed with getAccount() result: ${e3.message}`)
                  }
                }
              } catch (e) {
                console.log(`   getAccount() error: ${e.message}`)
              }
            }
          }
        } catch (e) {
          console.log(`   ❌ Error calling smartWallet(): ${e.message}`)
        }
        
        // Approach 3: Try getAdminAccount() method
        console.log('\n   Approach 3: Trying getAdminAccount() method...')
        try {
          const walletInstance = smartWallet()
          if (walletInstance.getAdminAccount) {
            const adminAccount = await walletInstance.getAdminAccount()
            console.log(`   ✅ getAdminAccount() works, type: ${typeof adminAccount}`)
            console.log(`   Admin account address: ${adminAccount?.address || 'no address'}`)
            if (adminAccount && adminAccount.address) {
              try {
                const result3 = await sendTransaction({
                  transaction,
                  account: adminAccount,
                })
                console.log('   ✅ SUCCESS with getAdminAccount()!')
                console.log(`   Transaction Hash: ${result3.transactionHash}`)
              } catch (e3) {
                console.log(`   ❌ Failed with getAdminAccount(): ${e3.message}`)
              }
            }
          }
        } catch (e) {
          console.log(`   ❌ getAdminAccount() error: ${e.message}`)
        }
        
        // Approach 4: Try autoConnect() with personalAccount (simpler)
        console.log('\n   Approach 4: Trying autoConnect() with personalAccount (simpler)...')
        try {
          const walletInstance = smartWallet()
          if (walletInstance.autoConnect) {
            // Try with just personalAccount
            const connected = await walletInstance.autoConnect({
              personalAccount: personalAccount
            })
            console.log(`   ✅ autoConnect() works, type: ${typeof connected}`)
            console.log(`   Connected account address: ${connected?.address || 'no address'}`)
            if (connected && connected.address) {
              try {
                const result4 = await sendTransaction({
                  transaction,
                  account: connected,
                })
                console.log('   ✅✅✅ SUCCESS with autoConnected wallet! ✅✅✅')
                console.log(`   Transaction Hash: ${result4.transactionHash}`)
                console.log('\n🎉 THIS IS THE SOLUTION! Use autoConnect() with personalAccount!')
              } catch (e4) {
                console.log(`   ❌ Failed with autoConnected: ${e4.message}`)
              }
            }
          }
        } catch (e) {
          console.log(`   ❌ autoConnect() error: ${e.message}`)
        }
        
        // Approach 4b: Try connect() method (different signature)
        console.log('\n   Approach 4b: Trying connect() method...')
        try {
          const walletInstance = smartWallet()
          if (walletInstance.connect) {
            const connected = await walletInstance.connect({
              personalAccount: personalAccount
            })
            console.log(`   ✅ connect() works, type: ${typeof connected}`)
            console.log(`   Connected account address: ${connected?.address || 'no address'}`)
            if (connected && connected.address) {
              try {
                const result4b = await sendTransaction({
                  transaction,
                  account: connected,
                })
                console.log('   ✅✅✅ SUCCESS with connect()! ✅✅✅')
                console.log(`   Transaction Hash: ${result4b.transactionHash}`)
                console.log('\n🎉 THIS IS THE SOLUTION! Use connect() with personalAccount!')
              } catch (e4b) {
                console.log(`   ❌ Failed with connect(): ${e4b.message}`)
              }
            }
          }
        } catch (e) {
          console.log(`   ❌ connect() error: ${e.message}`)
        }
        
        // Approach 5: Try using wallet instance with address property added
        console.log('\n   Approach 5: Creating account object with wallet address...')
        try {
          const walletInstance = smartWallet()
          // Create an account-like object with the predicted wallet address
          const accountWithAddress = {
            ...walletInstance,
            address: walletAddress, // Use the predicted wallet address
            type: 'smart-wallet'
          }
          console.log(`   ✅ Created account object with address: ${accountWithAddress.address}`)
          try {
            const result5 = await sendTransaction({
              transaction,
              account: accountWithAddress,
            })
            console.log('   ✅✅✅ SUCCESS with account object! ✅✅✅')
            console.log(`   Transaction Hash: ${result5.transactionHash}`)
            console.log('\n🎉 THIS IS THE SOLUTION! Add address property to wallet instance!')
          } catch (e5) {
            console.log(`   ❌ Failed with account object: ${e5.message}`)
          }
        } catch (e) {
          console.log(`   ❌ Error creating account object: ${e.message}`)
        }
        
        // Approach 6: Check wallet instance for address getter
        console.log('\n   Approach 6: Checking wallet instance for address...')
        try {
          const walletInstance = smartWallet()
          // Check all possible ways to get address
          console.log(`   walletInstance.address: ${walletInstance.address || 'undefined'}`)
          if (walletInstance.getAddress) {
            try {
              const addr = await walletInstance.getAddress()
              console.log(`   getAddress() returns: ${addr}`)
              if (addr) {
                const accountWithAddr = { ...walletInstance, address: addr }
                try {
                  const result6 = await sendTransaction({
                    transaction,
                    account: accountWithAddr,
                  })
                  console.log('   ✅✅✅ SUCCESS with getAddress()! ✅✅✅')
                  console.log(`   Transaction Hash: ${result6.transactionHash}`)
                  console.log('\n🎉 THIS IS THE SOLUTION! Use getAddress() on wallet instance!')
                } catch (e6) {
                  console.log(`   ❌ Failed: ${e6.message}`)
                }
              }
            } catch (e) {
              console.log(`   getAddress() error: ${e.message}`)
            }
          }
        } catch (e) {
          console.log(`   ❌ Error checking address: ${e.message}`)
        }
      }
      
    } catch (error) {
      console.log(`❌ Error in transaction preparation: ${error.message}`)
      throw error
    }
    
    console.log('\n' + '='.repeat(70))
    console.log('✅ Test completed')
    console.log('='.repeat(70))
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testTransactionFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Test error:', error)
    process.exit(1)
  })

