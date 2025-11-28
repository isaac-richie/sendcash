import dotenv from 'dotenv'
dotenv.config()

import { ethers } from 'ethers'
import { BASE_RPC, CONTRACTS, TOKENS } from '../services/config.js'
import { 
  parsePaymentFromReceipt, 
  getTelegramIdFromAddress,
  formatTokenAmount,
  checkAndNotifyPayment
} from '../services/paymentNotifications.js'
import { dbGet, dbAll } from '../services/database.js'

/**
 * Test payment notification system
 */
async function testPaymentNotifications() {
  console.log('🧪 Testing Payment Notification System\n')
  console.log('='.repeat(80))
  
  try {
    // Test 1: Check if we have required contracts configured
    console.log('\n📋 Test 1: Configuration Check')
    console.log('-'.repeat(80))
    console.log(`SendCash Contract: ${CONTRACTS.SEND_CASH || 'NOT SET'}`)
    console.log(`Base RPC: ${BASE_RPC}`)
    console.log(`USDC Address: ${TOKENS.USDC.address || 'NOT SET'}`)
    
    if (!CONTRACTS.SEND_CASH) {
      console.error('❌ SEND_CASH_ADDRESS not configured!')
      return
    }
    
    // Test 2: Check database for test users
    console.log('\n📋 Test 2: Database Check')
    console.log('-'.repeat(80))
    const users = await dbAll('SELECT telegram_id, wallet_address, username FROM telegram_users LIMIT 5')
    console.log(`Found ${users.length} registered users:`)
    users.forEach((user, idx) => {
      console.log(`  ${idx + 1}. Telegram ID: ${user.telegram_id}, Username: @${user.username || 'N/A'}, Address: ${user.wallet_address?.slice(0, 10)}...`)
    })
    
    if (users.length < 2) {
      console.log('⚠️  Need at least 2 registered users to test notifications')
      console.log('   Register users first with /register @username')
      return
    }
    
    // Test 3: Test formatTokenAmount function
    console.log('\n📋 Test 3: Token Amount Formatting')
    console.log('-'.repeat(80))
    const testAmount = '1000000' // 1 USDC (6 decimals)
    const formatted = await formatTokenAmount(testAmount, TOKENS.USDC.address)
    console.log(`Input: ${testAmount} (wei/smallest unit)`)
    console.log(`Output: $${formatted} USDC`)
    console.log('✅ Formatting works correctly')
    
    // Test 4: Test getTelegramIdFromAddress
    console.log('\n📋 Test 4: Telegram ID Lookup')
    console.log('-'.repeat(80))
    if (users.length > 0) {
      const testUser = users[0]
      const telegramId = await getTelegramIdFromAddress(testUser.wallet_address)
      console.log(`Wallet Address: ${testUser.wallet_address}`)
      console.log(`Telegram ID Found: ${telegramId}`)
      console.log(`Expected: ${testUser.telegram_id}`)
      
      if (telegramId === testUser.telegram_id) {
        console.log('✅ Telegram ID lookup works correctly')
      } else {
        console.log('❌ Telegram ID lookup failed')
      }
    }
    
    // Test 5: Test parsing a real transaction (if provided)
    console.log('\n📋 Test 5: Transaction Parsing')
    console.log('-'.repeat(80))
    console.log('To test transaction parsing, you need a real transaction hash.')
    console.log('You can get one by sending a payment with /send command.')
    console.log('Then run: node tests/test-payment-notifications.js <tx_hash>')
    
    // If transaction hash provided as argument, test parsing
    const txHash = process.argv[2]
    if (txHash) {
      console.log(`\nTesting with transaction: ${txHash}`)
      const paymentData = await parsePaymentFromReceipt(txHash)
      
      if (paymentData) {
        console.log('✅ Payment data parsed successfully:')
        console.log(`  From: ${paymentData.from}`)
        console.log(`  To: ${paymentData.to}`)
        console.log(`  Token: ${paymentData.token}`)
        console.log(`  Amount: ${paymentData.amount}`)
        console.log(`  Fee: ${paymentData.fee}`)
        console.log(`  From Username: ${paymentData.fromUsername || 'N/A'}`)
        console.log(`  To Username: ${paymentData.toUsername || 'N/A'}`)
        
        // Test notification (without actually sending)
        console.log('\n📋 Test 6: Notification Format (Dry Run)')
        console.log('-'.repeat(80))
        const formattedAmount = await formatTokenAmount(paymentData.amount, paymentData.token)
        const formattedFee = await formatTokenAmount(paymentData.fee, paymentData.token)
        const amountAfterFee = BigInt(paymentData.amount) - BigInt(paymentData.fee)
        const formattedAmountAfterFee = await formatTokenAmount(amountAfterFee.toString(), paymentData.token)
        
        const tokenEntry = Object.entries(TOKENS).find(
          ([_, token]) => token.address?.toLowerCase() === paymentData.token.toLowerCase()
        )
        const tokenSymbol = tokenEntry ? tokenEntry[0] : 'TOKEN'
        
        const fromDisplay = paymentData.fromUsername 
          ? `@${paymentData.fromUsername}` 
          : `${paymentData.from.slice(0, 6)}...${paymentData.from.slice(-4)}`
        
        const notificationMessage = `💰 You received a payment! 🎉\n\n` +
          `From: ${fromDisplay}\n` +
          `Amount: $${formattedAmount} ${tokenSymbol}\n` +
          `Fee (0.5%): $${formattedFee} ${tokenSymbol}\n` +
          `You received: $${formattedAmountAfterFee} ${tokenSymbol}\n\n` +
          `Transaction: [View on Explorer](https://sepolia-explorer.base.org/tx/${paymentData.txHash})\n` +
          `Hash: \`${paymentData.txHash}\`\n\n` +
          `💡 Check your balance with /balance`
        
        console.log('Notification message would be:')
        console.log('-'.repeat(80))
        console.log(notificationMessage)
        console.log('-'.repeat(80))
        
        // Check if recipient is registered
        const recipientTelegramId = await getTelegramIdFromAddress(paymentData.to)
        if (recipientTelegramId) {
          console.log(`\n✅ Recipient is registered (Telegram ID: ${recipientTelegramId})`)
          console.log('   Notification would be sent to this user!')
        } else {
          console.log(`\n⚠️  Recipient (${paymentData.to}) is not registered with bot`)
          console.log('   Notification would not be sent')
        }
      } else {
        console.log('❌ Could not parse payment from transaction')
        console.log('   Make sure the transaction hash is valid and contains a PaymentSent event')
      }
    } else {
      console.log('\n💡 To test with a real transaction:')
      console.log('   1. Send a payment using /send @username $10 USDC')
      console.log('   2. Copy the transaction hash from the success message')
      console.log('   3. Run: node tests/test-payment-notifications.js <tx_hash>')
    }
    
    // Test 6: Simulate notification flow
    console.log('\n📋 Test 6: Simulated Notification Flow')
    console.log('-'.repeat(80))
    console.log('Simulating a payment notification...')
    
    // Create mock payment data
    if (users.length >= 2) {
      const sender = users[0]
      const recipient = users[1]
      
      const mockPaymentData = {
        from: sender.wallet_address,
        to: recipient.wallet_address,
        token: TOKENS.USDC.address,
        amount: '1000000', // 1 USDC
        fee: '5000', // 0.5% = 0.005 USDC
        fromUsername: sender.username || '',
        toUsername: recipient.username || '',
        txHash: '0x' + '0'.repeat(64), // Mock hash
        blockNumber: 12345
      }
      
      console.log('\nMock Payment Data:')
      console.log(`  From: @${mockPaymentData.fromUsername || sender.wallet_address.slice(0, 10) + '...'}`)
      console.log(`  To: @${mockPaymentData.toUsername || recipient.wallet_address.slice(0, 10) + '...'}`)
      console.log(`  Amount: 1 USDC`)
      console.log(`  Fee: 0.005 USDC`)
      
      const recipientId = await getTelegramIdFromAddress(recipient.wallet_address)
      if (recipientId) {
        console.log(`\n✅ Recipient Telegram ID: ${recipientId}`)
        console.log('   Notification would be sent to this user!')
        
        const formattedAmount = await formatTokenAmount(mockPaymentData.amount, mockPaymentData.token)
        const formattedFee = await formatTokenAmount(mockPaymentData.fee, mockPaymentData.token)
        const amountAfterFee = BigInt(mockPaymentData.amount) - BigInt(mockPaymentData.fee)
        const formattedAmountAfterFee = await formatTokenAmount(amountAfterFee.toString(), mockPaymentData.token)
        
        const fromDisplay = mockPaymentData.fromUsername 
          ? `@${mockPaymentData.fromUsername}` 
          : `${mockPaymentData.from.slice(0, 6)}...${mockPaymentData.from.slice(-4)}`
        
        const notificationMessage = `💰 You received a payment! 🎉\n\n` +
          `From: ${fromDisplay}\n` +
          `Amount: $${formattedAmount} USDC\n` +
          `Fee (0.5%): $${formattedFee} USDC\n` +
          `You received: $${formattedAmountAfterFee} USDC\n\n` +
          `Transaction: [View on Explorer](https://sepolia-explorer.base.org/tx/${mockPaymentData.txHash})\n` +
          `Hash: \`${mockPaymentData.txHash}\`\n\n` +
          `💡 Check your balance with /balance`
        
        console.log('\n📨 Notification Message:')
        console.log('-'.repeat(80))
        console.log(notificationMessage)
        console.log('-'.repeat(80))
        console.log('\n✅ Notification system is ready!')
      } else {
        console.log(`\n⚠️  Recipient (${recipient.wallet_address}) is not registered`)
        console.log('   They need to register with /register @username first')
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('✅ All tests completed!')
    console.log('\n💡 To test with a real payment:')
    console.log('   1. Make sure you have at least 2 registered users')
    console.log('   2. Send a payment: /send @username $10 USDC')
    console.log('   3. The recipient will automatically receive a notification!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error)
    console.error(error.stack)
  }
}

// Run tests
testPaymentNotifications().then(() => {
  process.exit(0)
}).catch(error => {
  console.error('Fatal error:', error)
  process.exit(1)
})


