/**
 * Test script to trace transaction route through thirdwebWallet.js
 * This will help identify where errors are occurring
 */

import dotenv from 'dotenv';
dotenv.config();

import { createSmartWalletForUsername, approveTokenFromSmartWallet, getSmartWalletForUser } from './services/thirdwebWallet.js';
import { TOKENS, CONTRACTS } from './services/config.js';
import { ethers } from 'ethers';

async function testTransactionRoute() {
  console.log('🧪 Testing Transaction Route Through thirdwebWallet.js\n');
  console.log('='.repeat(80));
  
  const testUsername = 'testuser';
  const testUserId = 12345;
  
  try {
    // Step 1: Create smart wallet
    console.log('\n📝 Step 1: Creating Smart Wallet...');
    const { walletAddress, smartWallet, personalAccount } = await createSmartWalletForUsername(testUsername, testUserId);
    console.log('✅ Smart wallet created');
    console.log(`   Wallet Address: ${walletAddress}`);
    console.log(`   Personal Account: ${personalAccount.address}`);
    console.log(`   Smart Wallet Type: ${typeof smartWallet}`);
    console.log(`   Smart Wallet Keys: ${Object.keys(smartWallet || {}).slice(0, 10).join(', ')}`);
    
    // Step 2: Get wallet instance
    console.log('\n📝 Step 2: Getting Wallet Instance...');
    const walletInstance = typeof smartWallet === 'function' ? smartWallet() : smartWallet;
    console.log('✅ Wallet instance obtained');
    console.log(`   Instance Type: ${typeof walletInstance}`);
    console.log(`   Has address: ${!!walletInstance.address}`);
    console.log(`   Has sendTransaction: ${typeof walletInstance.sendTransaction === 'function'}`);
    console.log(`   Has getAccount: ${typeof walletInstance.getAccount === 'function'}`);
    console.log(`   Has connect: ${typeof walletInstance.connect === 'function'}`);
    
    // Step 3: Test account extraction
    console.log('\n📝 Step 3: Testing Account Extraction...');
    let account = walletInstance;
    
    if (typeof walletInstance.connect === 'function') {
      try {
        const { createThirdwebClient } = await import('thirdweb');
        const client = createThirdwebClient({
          clientId: process.env.THIRDWEB_CLIENT_ID || "YOUR_CLIENT_ID",
        });
        const connectedAccount = await walletInstance.connect({ client });
        console.log('✅ Connected account obtained');
        console.log(`   Connected Account Type: ${typeof connectedAccount}`);
        console.log(`   Connected Account Keys: ${connectedAccount ? Object.keys(connectedAccount).slice(0, 10).join(', ') : 'null'}`);
        if (connectedAccount) {
          account = connectedAccount;
        }
      } catch (error) {
        console.log(`   ⚠️  Connect failed: ${error.message}`);
      }
    }
    
    if (typeof walletInstance.getAccount === 'function') {
      try {
        const actualAccount = await walletInstance.getAccount();
        console.log('✅ getAccount() called');
        console.log(`   Account Type: ${typeof actualAccount}`);
        console.log(`   Account Keys: ${actualAccount ? Object.keys(actualAccount).slice(0, 10).join(', ') : 'null'}`);
        if (actualAccount) {
          account = actualAccount;
        }
      } catch (error) {
        console.log(`   ⚠️  getAccount() failed: ${error.message}`);
      }
    }
    
    // Step 4: Test transaction preparation
    console.log('\n📝 Step 4: Testing Transaction Preparation...');
    const { prepareContractCall, getContract } = await import('thirdweb');
    // Import custom chain (defined in thirdwebWallet.js)
    const { baseSepolia } = await import('thirdweb/chains');
    const { defineChain } = await import('thirdweb');
    const { BASE_RPC } = await import('./services/config.js');
    
    const customBaseSepolia = defineChain({
      id: baseSepolia.id,
      name: baseSepolia.name,
      nativeCurrency: baseSepolia.nativeCurrency,
      rpc: BASE_RPC || baseSepolia.rpc,
      blockExplorers: baseSepolia.blockExplorers,
      testnet: baseSepolia.testnet,
    });
    const { createThirdwebClient } = await import('thirdweb');
    
    const client = createThirdwebClient({
      clientId: process.env.THIRDWEB_CLIENT_ID || "YOUR_CLIENT_ID",
    });
    
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
    ];
    
    const tokenContract = getContract({
      client,
      chain: customBaseSepolia,
      address: TOKENS.USDC.address,
      abi: erc20Abi,
    });
    
    const transaction = prepareContractCall({
      contract: tokenContract,
      method: "approve",
      params: [CONTRACTS.SEND_CASH, ethers.MaxUint256],
    });
    
    console.log('✅ Transaction prepared');
    console.log(`   Transaction Type: ${typeof transaction}`);
    console.log(`   Transaction Keys: ${Object.keys(transaction || {}).slice(0, 10).join(', ')}`);
    
    // Step 5: Test sendTransaction with wallet instance
    console.log('\n📝 Step 5: Testing sendTransaction with Wallet Instance...');
    const { sendTransaction } = await import('thirdweb');
    
    // Ensure wallet instance has address
    if (!walletInstance.address && walletAddress) {
      Object.defineProperty(walletInstance, 'address', {
        value: walletAddress,
        writable: false,
        enumerable: true,
        configurable: false
      });
      console.log('✅ Added address property to wallet instance');
    }
    
    console.log(`   Using account: ${account === walletInstance ? 'walletInstance' : 'extracted account'}`);
    console.log(`   Account has sendTransaction: ${typeof account.sendTransaction === 'function'}`);
    
    // Try to send transaction (this will fail if wallet doesn't have funds, but we can see the error)
    try {
      console.log('   Attempting to send transaction...');
      const result = await sendTransaction({
        transaction,
        account: walletInstance, // Use wallet instance directly
      });
      console.log('✅ Transaction sent successfully!');
      console.log(`   Transaction Hash: ${result.transactionHash}`);
    } catch (error) {
      console.log('❌ Transaction failed (expected if wallet has no funds)');
      console.log(`   Error Type: ${error.constructor.name}`);
      console.log(`   Error Message: ${error.message}`);
      console.log(`   Error Code: ${error.code || 'N/A'}`);
      
      // Check if it's a paymaster simulation error
      if (error.message.includes('Paymaster') || error.message.includes('simulation')) {
        console.log('\n   🔍 PAYMASTER SIMULATION ERROR DETECTED');
        console.log('   This suggests the transaction format is incorrect');
        console.log('   The transaction should be wrapped with prepareExecute');
      }
    }
    
    // Step 6: Test approveTokenFromSmartWallet function
    console.log('\n📝 Step 6: Testing approveTokenFromSmartWallet Function...');
    try {
      const result = await approveTokenFromSmartWallet(
        smartWallet,
        TOKENS.USDC.address,
        CONTRACTS.SEND_CASH,
        ethers.MaxUint256,
        personalAccount,
        walletAddress
      );
      console.log('✅ approveTokenFromSmartWallet succeeded!');
      console.log(`   Transaction Hash: ${result}`);
    } catch (error) {
      console.log('❌ approveTokenFromSmartWallet failed');
      console.log(`   Error Type: ${error.constructor.name}`);
      console.log(`   Error Message: ${error.message}`);
      console.log(`   Error Stack: ${error.stack?.substring(0, 500)}`);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ Transaction route test completed');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:');
    console.error(`   Type: ${error.constructor.name}`);
    console.error(`   Message: ${error.message}`);
    console.error(`   Stack: ${error.stack?.substring(0, 1000)}`);
  }
}

// Run the test
testTransactionRoute().catch(console.error);

