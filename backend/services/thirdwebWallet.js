import { createThirdwebClient, defineChain } from "thirdweb";
import { baseSepolia } from "thirdweb/chains";
import { smartWallet, predictSmartAccountAddress } from "thirdweb/wallets/smart";
import { privateKeyToAccount } from "thirdweb/wallets";
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { BASE_RPC } from './config.js';

// Ensure dotenv is loaded before accessing env vars
dotenv.config();

// Initialize Thirdweb client
const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID || "YOUR_CLIENT_ID",
});

// Validate client ID
if (!process.env.THIRDWEB_CLIENT_ID || process.env.THIRDWEB_CLIENT_ID === "YOUR_CLIENT_ID") {
  console.warn('⚠️  THIRDWEB_CLIENT_ID not set or using default. Smart wallet creation may fail.');
}

// Override Base Sepolia chain with custom RPC URL
// This fixes DNS issues with Thirdweb's default RPC endpoint (84532.rpc.thirdweb.com)
// We use our own BASE_RPC_URL from config instead
const customBaseSepolia = defineChain({
  id: baseSepolia.id,
  name: baseSepolia.name,
  nativeCurrency: baseSepolia.nativeCurrency,
  rpc: BASE_RPC || baseSepolia.rpc, // Use our custom RPC URL instead of Thirdweb's default
  blockExplorers: baseSepolia.blockExplorers,
  testnet: baseSepolia.testnet,
});

// Use custom Base Sepolia chain with our RPC URL
console.log('[Thirdweb] Using Base Sepolia chain with custom RPC:', {
  id: customBaseSepolia.id,
  name: customBaseSepolia.name,
  rpc: customBaseSepolia.rpc
});

// Get relayer account (for sponsoring transactions)
// Returns an ethers Wallet for contract interactions
const getRelayerAccount = async () => {
  if (!process.env.RELAYER_PRIVATE_KEY) {
    throw new Error('RELAYER_PRIVATE_KEY not set in .env');
  }
  const { BASE_RPC } = await import('./config.js');
  const provider = new ethers.JsonRpcProvider(BASE_RPC);
  return new ethers.Wallet(process.env.RELAYER_PRIVATE_KEY, provider);
};

/**
 * Create a deterministic personal wallet from Telegram user ID and username
 * This personal wallet acts as the "owner" of the smart wallet
 */
const createPersonalWallet = (telegramUserId, username) => {
  // Generate deterministic private key from Telegram ID + username
  const saltInput = `telegram_${telegramUserId}_${username.toLowerCase()}`;
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(saltInput));
  
  return privateKeyToAccount({
    client,
    privateKey: privateKey,
  });
};

/**
 * Export private key for a user
 * @param {number} telegramUserId - Telegram user ID
 * @param {string} username - Username
 * @returns {string} Private key (0x-prefixed hex string)
 */
export const exportPrivateKey = (telegramUserId, username) => {
  // Regenerate the same deterministic private key
  const saltInput = `telegram_${telegramUserId}_${username.toLowerCase()}`;
  const privateKey = ethers.keccak256(ethers.toUtf8Bytes(saltInput));
  return privateKey;
};

/**
 * Create a smart wallet for a username using Thirdweb
 * @param {string} username - The username
 * @param {number} telegramUserId - Telegram user ID
 * @returns {Object} Wallet address and smart wallet instance
 */
export const createSmartWalletForUsername = async (username, telegramUserId) => {
  try {
    // Create deterministic personal wallet
    const personalAccount = createPersonalWallet(telegramUserId, username);
    
    // Get the account address from the personal account
    // In Thirdweb, address is a property (not a method)
    const accountAddress = personalAccount.address;
    console.log('[createSmartWalletForUsername] Account address:', accountAddress);
    
    if (!accountAddress) {
      throw new Error('Failed to get account address from personal account');
    }

    // Thirdweb smart wallet factory address (deployed on Base Sepolia)
    // If not set or invalid, Thirdweb will use its default factory for the chain
    let factoryAddress = process.env.THIRDWEB_FACTORY_ADDRESS;
    
    // Validate factory address if provided
    if (factoryAddress) {
      if (!ethers.isAddress(factoryAddress) || factoryAddress === "0x00000000fC1237824fb747aBDE0CD183d8C90270") {
        console.warn('[createSmartWalletForUsername] Invalid factory address, using Thirdweb default');
        factoryAddress = undefined; // Let Thirdweb use default factory
      }
    }
    
    // Create smart wallet configuration
    // If factoryAddress is undefined, Thirdweb will use its default factory for Base Sepolia
        const walletConfig = {
          client,
          chain: customBaseSepolia, // Use custom chain with our RPC URL
      personalAccount: personalAccount,
          sponsorGas: process.env.SPONSOR_GAS === "true", // Enable gasless transactions
        };
    
    // Only add factoryAddress if it's valid
    if (factoryAddress) {
      walletConfig.factoryAddress = factoryAddress;
    }
    
    const wallet = smartWallet(walletConfig);

    // Get the smart wallet address (deterministic)
    // predictSmartAccountAddress needs adminAddress (the personal account address), client, chain, and optionally factory address
        const predictConfig = {
          client,
          chain: customBaseSepolia, // Use custom chain with our RPC URL
          adminAddress: accountAddress  // adminAddress is the personal account address
        };
    
    // Only add factoryAddress if it's valid (Thirdweb will use default if not provided)
    if (factoryAddress) {
      predictConfig.factoryAddress = factoryAddress;
    }
    
    const walletAddress = await predictSmartAccountAddress(predictConfig);

    // ✅ CRITICAL FIX: Return the wallet instance, not the smartWallet function
    return {
      walletAddress,
      smartWallet: wallet, // Return the instance, not the function
      personalAccount,
    };
  } catch (error) {
    console.error('Error creating Thirdweb smart wallet:', error);
    throw error;
  }
};

