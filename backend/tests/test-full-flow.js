/**
 * Full flow test: Approve token and send payment
 * This tests the complete transaction route through thirdwebWallet.js
 */

import dotenv from 'dotenv';
dotenv.config();

import { 
  createSmartWalletForUsername, 
  approveTokenFromSmartWallet, 
  sendTransactionFromSmartWallet,
  getSmartWalletForUser 
} from './services/thirdwebWallet.js';
import { TOKENS, CONTRACTS } from './services/config.js';
import { ethers } from 'ethers';

async function testFullFlow() {
  console.log('🧪 Testing Full Transaction Flow: Approve + Send Payment\n');
  console.log('='.repeat(80));
  
  const testUsername = 'testuser_full';
  const testUserId = 99999;
  const recipientUsername = 'recipient';
  const recipientUserId = 88888;
  const sendAmount = '1.0'; // Send 1 USDC
  
  try {
    // Step 1: Create sender wallet
    console.log('\n📝 Step 1: Creating Sender Smart Wallet...');
    const { walletAddress: senderAddress, smartWallet: senderWallet, personalAccount: senderPersonalAccount } = 
      await createSmartWalletForUsername(testUsername, testUserId);
    console.log('✅ Sender wallet created');
    console.log(`   Wallet Address: ${senderAddress}`);
    console.log(`   Personal Account: ${senderPersonalAccount.address}`);
    
    // Step 2: Create recipient wallet and register username
    console.log('\n📝 Step 2: Creating Recipient Smart Wallet...');
    const { walletAddress: recipientAddress, smartWallet: recipientWallet, personalAccount: recipientPersonalAccount } = 
      await createSmartWalletForUsername(recipientUsername, recipientUserId);
    console.log('✅ Recipient wallet created');
    console.log(`   Wallet Address: ${recipientAddress}`);
    
    // Register recipient username on-chain
    console.log('\n📝 Step 2.1: Registering Recipient Username On-Chain...');
    const { registerUsernameInRegistry } = await import('./services/thirdwebWallet.js');
    try {
      const regResult = await registerUsernameInRegistry(recipientUsername, recipientAddress);
      if (regResult.alreadyRegistered) {
        console.log('✅ Recipient username already registered');
      } else {
        console.log('✅ Recipient username registered');
        console.log(`   Transaction: ${regResult.txHash}`);
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (regError) {
      console.log(`   ⚠️  Registration error: ${regError.message}`);
      console.log('   Continuing anyway...');
    }
    
    // Step 3: Check sender wallet USDC balance
    console.log('\n📝 Step 3: Checking Sender Wallet USDC Balance...');
    const { BASE_RPC } = await import('./services/config.js');
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    const usdcAbi = ['function balanceOf(address) view returns (uint256)'];
    const usdcContract = new ethers.Contract(TOKENS.USDC.address, usdcAbi, provider);
    const balance = await usdcContract.balanceOf(senderAddress);
    const balanceFormatted = ethers.formatUnits(balance, TOKENS.USDC.decimals);
    console.log(`   USDC Balance: ${balanceFormatted} USDC`);
    
    if (parseFloat(balanceFormatted) === 0) {
      console.log('   ⚠️  Wallet has no USDC. The test will proceed but approval/send will fail.');
      console.log('   💡 To fund the wallet, send USDC to:', senderAddress);
    } else {
      console.log(`   ✅ Wallet has ${balanceFormatted} USDC`);
    }
    
    // Step 4: Approve token spending
    console.log('\n📝 Step 4: Approving Token Spending...');
    try {
      const approveTxHash = await approveTokenFromSmartWallet(
        senderWallet,
        TOKENS.USDC.address,
        CONTRACTS.SEND_CASH,
        ethers.MaxUint256, // Approve unlimited
        senderPersonalAccount,
        senderAddress
      );
      console.log('✅ Token approval successful!');
      console.log(`   Transaction Hash: ${approveTxHash}`);
      console.log(`   Explorer: https://sepolia-explorer.base.org/tx/${approveTxHash}`);
      
      // Wait for confirmation
      console.log('   ⏳ Waiting for confirmation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (approveError) {
      console.log('❌ Token approval failed');
      console.log(`   Error: ${approveError.message}`);
      if (approveError.message.includes('balance') || approveError.message.includes('funds')) {
        console.log('   💡 This is expected if wallet has no USDC balance');
      }
      throw approveError;
    }
    
    // Step 5: Check allowance
    console.log('\n📝 Step 5: Checking Token Allowance...');
    const allowanceAbi = ['function allowance(address owner, address spender) view returns (uint256)'];
    const allowanceContract = new ethers.Contract(TOKENS.USDC.address, allowanceAbi, provider);
    const allowance = await allowanceContract.allowance(senderAddress, CONTRACTS.SEND_CASH);
    const allowanceFormatted = ethers.formatUnits(allowance, TOKENS.USDC.decimals);
    console.log(`   Allowance: ${allowanceFormatted} USDC`);
    
    if (allowance === 0n) {
      console.log('   ⚠️  Allowance is 0. Approval may not have been confirmed yet.');
    } else {
      console.log('   ✅ Allowance set successfully!');
    }
    
    // Step 6: Send payment
    console.log('\n📝 Step 6: Sending Payment...');
    try {
      const amountWei = ethers.parseUnits(sendAmount, TOKENS.USDC.decimals);
      
      const sendTxHash = await sendTransactionFromSmartWallet(
        senderWallet,
        CONTRACTS.SEND_CASH,
        'sendPayment',
        [
          recipientUsername.toLowerCase(), // toUsername
          TOKENS.USDC.address, // token
          amountWei // amount
        ],
        senderPersonalAccount,
        senderAddress
      );
      
      console.log('✅ Payment sent successfully!');
      console.log(`   Transaction Hash: ${sendTxHash}`);
      console.log(`   Explorer: https://sepolia-explorer.base.org/tx/${sendTxHash}`);
      console.log(`   Amount: ${sendAmount} USDC`);
      console.log(`   Recipient: @${recipientUsername} (${recipientAddress})`);
      
      // Wait for confirmation
      console.log('   ⏳ Waiting for confirmation...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 7: Verify recipient balance
      console.log('\n📝 Step 7: Verifying Recipient Balance...');
      const recipientBalance = await usdcContract.balanceOf(recipientAddress);
      const recipientBalanceFormatted = ethers.formatUnits(recipientBalance, TOKENS.USDC.decimals);
      console.log(`   Recipient USDC Balance: ${recipientBalanceFormatted} USDC`);
      
      // Step 8: Verify sender balance
      console.log('\n📝 Step 8: Verifying Sender Balance...');
      const newSenderBalance = await usdcContract.balanceOf(senderAddress);
      const newSenderBalanceFormatted = ethers.formatUnits(newSenderBalance, TOKENS.USDC.decimals);
      console.log(`   Sender USDC Balance: ${newSenderBalanceFormatted} USDC`);
      
      const balanceDiff = parseFloat(balanceFormatted) - parseFloat(newSenderBalanceFormatted);
      console.log(`   Balance Change: -${balanceDiff.toFixed(6)} USDC`);
      
      if (balanceDiff > 0) {
        console.log('   ✅ Balance decreased - payment was successful!');
      } else {
        console.log('   ⚠️  Balance did not decrease. Payment may still be pending.');
      }
      
    } catch (sendError) {
      console.log('❌ Payment failed');
      console.log(`   Error: ${sendError.message}`);
      if (sendError.message.includes('allowance') || sendError.message.includes('approve')) {
        console.log('   💡 Make sure token approval was successful');
      }
      throw sendError;
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Full transaction flow test completed successfully!');
    console.log('\n📊 Summary:');
    console.log(`   Sender: @${testUsername} (${senderAddress})`);
    console.log(`   Recipient: @${recipientUsername} (${recipientAddress})`);
    console.log(`   Amount: ${sendAmount} USDC`);
    console.log(`   Status: ✅ SUCCESS`);
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(`   Type: ${error.constructor.name}`);
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack?.substring(0, 1000)}`);
    process.exit(1);
  }
}

// Run the test
testFullFlow().catch(console.error);

