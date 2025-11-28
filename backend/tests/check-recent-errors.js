/**
 * Check Recent Payment Errors
 * Analyzes common failure points in the payment flow
 */

import dotenv from 'dotenv'
import { dbGet, dbAll } from '../services/database.js'
import { getSmartWalletForUser } from '../services/thirdwebWallet.js'
import { getTokenBalance } from '../services/wallet.js'
import { getUsernameRegistry } from '../services/contracts.js'
import { TOKENS, CONTRACTS } from '../services/config.js'
import { ethers } from 'ethers'

dotenv.config()

async function checkRecentErrors() {
  console.log('🔍 Checking for Common Payment Errors...\n')
  
  try {
    // Get recent users who might have tried to send
    const users = await dbAll('SELECT * FROM telegram_users ORDER BY created_at DESC LIMIT 5')
    
    if (users.length === 0) {
      console.log('❌ No users found in database')
      return
    }
    
    console.log(`✅ Found ${users.length} recent users\n`)
    
    for (const user of users) {
      console.log(`\n📋 Checking user: ${user.username || 'No username'} (ID: ${user.telegram_id})`)
      console.log(`   Wallet: ${user.wallet_address || 'Not set'}`)
      
      if (!user.wallet_address) {
        console.log(`   ⚠️  User has no wallet address - cannot send payments`)
        continue
      }
      
      // Check 1: Smart wallet creation
      console.log(`\n   1️⃣  Checking smart wallet...`)
      try {
        const { smartWallet, walletAddress } = await getSmartWalletForUser(
          user.username || 'testuser',
          user.telegram_id
        )
        console.log(`      ✅ Smart wallet OK: ${walletAddress}`)
      } catch (error) {
        console.log(`      ❌ Smart wallet error: ${error.message}`)
        continue
      }
      
      // Check 2: Token balance
      console.log(`\n   2️⃣  Checking USDC balance...`)
      try {
        const balanceData = await getTokenBalance(user.wallet_address, TOKENS.USDC.address)
        const balance = parseFloat(balanceData?.formatted || '0')
        console.log(`      Balance: $${balance} USDC`)
        if (balance === 0) {
          console.log(`      ⚠️  User has zero balance - cannot send payments`)
        }
      } catch (error) {
        console.log(`      ❌ Balance check error: ${error.message}`)
      }
      
      // Check 3: Contract addresses
      console.log(`\n   3️⃣  Checking contract configuration...`)
      const sendCashValid = ethers.isAddress(CONTRACTS.SEND_CASH)
      const usdcValid = ethers.isAddress(TOKENS.USDC.address)
      console.log(`      SendCash contract: ${sendCashValid ? '✅ Valid' : '❌ Invalid'} (${CONTRACTS.SEND_CASH})`)
      console.log(`      USDC token: ${usdcValid ? '✅ Valid' : '❌ Invalid'} (${TOKENS.USDC.address})`)
      
      // Check 4: Recent payments
      console.log(`\n   4️⃣  Checking recent payments...`)
      try {
        const payments = await dbAll(
          `SELECT * FROM payments 
           WHERE from_address = ? OR to_address = ? 
           ORDER BY created_at DESC LIMIT 3`,
          [user.wallet_address.toLowerCase(), user.wallet_address.toLowerCase()]
        )
        
        if (payments.length === 0) {
          console.log(`      ℹ️  No payment history found`)
        } else {
          console.log(`      Found ${payments.length} recent payments:`)
          for (const payment of payments) {
            const status = payment.status || 'unknown'
            const statusIcon = status === 'completed' ? '✅' : status === 'pending' ? '⏳' : '❌'
            console.log(`      ${statusIcon} ${payment.tx_hash?.substring(0, 20)}... - ${status}`)
          }
        }
      } catch (error) {
        console.log(`      ❌ Error checking payments: ${error.message}`)
      }
    }
    
    // Check 5: Common issues
    console.log(`\n\n🔍 Common Issues Check:`)
    console.log(`   • RPC endpoint: ${process.env.BASE_RPC || 'Not set'}`)
    console.log(`   • Thirdweb client ID: ${process.env.THIRDWEB_CLIENT_ID ? '✅ Set' : '❌ Not set'}`)
    console.log(`   • Telegram bot token: ${process.env.TELEGRAM_BOT_TOKEN ? '✅ Set' : '❌ Not set'}`)
    
    console.log(`\n✅ Error check complete!`)
    
  } catch (error) {
    console.error('❌ Fatal error:', error)
    console.error(error.stack)
  }
}

checkRecentErrors().catch(console.error)