/**
 * Get wallet address for a username (if already created)
 * Uses the same deterministic logic
 */
export const getSmartWalletAddress = async (username, telegramUserId) => {
  try {
    const { walletAddress } = await createSmartWalletForUsername(username, telegramUserId);
    return walletAddress;
  } catch (error) {
    console.error('Error getting smart wallet address:', error);
    return null;
  }
};


/**
 * Get smart wallet instance for a user (by username and telegram ID)
 * This retrieves the same wallet that was created during registration
 */
export const getSmartWalletForUser = async (username, telegramUserId) => {
  try {
    const { walletAddress, smartWallet, personalAccount } = await createSmartWalletForUsername(username, telegramUserId);
    return { walletAddress, smartWallet, personalAccount };
  } catch (error) {
    console.error('[getSmartWalletForUser] Error getting smart wallet for user:', error);
    console.error('[getSmartWalletForUser] Username:', username, 'Telegram ID:', telegramUserId);
    throw error;
  }
};

/**
 * Send a transaction from smart wallet using Thirdweb
 * @param {Object} smartWallet - Thirdweb smart wallet instance
 * @param {string} contractAddress - Contract address to call
 * @param {string} functionName - Function name to call
 * @param {Array} params - Function parameters
 * @returns {Promise<string>} Transaction hash
 */
