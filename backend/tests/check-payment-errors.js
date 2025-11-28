/**
 * Check Payment Errors
 * Simulates payment flow to identify errors
 */

import dotenv from 'dotenv'
import { dbGet } from '../services/database.js'
import { getSmartWalletForUser } from '../services/thirdwebWallet.js'
import { prepareSendTransaction } from '../services/wallet.js'
import { getTokenBalance } from '../services/wallet.js'
import { TOKENS, CONTRACTS } from '../services/config.js'
import { sendTransactionFromSmartWallet } from '../services/thirdwebWallet.js'

dotenv.config()

async function checkPaymentErrors() {
  console.log('🔍 Checking Payment Flow for Errors...\n')
  
  try {
    // Get a test user from database
    const user = await dbGet('SELECT * FROM telegram_users LIMIT 1')
    
    if (!user) {
      console.log('❌ No users found in database')
      console.log('   Please register a user first')
      return
    }
    
    console.log(`✅ Found user: ${user.username || 'No username'} (ID: ${user.telegram_id})`)
    console.log(`   Wallet: ${user.wallet_address || 'Not set'}\n`)
    
    if (!user.wallet_address) {
      console.log('❌ User has no wallet address')
      return
    }
    
    // Step 1: Check wallet creation
    console.log('📝 Step 1: Checking Smart Wallet Creation...')
    try {
      const { smartWallet, walletAddress, personalAccount } = await getSmartWalletForUser(
        user.username || 'testuser',
        user.telegram_id
      )
      console.log(`   ✅ Smart wallet created/retrieved`)
      console.log(`   Address: ${walletAddress}`)
      console.log(`   Has smartWallet: ${!!smartWallet}`)
      console.log(`   Has personalAccount: ${!!personalAccount}\n`)
    } catch (error) {
      console.log(`   ❌ Error creating smart wallet:`)
      console.log(`   Type: ${error.constructor.name}`)
      console.log(`   Message: ${error.message}`)
      console.log(`   Stack: ${error.stack}\n`)
      return
    }
    
    // Step 2: Check balance
    console.log('📝 Step 2: Checking Token Balance...')
    try {
      const balanceData = await getTokenBalance(user.wallet_address, TOKENS.USDC.address)
      console.log(`   ✅ Balance check successful`)
      console.log(`   Balance: ${balanceData?.formatted || '0'} USDC`)
      console.log(`   Raw: ${balanceData?.raw?.toString() || '0'}\n`)
    } catch (error) {
      console.log(`   ❌ Error checking balance:`)
      console.log(`   Type: ${error.constructor.name}`)
      console.log(`   Message: ${error.message}`)
      console.log(`   Stack: ${error.stack}\n`)
    }
    
    // Step 3: Check transaction preparation
    console.log('📝 Step 3: Checking Transaction Preparation...')
    try {
      const txData = await prepareSendTransaction(
        user.wallet_address,
        'testuser', // recipient username
        'USDC',
        '1' // amount
      )
      console.log(`   ✅ Transaction prepared`)
      console.log(`   Recipient: ${txData.recipient}`)
      console.log(`   Amount: ${txData.amount}`)
      console.log(`   Amount Wei: ${txData.amountWei.toString()}\n`)
    } catch (error) {
      console.log(`   ❌ Error preparing transaction:`)
      console.log(`   Type: ${error.constructor.name}`)
      console.log(`   Message: ${error.message}`)
      console.log(`   Stack: ${error.stack}\n`)
      return
    }
    
    // Step 4: Check contract address
    console.log('📝 Step 4: Checking Contract Configuration...')
    console.log(`   SendCash Contract: ${CONTRACTS.SEND_CASH}`)
    console.log(`   USDC Token: ${TOKENS.USDC.address}`)
    console.log(`   Valid addresses: ${ethers.isAddress(CONTRACTS.SEND_CASH) && ethers.isAddress(TOKENS.USDC.address)}\n`)
    
    // Step 5: Try to send transaction (will fail if no balance, but we'll see the error)
    console.log('📝 Step 5: Attempting Transaction Send (will show errors)...')
    try {
      const { smartWallet, walletAddress, personalAccount } = await getSmartWalletForUser(
        user.username || 'testuser',
        user.telegram_id
      )
      
      const txData = await prepareSendTransaction(
        user.wallet_address,
        'testuser',
        'USDC',
        '1'
      )
      
      const txHash = await sendTransactionFromSmartWallet(
        smartWallet,
        CONTRACTS.SEND_CASH,
        "sendPayment",
        [
          'testuser',
          TOKENS.USDC.address,
          txData.amountWei
        ],
        personalAccount,
        user.wallet_address
      )
      
      console.log(`   ✅ Transaction sent successfully!`)
      console.log(`   Hash: ${txHash}\n`)
    } catch (error) {
      console.log(`   ❌ Error sending transaction:`)
      console.log(`   Type: ${error.constructor.name}`)
      console.log(`   Message: ${error.message}`)
      console.log(`   Code: ${error.code || 'N/A'}`)
      console.log(`   Stack:`)
      console.log(error.stack)
      console.log(`\n   🔍 Error Analysis:`)
      
      if (error.message.includes('insufficient') || error.message.includes('balance')) {
        console.log(`   → This is a balance issue (expected if wallet has no funds)`)
      } else if (error.message.includes('Paymaster') || error.message.includes('simulation')) {
        console.log(`   → This is a paymaster/simulation error (transaction format issue)`)
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        console.log(`   → This is a network/RPC connection issue`)
      } else if (error.message.includes('allowance') || error.message.includes('approve')) {
        console.log(`   → This is a token approval issue`)
      } else {
        console.log(`   → Unknown error type - check the stack trace above`)
      }
      console.log('')
    }
    
    console.log('✅ Error check complete!')
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    console.error(error.stack)
  }
}

// Import ethers for address validation
import { ethers } from 'ethers'

checkPaymentErrors().catch(console.error)