export const sendTransactionFromSmartWallet = async (smartWallet, contractAddress, functionName, params = [], personalAccount = null, walletAddress = null) => {
  const functionName_log = 'sendTransactionFromSmartWallet';
  const logPrefix = `[${functionName_log}]`;
  
  try {
    console.log(`${logPrefix} === START ===`);
    console.log(`${logPrefix} Contract: ${contractAddress}`);
    console.log(`${logPrefix} Function: ${functionName}`);
    console.log(`${logPrefix} Params count: ${params.length}`);
    console.log(`${logPrefix} Has personalAccount: ${!!personalAccount}`);
    console.log(`${logPrefix} Wallet address: ${walletAddress || 'not provided'}`);
    
    const { prepareContractCall } = await import("thirdweb");
    const { getContract } = await import("thirdweb");
    const { sendTransaction } = await import("thirdweb");
    
    // Validate inputs
    if (!contractAddress || contractAddress === 'undefined' || !ethers.isAddress(contractAddress)) {
      console.error(`${logPrefix} ❌ Validation failed: Invalid contract address: ${contractAddress}`);
      throw new Error(`Invalid contract address: ${contractAddress}`);
    }
    if (!smartWallet) {
      console.error(`${logPrefix} ❌ Validation failed: Smart wallet is undefined`);
      throw new Error('Smart wallet is undefined');
    }
    
    // smartWallet should already be the wallet instance (from getSmartWalletForUser)
    // But handle both cases: function or instance
    const walletInstance = typeof smartWallet === 'function' ? smartWallet() : smartWallet;
    
    console.log(`${logPrefix} Wallet instance type: ${typeof walletInstance}`);
    console.log(`${logPrefix} Wallet instance keys: ${Object.keys(walletInstance).slice(0, 20).join(', ')}`);
    console.log(`${logPrefix} Has send: ${typeof walletInstance.send === 'function'}`);
    console.log(`${logPrefix} Has execute: ${typeof walletInstance.execute === 'function'}`);
    console.log(`${logPrefix} Has sendTransaction: ${typeof walletInstance.sendTransaction === 'function'}`);
    console.log(`${logPrefix} Has getAccount: ${typeof walletInstance.getAccount === 'function'}`);
    
    // Thirdweb's sendTransaction needs an account with:
    // 1. An address property (for transaction serialization) 
    // 2. A sendTransaction method (for executing the transaction)
    // Add address property to wallet instance
    if (walletAddress && !walletInstance.address) {
      Object.defineProperty(walletInstance, 'address', {
        value: walletAddress,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
    
    // Use the smart wallet instance directly - it handles UserOperations correctly
    // We add a custom sendTransaction method if it doesn't exist
    if (!walletInstance.sendTransaction || typeof walletInstance.sendTransaction !== 'function') {
      // Create sendTransaction that wraps transactions through the smart wallet's execute() function
      walletInstance.sendTransaction = async (serializableTransaction) => {
        // Wrap transaction to execute through smart wallet's execute() function
        // Required for proper UserOperation execution with paymaster simulation
        try {
          // Get the personal account (admin account) for signing
          const adminAccount = personalAccount || walletInstance._personalAccount || (walletInstance.getAdminAccount ? await walletInstance.getAdminAccount() : null);
          if (!adminAccount) {
            throw new Error('Admin account (personalAccount) not available for signing UserOperation. Make sure personalAccount is passed to sendTransactionFromSmartWallet or approveTokenFromSmartWallet.');
          }
          
          // Get chain from wallet instance or use default
          // Ensure we always have a valid chain object
          let chain = customBaseSepolia; // Default fallback
          if (walletInstance.getChain) {
            try {
              const walletChain = await walletInstance.getChain();
              if (walletChain) {
                chain = walletChain;
              }
            } catch (error) {
              console.warn('[sendTransaction] Failed to get chain from wallet, using default:', error.message);
            }
          }
          
          // Get factory address - always use a factory (default if not set)
          let factoryAddress = process.env.THIRDWEB_FACTORY_ADDRESS;
          if (!factoryAddress || factoryAddress === "0x00000000fC1237824fb747aBDE0CD183d8C90270") {
            // Use Thirdweb's default factory for Base Sepolia
            // Import default factory constants
            const { DEFAULT_ACCOUNT_FACTORY_V0_6 } = await import("thirdweb/wallets/smart");
            factoryAddress = DEFAULT_ACCOUNT_FACTORY_V0_6;
          }
          
          // Get sponsorGas setting (default to true if SPONSOR_GAS env var is set)
          const sponsorGas = process.env.SPONSOR_GAS === "true";
          
          // Use Thirdweb's UserOperation utilities to execute the transaction
          // Import from the PUBLIC API (not internal lib paths)
          const { 
            createUnsignedUserOp, 
            signUserOp, 
            bundleUserOp, 
            waitForUserOpReceipt 
          } = await import("thirdweb/wallets/smart");
          const { getContract, prepareContractCall } = await import("thirdweb");
          
          if (!serializableTransaction) {
            throw new Error('serializableTransaction is undefined');
          }
          
          // Get smart wallet contract
          const accountContract = getContract({
            address: walletAddress || walletInstance.address,
            chain: chain,
            client,
          });
          
          // Wrap transaction to call smart wallet's execute(to, value, data) function
          // This is required because createUnsignedUserOp expects a wrapped transaction
          let value = serializableTransaction.value || 0n;
          if (typeof value === 'string') {
            value = BigInt(value);
          }
          
          const executeTx = prepareContractCall({
            contract: accountContract,
            method: "function execute(address, uint256, bytes)",
            params: [
              serializableTransaction.to || "",
              value,
              serializableTransaction.data || "0x"
            ],
          });
          
          // Validate executeTx has required properties
          if (!executeTx.chain) {
            throw new Error('executeTx.chain is undefined. Chain object is required.');
          }
          if (!executeTx.client) {
            throw new Error('executeTx.client is undefined. Client is required.');
          }
          
          // Get factory contract (required for createUnsignedUserOp)
          const factoryContract = getContract({
            address: factoryAddress,
            chain: chain,
            client,
          });
          
          // Check if wallet is deployed and handle deployment if needed
          const { isSmartWalletDeployed: checkDeployed } = await import('./thirdwebWallet.js');
          let walletIsDeployed = await checkDeployed(walletAddress || walletInstance.address);
          let useSponsorGas = sponsorGas;
          
          if (!walletIsDeployed) {
            console.log('[sendTransaction] Wallet not deployed. Funding and deploying...');
            const { fundWalletForDeployment, deployWalletExplicitly } = await import('./thirdwebWallet.js');
            try {
              // Fund wallet with ETH from relayer
              await fundWalletForDeployment(walletAddress || walletInstance.address, '0.001');
              
              // Deploy wallet via factory (relayer pays gas)
              await deployWalletExplicitly(walletAddress || walletInstance.address, adminAccount.address);
              
              // Wait for deployment confirmation
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Verify deployment
              const { isSmartWalletDeployed: verifyDeployed } = await import('./thirdwebWallet.js');
              walletIsDeployed = await verifyDeployed(walletAddress || walletInstance.address);
              
              if (!walletIsDeployed) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                walletIsDeployed = await verifyDeployed(walletAddress || walletInstance.address);
              }
            } catch (deployError) {
              console.error('[sendTransaction] Failed to deploy wallet:', deployError.message);
              throw new Error(`Failed to deploy wallet: ${deployError.message}`);
            }
          }
          
          // Final deployment check before UserOperation
          walletIsDeployed = await checkDeployed(walletAddress || walletInstance.address);
          
          // Create unsigned UserOperation
          // factoryContract is now always defined (never undefined)
          // Note: If bundler fails, it might be a network issue or Base Sepolia not supported
          // We'll let Thirdweb use its default bundler URL
          console.log(`[sendTransaction] Creating unsigned UserOperation (sponsorGas: ${useSponsorGas}, isDeployed: ${walletIsDeployed})...`);
          const unsignedUserOp = await createUnsignedUserOp({
            accountContract,
            adminAddress: adminAccount.address,
            factoryContract: factoryContract, // Always defined now
            transaction: executeTx,
            sponsorGas: useSponsorGas, // Disabled for undeployed wallets
            isDeployedOverride: walletIsDeployed, // ✅ FIX: Now guaranteed to be accurate
            waitForDeployment: false, // ✅ FIX: Don't wait if already deployed
            overrides: {
              // bundlerUrl: undefined means use default (https://84532.rpc.thirdweb.com/v2)
              // If this fails, it might be network/auth issue
              bundlerUrl: undefined, // Use default bundler
              entrypointAddress: undefined, // Use default entrypoint
            },
          });
          
          // Sign the UserOperation with the admin account
          const signedUserOp = await signUserOp({
            adminAccount,
            chain: chain,
            client,
            userOp: unsignedUserOp,
          });
          
          // Send the UserOperation to the bundler
          const bundlerOptions = {
            chain: chain || customBaseSepolia,
            client,
          };
          
          const userOpHash = await bundleUserOp({
            userOp: signedUserOp,
            options: bundlerOptions,
          });
          
          // Wait for the UserOperation to be mined and get the transaction receipt
          const receipt = await waitForUserOpReceipt({
            chain: chain || customBaseSepolia,
            client,
            userOpHash,
          });
          
          // Return the transaction hash
    return {
            transactionHash: receipt.transactionHash,
          };
        } catch (execError) {
          console.error('[sendTransaction] Error executing UserOperation:', execError.message);
          console.error('[sendTransaction] Error stack:', execError.stack?.substring(0, 1000));
          
          // Provide more helpful error messages for common issues
          let errorMessage = execError.message;
          if (errorMessage.includes('fetch failed')) {
            errorMessage = `Network error connecting to Thirdweb bundler. This could be due to:
- Network connectivity issues
- Thirdweb bundler not available for Base Sepolia
- Firewall blocking the request
- Invalid THIRDWEB_CLIENT_ID

Original error: ${execError.message}`;
          }
          
          throw new Error(`Failed to execute UserOperation: ${errorMessage}`);
        }
      };
    }
    
    // SendCash contract ABI - explicitly provide the function
    const sendCashAbi = [
      {
        type: "function",
        name: "sendPayment",
        inputs: [
          { name: "toUsername", type: "string", internalType: "string" },
          { name: "token", type: "address", internalType: "address" },
          { name: "amount", type: "uint256", internalType: "uint256" }
        ],
        outputs: [],
        stateMutability: "nonpayable"
      }
    ];
    
    // Get contract instance with explicit ABI
        const contract = getContract({
          client,
          chain: customBaseSepolia, // Use custom chain with our RPC URL
          address: contractAddress,
          abi: sendCashAbi,
        });

    // Prepare contract call
    const transaction = prepareContractCall({
      contract,
      method: functionName,
      params: params,
    });

    // Send transaction from smart wallet (gasless if sponsorGas is enabled)
    console.log('[sendTransactionFromSmartWallet] Sending transaction from smart wallet...');
    console.log('[sendTransactionFromSmartWallet] Contract:', contractAddress);
    console.log('[sendTransactionFromSmartWallet] Method:', functionName);
    console.log('[sendTransactionFromSmartWallet] Params:', params);
    
    // ✅ CRITICAL FIX: Use the smart wallet instance directly as the account
    // The smart wallet instance has a built-in sendTransaction method that properly
    // wraps transactions with prepareExecute to call the smart wallet's execute() function
    // We need to ensure the wallet instance has an address property
    if (walletAddress && !walletInstance.address) {
      Object.defineProperty(walletInstance, 'address', {
        value: walletAddress,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
    
    // Use the smart wallet instance directly - it handles UserOperations correctly
    const result = await sendTransaction({
      transaction,
      account: walletInstance, // Use wallet instance directly, not extracted account
    });

    console.log(`${logPrefix} ✅ Transaction sent: ${result.transactionHash}`);
    console.log(`${logPrefix} === SUCCESS ===`);
    return result.transactionHash;
  } catch (error) {
    const errorLogPrefix = `[${functionName_log}-ERROR]`;
    console.error(`${errorLogPrefix} ========== FUNCTION ERROR ==========`);
    console.error(`${errorLogPrefix} Error type: ${error.constructor.name}`);
    console.error(`${errorLogPrefix} Error message: ${error.message}`);
    console.error(`${errorLogPrefix} Error code: ${error.code || 'N/A'}`);
    console.error(`${errorLogPrefix} Error stack:`);
    console.error(error.stack);
    console.error(`${errorLogPrefix} Context:`);
    console.error(`${errorLogPrefix} - Contract: ${contractAddress}`);
    console.error(`${errorLogPrefix} - Function: ${functionName}`);
    console.error(`${errorLogPrefix} - Has smartWallet: ${!!smartWallet}`);
    console.error(`${errorLogPrefix} - Has personalAccount: ${!!personalAccount}`);
    console.error(`${errorLogPrefix} ======================================`);
    throw error;
  }
};

/**
 * Approve token spending from smart wallet
 * @param {Object} smartWallet - Thirdweb smart wallet instance
 * @param {string} tokenAddress - Token contract address
 * @param {string} spenderAddress - Address to approve (SendCash contract)
 * @param {bigint} amount - Amount to approve (use MaxUint256 for unlimited)
 * @returns {Promise<string>} Transaction hash
 */
export const approveTokenFromSmartWallet = async (smartWallet, tokenAddress, spenderAddress, amount, personalAccount = null, walletAddress = null) => {
  // Store personalAccount in a way that sendTransaction can access it
  if (personalAccount && smartWallet) {
    const walletInstance = typeof smartWallet === 'function' ? smartWallet() : smartWallet;
    if (!walletInstance._personalAccount) {
      walletInstance._personalAccount = personalAccount;
    }
  }
  try {
    const { prepareContractCall } = await import("thirdweb");
    const { getContract } = await import("thirdweb");
    const { sendTransaction } = await import("thirdweb");
    
    // Validate inputs
    if (!tokenAddress || tokenAddress === 'undefined' || !ethers.isAddress(tokenAddress)) {
      throw new Error(`Invalid token address: ${tokenAddress}`);
    }
    if (!spenderAddress || spenderAddress === 'undefined' || !ethers.isAddress(spenderAddress)) {
      throw new Error(`Invalid spender address: ${spenderAddress}`);
    }
    if (!smartWallet) {
      throw new Error('Smart wallet is undefined');
    }
    
    // smartWallet should already be the wallet instance (from getSmartWalletForUser)
    // But handle both cases: function or instance
    const walletInstance = typeof smartWallet === 'function' ? smartWallet() : smartWallet;
    
    // Debug: Log wallet instance structure to understand available methods
    console.log('[approveTokenFromSmartWallet] Wallet instance type:', typeof walletInstance);
    console.log('[approveTokenFromSmartWallet] Wallet instance keys:', Object.keys(walletInstance).slice(0, 20).join(', '));
    console.log('[approveTokenFromSmartWallet] Has send:', typeof walletInstance.send === 'function');
    console.log('[approveTokenFromSmartWallet] Has execute:', typeof walletInstance.execute === 'function');
    console.log('[approveTokenFromSmartWallet] Has sendTransaction:', typeof walletInstance.sendTransaction === 'function');
    console.log('[approveTokenFromSmartWallet] Has getAccount:', typeof walletInstance.getAccount === 'function');
    
    // Thirdweb's sendTransaction needs an account with:
    // 1. An address property (for transaction serialization) 
    // 2. A sendTransaction method (for executing the transaction)
    // Add address property to wallet instance
    if (walletAddress && !walletInstance.address) {
      Object.defineProperty(walletInstance, 'address', {
        value: walletAddress,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
    
    // Use the smart wallet instance directly - it handles UserOperations correctly
    // We add a custom sendTransaction method if it doesn't exist
    if (!walletInstance.sendTransaction || typeof walletInstance.sendTransaction !== 'function') {
      // Create sendTransaction that wraps transactions through the smart wallet's execute() function
      walletInstance.sendTransaction = async (serializableTransaction) => {
        // Wrap transaction to execute through smart wallet's execute() function
        // Required for proper UserOperation execution with paymaster simulation
        try {
          // Get the personal account (admin account) for signing
          const adminAccount = personalAccount || walletInstance._personalAccount || (walletInstance.getAdminAccount ? await walletInstance.getAdminAccount() : null);
          if (!adminAccount) {
            throw new Error('Admin account (personalAccount) not available for signing UserOperation. Make sure personalAccount is passed to sendTransactionFromSmartWallet or approveTokenFromSmartWallet.');
          }
          
          // Get chain from wallet instance or use default
          // Ensure we always have a valid chain object
          let chain = customBaseSepolia; // Default fallback
          if (walletInstance.getChain) {
            try {
              const walletChain = await walletInstance.getChain();
              if (walletChain) {
                chain = walletChain;
              }
            } catch (error) {
              console.warn('[sendTransaction] Failed to get chain from wallet, using default:', error.message);
            }
          }
          
          // Get factory address - always use a factory (default if not set)
          let factoryAddress = process.env.THIRDWEB_FACTORY_ADDRESS;
          if (!factoryAddress || factoryAddress === "0x00000000fC1237824fb747aBDE0CD183d8C90270") {
            // Use Thirdweb's default factory for Base Sepolia
            // Import default factory constants
            const { DEFAULT_ACCOUNT_FACTORY_V0_6 } = await import("thirdweb/wallets/smart");
            factoryAddress = DEFAULT_ACCOUNT_FACTORY_V0_6;
          }
          
          // Get sponsorGas setting (default to true if SPONSOR_GAS env var is set)
          const sponsorGas = process.env.SPONSOR_GAS === "true";
          
          // Use Thirdweb's UserOperation utilities to execute the transaction
          // Import from the PUBLIC API (not internal lib paths)
          const { 
            createUnsignedUserOp, 
            signUserOp, 
            bundleUserOp, 
            waitForUserOpReceipt 
          } = await import("thirdweb/wallets/smart");
          const { getContract, prepareContractCall } = await import("thirdweb");
          
          if (!serializableTransaction) {
            throw new Error('serializableTransaction is undefined');
          }
          
          // Get smart wallet contract
          const accountContract = getContract({
            address: walletAddress || walletInstance.address,
            chain: chain,
            client,
          });
          
          // Wrap transaction to call smart wallet's execute(to, value, data) function
          // This is required because createUnsignedUserOp expects a wrapped transaction
          let value = serializableTransaction.value || 0n;
          if (typeof value === 'string') {
            value = BigInt(value);
          }
          
          const executeTx = prepareContractCall({
            contract: accountContract,
            method: "function execute(address, uint256, bytes)",
            params: [
              serializableTransaction.to || "",
              value,
              serializableTransaction.data || "0x"
            ],
          });
          
          // Validate executeTx has required properties
          if (!executeTx.chain) {
            throw new Error('executeTx.chain is undefined. Chain object is required.');
          }
          if (!executeTx.client) {
            throw new Error('executeTx.client is undefined. Client is required.');
          }
          
          // Get factory contract (required for createUnsignedUserOp)
          const factoryContract = getContract({
            address: factoryAddress,
            chain: chain,
            client,
          });
          
          // Check if wallet is deployed and handle deployment if needed
          const { isSmartWalletDeployed: checkDeployed } = await import('./thirdwebWallet.js');
          let walletIsDeployed = await checkDeployed(walletAddress || walletInstance.address);
          let useSponsorGas = sponsorGas;
          
          if (!walletIsDeployed) {
            console.log('[sendTransaction] Wallet not deployed. Funding and deploying...');
            const { fundWalletForDeployment, deployWalletExplicitly } = await import('./thirdwebWallet.js');
            try {
              // Fund wallet with ETH from relayer
              await fundWalletForDeployment(walletAddress || walletInstance.address, '0.001');
              
              // Deploy wallet via factory (relayer pays gas)
              await deployWalletExplicitly(walletAddress || walletInstance.address, adminAccount.address);
              
              // Wait for deployment confirmation
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Verify deployment
              const { isSmartWalletDeployed: verifyDeployed } = await import('./thirdwebWallet.js');
              walletIsDeployed = await verifyDeployed(walletAddress || walletInstance.address);
              
              if (!walletIsDeployed) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                walletIsDeployed = await verifyDeployed(walletAddress || walletInstance.address);
              }
            } catch (deployError) {
              console.error('[sendTransaction] Failed to deploy wallet:', deployError.message);
              throw new Error(`Failed to deploy wallet: ${deployError.message}`);
            }
          }
          
          // Final deployment check before UserOperation
          walletIsDeployed = await checkDeployed(walletAddress || walletInstance.address);
          
          // Create unsigned UserOperation
          // factoryContract is now always defined (never undefined)
          // Note: If bundler fails, it might be a network issue or Base Sepolia not supported
          // We'll let Thirdweb use its default bundler URL
          console.log(`[sendTransaction] Creating unsigned UserOperation (sponsorGas: ${useSponsorGas}, isDeployed: ${walletIsDeployed})...`);
          const unsignedUserOp = await createUnsignedUserOp({
            accountContract,
            adminAddress: adminAccount.address,
            factoryContract: factoryContract, // Always defined now
            transaction: executeTx,
            sponsorGas: useSponsorGas, // Disabled for undeployed wallets
            isDeployedOverride: walletIsDeployed, // ✅ FIX: Now guaranteed to be accurate
            waitForDeployment: false, // ✅ FIX: Don't wait if already deployed
            overrides: {
              // bundlerUrl: undefined means use default (https://84532.rpc.thirdweb.com/v2)
              // If this fails, it might be network/auth issue
              bundlerUrl: undefined, // Use default bundler
              entrypointAddress: undefined, // Use default entrypoint
            },
          });
          
          // Sign the UserOperation with the admin account
          const signedUserOp = await signUserOp({
            adminAccount,
            chain: chain,
            client,
            userOp: unsignedUserOp,
          });
          
          // Send the UserOperation to the bundler
          const bundlerOptions = {
            chain: chain || customBaseSepolia,
            client,
          };
          
          const userOpHash = await bundleUserOp({
            userOp: signedUserOp,
            options: bundlerOptions,
          });
          
          // Wait for the UserOperation to be mined and get the transaction receipt
          const receipt = await waitForUserOpReceipt({
            chain: chain || customBaseSepolia,
            client,
            userOpHash,
          });
          
          // Return the transaction hash
      return {
            transactionHash: receipt.transactionHash,
          };
        } catch (execError) {
          console.error('[sendTransaction] Error executing UserOperation:', execError.message);
          console.error('[sendTransaction] Error stack:', execError.stack?.substring(0, 1000));
          
          // Provide more helpful error messages for common issues
          let errorMessage = execError.message;
          if (errorMessage.includes('fetch failed')) {
            errorMessage = `Network error connecting to Thirdweb bundler. This could be due to:
- Network connectivity issues
- Thirdweb bundler not available for Base Sepolia
- Firewall blocking the request
- Invalid THIRDWEB_CLIENT_ID

Original error: ${execError.message}`;
          }
          
          throw new Error(`Failed to execute UserOperation: ${errorMessage}`);
        }
      };
    }
    
    // ERC20 ABI - explicitly provide approve function
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
    
    // Get token contract instance with explicit ABI
        const tokenContract = getContract({
          client,
          chain: customBaseSepolia, // Use custom chain with our RPC URL
          address: tokenAddress,
          abi: erc20Abi,
        });

    // Prepare approve call
    const transaction = prepareContractCall({
      contract: tokenContract,
      method: "approve",
      params: [spenderAddress, amount],
    });

    // Send transaction from smart wallet
    console.log('[approveTokenFromSmartWallet] Approving token spending...');
    console.log('[approveTokenFromSmartWallet] Token:', tokenAddress);
    console.log('[approveTokenFromSmartWallet] Spender:', spenderAddress);
    console.log('[approveTokenFromSmartWallet] Amount:', amount.toString());
    
    // ✅ CRITICAL FIX: Use the smart wallet instance directly as the account
    // The smart wallet instance has a built-in sendTransaction method that properly
    // wraps transactions with prepareExecute to call the smart wallet's execute() function
    // We need to ensure the wallet instance has an address property
    if (walletAddress && !walletInstance.address) {
      Object.defineProperty(walletInstance, 'address', {
        value: walletAddress,
        writable: false,
        enumerable: true,
        configurable: false
      });
    }
    
    // Use the smart wallet instance directly - it handles UserOperations correctly
    const result = await sendTransaction({
      transaction,
      account: walletInstance, // Use wallet instance directly, not extracted account
    });

    console.log('[approveTokenFromSmartWallet] Approval transaction sent:', result.transactionHash);
    return result.transactionHash;
  } catch (error) {
    // Handle BigInt serialization errors in error messages
    let errorMessage = error.message || String(error);
    if (errorMessage.includes('BigInt') || errorMessage.includes('serialize')) {
      console.error('Error approving token from smart wallet (BigInt serialization issue):', errorMessage);
      // Try to extract more info without serializing
      console.error('Error type:', error.constructor?.name);
      console.error('Error stack:', error.stack?.substring(0, 500));
    } else {
      console.error('Error approving token from smart wallet:', errorMessage);
    }
    throw error;
  }
};

/**
 * Register username in UsernameRegistry
 */
export const registerUsernameInRegistry = async (username, walletAddress, feePayer = null) => {
  try {
    const relayer = await getRelayerAccount();
    const { CONTRACTS, BASE_RPC, TOKENS } = await import('./config.js');
    
    // Validate addresses
    if (!CONTRACTS.USERNAME_REGISTRY || CONTRACTS.USERNAME_REGISTRY === '') {
      throw new Error('USERNAME_REGISTRY address is not configured');
    }
    if (!BASE_RPC || BASE_RPC === '') {
      throw new Error('BASE_RPC URL is not configured');
    }
    
    console.log('[registerUsernameInRegistry] Using USERNAME_REGISTRY:', CONTRACTS.USERNAME_REGISTRY);
    console.log('[registerUsernameInRegistry] Using BASE_RPC:', BASE_RPC);
    
    // Create provider for read operations
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    // Use the centralized contract service for consistency
    const { getUsernameRegistry } = await import('./contracts.js');
    const registry = getUsernameRegistry();

    // Check if already registered (use getAddress for consistency)
    const existingAddress = await registry.getAddress(username.toLowerCase());
    if (existingAddress && existingAddress.toLowerCase() === walletAddress.toLowerCase()) {
      return { alreadyRegistered: true, txHash: null };
    }

    // Get registration fee from contract (for test phase, should be 0)
    let registrationFee = 0n;
    try {
      registrationFee = await registry.registrationFee();
    } catch (error) {
      console.log('[registerUsernameInRegistry] Could not read registrationFee, assuming 0:', error.message);
      registrationFee = 0n;
    }
    
    // Determine feePayer (only needed if fee > 0, otherwise can be zero address)
    let payer = ethers.ZeroAddress; // Default to zero address (no fee)
    
    if (registrationFee > 0) {
      // Fee is required - use feePayer if provided, otherwise use relayer
      payer = feePayer || relayer.address;
      
      // If relayer is paying, ensure they have USDC and approval
      if (payer.toLowerCase() === relayer.address.toLowerCase()) {
        const usdc = new ethers.Contract(
          TOKENS.USDC.address,
          [
            'function balanceOf(address) view returns (uint256)',
            'function approve(address, uint256) returns (bool)',
            'function allowance(address, address) view returns (uint256)'
          ],
          relayer
        );
        
        const balance = await usdc.balanceOf(relayer.address);
        const allowance = await usdc.allowance(relayer.address, CONTRACTS.USERNAME_REGISTRY);
        
        if (balance < registrationFee) {
          throw new Error('Relayer does not have enough USDC to pay registration fee');
        }
        
        if (allowance < registrationFee) {
          console.log('Approving USDC for registration fee...');
          const approveTx = await usdc.approve(CONTRACTS.USERNAME_REGISTRY, registrationFee * 10n);
          await approveTx.wait();
        }
      }
    } else {
      // No fee required (test phase) - relayer only needs to submit transaction
      console.log('No registration fee required (test phase)');
    }

    // Connect relayer for write operations (relayer pays gas, but no USDC fee if fee is 0)
    const registryWithSigner = registry.connect(relayer);
    const tx = await registryWithSigner.registerUsernameForAddress(
      username.toLowerCase(),
      walletAddress,
      payer
    );
    const receipt = await tx.wait();

    return {
      txHash: receipt.hash,
      blockNumber: receipt.blockNumber,
      alreadyRegistered: false
    };
  } catch (error) {
    console.error('Error registering username in registry:', error);
    throw error;
  }
};

/**
 * Check if smart wallet is deployed on-chain
 */
export const isSmartWalletDeployed = async (walletAddress) => {
  try {
    const { ethers } = await import('ethers');
    const { BASE_RPC } = await import('./config.js');
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    
    // Check if address has code (means contract is deployed)
    const code = await provider.getCode(walletAddress);
    return code !== '0x' && code !== '0x0';
  } catch (error) {
    console.error('Error checking wallet deployment:', error);
    return false;
  }
};

/**
 * Fund wallet with ETH from relayer for deployment
 * This allows the wallet to pay for its own deployment transaction
 * @param {string} walletAddress - The wallet address to fund
 * @param {string} amount - Amount of ETH to send (default: 0.001 ETH)
 * @returns {Promise<Object>} Transaction hash and funding status
 */
export const fundWalletForDeployment = async (walletAddress, amount = '0.001') => {
  console.log('[fundWalletForDeployment] === START ===');
  console.log('[fundWalletForDeployment] Inputs:', { walletAddress, amount });
  
  try {
    const relayer = await getRelayerAccount();
    const { BASE_RPC } = await import('./config.js');
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    
    // Check relayer balance
    const relayerBalance = await provider.getBalance(relayer.address);
    const amountWei = ethers.parseEther(amount);
    
    console.log('[fundWalletForDeployment] Relayer balance:', ethers.formatEther(relayerBalance), 'ETH');
    console.log('[fundWalletForDeployment] Amount to send:', amount, 'ETH');
    
    if (relayerBalance < amountWei) {
      throw new Error(`Relayer has insufficient balance. Need ${amount} ETH, have ${ethers.formatEther(relayerBalance)} ETH`);
    }
    
    // Check if wallet already has balance
    const walletBalance = await provider.getBalance(walletAddress);
    console.log('[fundWalletForDeployment] Wallet balance:', ethers.formatEther(walletBalance), 'ETH');
    
    if (walletBalance >= amountWei) {
      console.log('[fundWalletForDeployment] Wallet already has sufficient balance');
      console.log('[fundWalletForDeployment] === SUCCESS (Already Funded) ===');
      return { alreadyFunded: true, txHash: null, balance: ethers.formatEther(walletBalance) };
    }
    
    // Send ETH from relayer to wallet
    console.log(`[fundWalletForDeployment] Sending ${amount} ETH from relayer to wallet ${walletAddress}...`);
    const tx = await relayer.sendTransaction({
      to: walletAddress,
      value: amountWei,
    });
    
    console.log('[fundWalletForDeployment] Transaction sent. Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`[fundWalletForDeployment] Wallet funded. Tx: ${receipt.hash}`);
    
    // Verify the funding
    const newBalance = await provider.getBalance(walletAddress);
    console.log('[fundWalletForDeployment] New wallet balance:', ethers.formatEther(newBalance), 'ETH');
    
    console.log('[fundWalletForDeployment] === SUCCESS ===');
    return {
      txHash: receipt.hash,
      amount: amount,
      alreadyFunded: false,
      balance: ethers.formatEther(newBalance)
    };
  } catch (error) {
    console.error('[fundWalletForDeployment-ERROR] ========== ERROR OCCURRED ==========');
    console.error('[fundWalletForDeployment-ERROR] Error type:', error.constructor.name);
    console.error('[fundWalletForDeployment-ERROR] Error message:', error.message);
    console.error('[fundWalletForDeployment-ERROR] Error code:', error.code);
    console.error('[fundWalletForDeployment-ERROR] Context:');
    console.error('[fundWalletForDeployment-ERROR] - Wallet Address:', walletAddress);
    console.error('[fundWalletForDeployment-ERROR] - Amount:', amount);
    console.error('[fundWalletForDeployment-ERROR] Error stack:', error.stack?.substring(0, 1000));
    throw error;
  }
};

/**
 * Deploy wallet explicitly by calling the factory contract directly via relayer
 * This bypasses the bundler simulation issue for undeployed wallets
 * The relayer pays for the deployment transaction
 * @param {string} walletAddress - Wallet address
 * @param {string} adminAddress - Admin address (personal account)
 * @returns {Promise<string|Object>} Deployment transaction hash or {alreadyDeployed: true}
 */
export const deployWalletExplicitly = async (walletAddress, adminAddress) => {
  console.log('[deployWalletExplicitly] === START ===');
  console.log('[deployWalletExplicitly] Wallet address:', walletAddress);
  console.log('[deployWalletExplicitly] Admin address:', adminAddress);
  
  try {
    const relayer = await getRelayerAccount();
    const { BASE_RPC } = await import('./config.js');
    const provider = new ethers.JsonRpcProvider(BASE_RPC);
    
    // Get factory address
    let factoryAddress = process.env.THIRDWEB_FACTORY_ADDRESS;
    if (!factoryAddress || factoryAddress === "0x00000000fC1237824fb747aBDE0CD183d8C90270") {
      const { DEFAULT_ACCOUNT_FACTORY_V0_6 } = await import("thirdweb/wallets/smart");
      factoryAddress = DEFAULT_ACCOUNT_FACTORY_V0_6;
    }
    
    console.log('[deployWalletExplicitly] Factory address:', factoryAddress);
    
    // Check if wallet is already deployed
    const isDeployed = await isSmartWalletDeployed(walletAddress);
    if (isDeployed) {
      console.log('[deployWalletExplicitly] Wallet already deployed');
      console.log('[deployWalletExplicitly] === SUCCESS (Already Deployed) ===');
      return { alreadyDeployed: true, txHash: null };
    }
    
    // Create factory contract instance with relayer as signer
    // Thirdweb factory uses: createAccount(address admin, bytes salt) returns (address)
    // Note: salt is bytes, not bytes32
    const factoryAbi = [
      "function createAccount(address admin, bytes salt) returns (address)",
      "function getAddress(address admin, bytes salt) view returns (address)"
    ];
    
    const factory = new ethers.Contract(factoryAddress, factoryAbi, relayer);
    
    // Calculate salt (use empty bytes for deterministic deployment)
    // The wallet address should already match what we expect
    // Thirdweb uses empty bytes (0x) for default salt
    const salt = "0x"; // Empty bytes for default salt
    
    // Deploy wallet by calling factory.createAccount
    // Relayer pays for this transaction
    console.log('[deployWalletExplicitly] Deploying wallet via factory (relayer pays gas)...');
    console.log('[deployWalletExplicitly] Admin:', adminAddress);
    console.log('[deployWalletExplicitly] Salt:', salt);
    const tx = await factory.createAccount(adminAddress, salt);
    
    console.log('[deployWalletExplicitly] Transaction sent. Waiting for confirmation...');
    const receipt = await tx.wait();
    
    console.log('[deployWalletExplicitly] Wallet deployed! Tx:', receipt.hash);
    console.log('[deployWalletExplicitly] === SUCCESS ===');
    
    return receipt.hash;
  } catch (error) {
    console.error('[deployWalletExplicitly-ERROR] ========== ERROR OCCURRED ==========');
    console.error('[deployWalletExplicitly-ERROR] Error type:', error.constructor.name);
    console.error('[deployWalletExplicitly-ERROR] Error message:', error.message);
    console.error('[deployWalletExplicitly-ERROR] Error code:', error.code);
    console.error('[deployWalletExplicitly-ERROR] Context:');
    console.error('[deployWalletExplicitly-ERROR] - Wallet Address:', walletAddress);
    console.error('[deployWalletExplicitly-ERROR] - Admin Address:', adminAddress);
    console.error('[deployWalletExplicitly-ERROR] Error stack:', error.stack?.substring(0, 1000));
    throw error;
  }
};

/**
 * Get relayer account for sponsoring transactions
 */
export { getRelayerAccount };
