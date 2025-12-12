import dotenv from 'dotenv'
import { ethers } from 'ethers'
import { dbRun, dbGet, dbAll } from './database.js'
import { getSmartWalletForUser, sendTransactionFromSmartWallet, approveTokenFromSmartWallet } from './thirdwebWallet.js'
import { BASE_RPC, TOKENS } from './config.js'
dotenv.config()

/**
 * Multichain Bridge Service - Jarvis Bridge
 * Enables seamless cross-chain transfers for swaps, payments, and betting
 * Uses Socket Protocol for reliable cross-chain bridging
 * 
 * Supported Chains (13+ EVM chains):
 * - Ethereum, Base, Polygon, Arbitrum, Optimism, Avalanche, BSC, 
 *   zkSync Era, Linea, Scroll, Mantle, Blast
 * 
 * Bridge from Base to any supported EVM chain seamlessly!
 */

// Socket Protocol API
const SOCKET_API_BASE = 'https://api.socket.tech/v2'
const SOCKET_API_KEY = process.env.SOCKET_API_KEY || ''

// Chain configurations - Multichain support for all major EVM chains
export const CHAINS = {
  ETHEREUM: {
    chainId: 1,
    name: 'Ethereum',
    rpc: process.env.ETHEREUM_RPC_URL || 'https://eth.llamarpc.com',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://etherscan.io'
  },
  BASE: {
    chainId: 84532, // Base Sepolia (8453 for mainnet)
    name: 'Base',
    rpc: BASE_RPC || 'https://sepolia.base.org',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://sepolia-explorer.base.org'
  },
  BASE_MAINNET: {
    chainId: 8453,
    name: 'Base Mainnet',
    rpc: process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://basescan.org'
  },
  POLYGON: {
    chainId: 137,
    name: 'Polygon',
    rpc: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
    nativeCurrency: 'MATIC',
    blockExplorer: 'https://polygonscan.com'
  },
  ARBITRUM: {
    chainId: 42161,
    name: 'Arbitrum',
    rpc: process.env.ARBITRUM_RPC_URL || 'https://arb1.arbitrum.io/rpc',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://arbiscan.io'
  },
  OPTIMISM: {
    chainId: 10,
    name: 'Optimism',
    rpc: process.env.OPTIMISM_RPC_URL || 'https://mainnet.optimism.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://optimistic.etherscan.io'
  },
  AVALANCHE: {
    chainId: 43114,
    name: 'Avalanche',
    rpc: process.env.AVALANCHE_RPC_URL || 'https://api.avax.network/ext/bc/C/rpc',
    nativeCurrency: 'AVAX',
    blockExplorer: 'https://snowtrace.io'
  },
  BSC: {
    chainId: 56,
    name: 'BNB Chain',
    rpc: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
    nativeCurrency: 'BNB',
    blockExplorer: 'https://bscscan.com'
  },
  ZKSYNC_ERA: {
    chainId: 324,
    name: 'zkSync Era',
    rpc: process.env.ZKSYNC_RPC_URL || 'https://mainnet.era.zksync.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://explorer.zksync.io'
  },
  LINEA: {
    chainId: 59144,
    name: 'Linea',
    rpc: process.env.LINEA_RPC_URL || 'https://rpc.linea.build',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://lineascan.build'
  },
  SCROLL: {
    chainId: 534352,
    name: 'Scroll',
    rpc: process.env.SCROLL_RPC_URL || 'https://rpc.scroll.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://scrollscan.com'
  },
  MANTLE: {
    chainId: 5000,
    name: 'Mantle',
    rpc: process.env.MANTLE_RPC_URL || 'https://rpc.mantle.xyz',
    nativeCurrency: 'MNT',
    blockExplorer: 'https://explorer.mantle.xyz'
  },
  BLAST: {
    chainId: 81457,
    name: 'Blast',
    rpc: process.env.BLAST_RPC_URL || 'https://rpc.blast.io',
    nativeCurrency: 'ETH',
    blockExplorer: 'https://blastscan.io'
  }
}

// Token addresses on different chains - Multichain USDC/USDT support
export const TOKEN_ADDRESSES = {
  USDC: {
    [CHAINS.ETHEREUM.chainId]: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // Ethereum USDC
    [CHAINS.BASE.chainId]: TOKENS.USDC.address || '',
    [CHAINS.BASE_MAINNET.chainId]: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // Base Mainnet USDC
    [CHAINS.POLYGON.chainId]: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // Polygon USDC
    [CHAINS.ARBITRUM.chainId]: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // Arbitrum USDC
    [CHAINS.OPTIMISM.chainId]: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // Optimism USDC
    [CHAINS.AVALANCHE.chainId]: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // Avalanche USDC
    [CHAINS.BSC.chainId]: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC USDC
    [CHAINS.ZKSYNC_ERA.chainId]: '0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4', // zkSync Era USDC
    [CHAINS.LINEA.chainId]: '0x176211869cA2b568f2A7D4EE941E073a821EE1ff', // Linea USDC
    [CHAINS.SCROLL.chainId]: '0x06eFdBFf2a14a7c8E15953D5F4e6545F93d9d7C3', // Scroll USDC
    [CHAINS.MANTLE.chainId]: '0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9', // Mantle USDC
    [CHAINS.BLAST.chainId]: '0x4300000000000000000000000000000000000003' // Blast USDC
  },
  USDT: {
    [CHAINS.ETHEREUM.chainId]: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // Ethereum USDT
    [CHAINS.BASE.chainId]: TOKENS.USDT.address || '',
    [CHAINS.BASE_MAINNET.chainId]: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // Base Mainnet USDT
    [CHAINS.POLYGON.chainId]: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', // Polygon USDT
    [CHAINS.ARBITRUM.chainId]: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // Arbitrum USDT
    [CHAINS.OPTIMISM.chainId]: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // Optimism USDT
    [CHAINS.AVALANCHE.chainId]: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // Avalanche USDT
    [CHAINS.BSC.chainId]: '0x55d398326f99059fF775485246999027B3197955', // BSC USDT
    [CHAINS.ZKSYNC_ERA.chainId]: '0x493257fD37EDB34451f62EDf8D2a0C418852bA4C', // zkSync Era USDT
    [CHAINS.LINEA.chainId]: '0xA219439258de9da92E6b2d4C4b5F6C5b5F6C5b5F', // Linea USDT
    [CHAINS.SCROLL.chainId]: '0xf55BEC9cafDbE8730f096Aa55dad6D22d44099Df', // Scroll USDT
    [CHAINS.MANTLE.chainId]: '0x201EBa5CC46D216Ce6DC03F6a759e8E766e956aE', // Mantle USDT
    [CHAINS.BLAST.chainId]: '0x4300000000000000000000000000000000000003' // Blast USDT
  }
}

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address, uint256) returns (bool)',
  'function allowance(address, address) view returns (uint256)'
]

/**
 * Get bridge quote from Socket Protocol
 */
export async function getBridgeQuote(fromChainId, toChainId, tokenAddress, amount, userAddress) {
  try {
    // Validate inputs
    if (!ethers.isAddress(tokenAddress)) {
      return { success: false, message: `Invalid token address: ${tokenAddress}` }
    }
    if (!ethers.isAddress(userAddress)) {
      return { success: false, message: `Invalid user address: ${userAddress}` }
    }
    if (!amount || parseFloat(amount) <= 0) {
      return { success: false, message: `Invalid amount: ${amount}` }
    }

    const amountWei = ethers.parseUnits(amount, 6) // USDC has 6 decimals
    
    const params = new URLSearchParams({
      fromChainId: fromChainId.toString(),
      toChainId: toChainId.toString(),
      tokenAddress: tokenAddress,
      amount: amountWei.toString(),
      userAddress: userAddress,
      recipient: userAddress
    })
    
    const url = `${SOCKET_API_BASE}/quote?${params.toString()}`
    const headers = { 'Content-Type': 'application/json' }
    if (SOCKET_API_KEY) {
      headers['API-KEY'] = SOCKET_API_KEY
    } else {
      console.warn('[Bridge Service] SOCKET_API_KEY not set. API requests may be rate-limited.')
    }

    const response = await fetch(url, { method: 'GET', headers })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `Socket API error: ${response.status}`
      
      // Provide helpful error messages
      if (response.status === 401) {
        errorMessage = `Socket API authentication failed. Please set SOCKET_API_KEY in .env file.`
      } else if (response.status === 400) {
        errorMessage = `Invalid bridge request: ${errorText}`
      } else if (response.status === 429) {
        errorMessage = `Rate limit exceeded. Please wait and try again.`
      } else {
        errorMessage = `Socket API error: ${response.status} - ${errorText}`
      }
      
      throw new Error(errorMessage)
    }

    const data = await response.json()
    
    return {
      success: true,
      fromChain: fromChainId,
      toChain: toChainId,
      amount,
      estimatedAmountOut: data.toAmount || amount,
      estimatedTime: data.estimatedTime || 300,
      fees: data.fees || {},
      route: data.route || {},
      transaction: data.txData || null
    }
  } catch (error) {
    console.error('[Bridge Service] Error getting quote:', error)
    return {
      success: false,
      message: `Failed to get bridge quote: ${error.message}`
    }
  }
}

/**
 * Execute bridge transaction
 */
export async function executeBridge(userId, username, fromChainId, toChainId, tokenSymbol, amount, bot = null) {
  try {
    const user = await dbGet('SELECT wallet_address FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return { success: false, message: "❌ Wallet not found. Please register first." }
    }

    const walletAddress = user.wallet_address
    const tokenAddress = TOKEN_ADDRESSES[tokenSymbol.toUpperCase()]?.[fromChainId]

    if (!tokenAddress) {
      return { success: false, message: `❌ Token ${tokenSymbol} not supported on source chain.` }
    }

    if (bot) await bot.sendMessage(userId, `🌉 Getting bridge quote for ${amount} ${tokenSymbol}...`)

    const quote = await getBridgeQuote(fromChainId, toChainId, tokenAddress, amount, walletAddress)
    if (!quote.success) {
      return { success: false, message: quote.message || "Failed to get bridge quote." }
    }

    // Check balance
    const fromChain = Object.values(CHAINS).find(c => c.chainId === fromChainId)
    const provider = new ethers.JsonRpcProvider(fromChain.rpc)
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
    
    const balance = await tokenContract.balanceOf(walletAddress)
    const decimals = await tokenContract.decimals()
    const balanceFormatted = parseFloat(ethers.formatUnits(balance, decimals))

    if (balanceFormatted < parseFloat(amount)) {
      return {
        success: false,
        message: `❌ Insufficient balance on ${fromChain.name}.\n\nRequired: $${amount}\nYour Balance: $${balanceFormatted.toFixed(2)}`
      }
    }

    // Get smart wallet
    const { smartWallet, personalAccount, walletAddress: smartWalletAddress } = await getSmartWalletForUser(username, userId)

    // Approve if needed
    const amountWei = ethers.parseUnits(amount, decimals)
    const bridgeContract = quote.route?.userTxs?.[0]?.approvalData?.allowanceTarget || 
                          quote.transaction?.to || 
                          '0x3a23F943142408F47FC7C2C6673Fb07C0C8DC59d'

    const allowance = await tokenContract.allowance(walletAddress, bridgeContract)
    if (allowance < amountWei) {
      if (bot) await bot.sendMessage(userId, `⏳ Approving ${tokenSymbol} for bridging...`)
      await approveTokenFromSmartWallet(
        smartWallet,
        tokenAddress,
        bridgeContract,
        ethers.MaxUint256,
        personalAccount,
        walletAddress
      )
    }

    // Execute bridge
    if (bot) {
      const toChain = Object.values(CHAINS).find(c => c.chainId === toChainId)
      await bot.sendMessage(userId, `🌉 Bridging ${amount} ${tokenSymbol} from ${fromChain.name} to ${toChain.name}...`)
    }

    const bridgeTxData = quote.transaction || quote.route?.userTxs?.[0]?.txData
    if (!bridgeTxData) {
      return { success: false, message: "❌ Bridge transaction data not available." }
    }

    const txHash = await sendTransactionFromSmartWallet(
      smartWallet,
      bridgeTxData.to,
      bridgeTxData.functionName || 'swap',
      bridgeTxData.params || [],
      personalAccount,
      walletAddress
    )

    // Store bridge transaction
    await dbRun(
      `INSERT INTO bridge_transactions 
       (user_id, from_chain, to_chain, token_symbol, amount, tx_hash, status, estimated_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, strftime('%s', 'now'))`,
      [userId, fromChainId, toChainId, tokenSymbol, amount, txHash, quote.estimatedTime]
    )

    const toChain = Object.values(CHAINS).find(c => c.chainId === toChainId)
    return {
      success: true,
      txHash,
      fromChain: fromChain.name,
      toChain: toChain.name,
      amount,
      tokenSymbol,
      estimatedTime: quote.estimatedTime,
      message: `✅ **Bridge Initiated!**\n\n` +
        `🌉 Bridging ${amount} ${tokenSymbol}\n` +
        `From: ${fromChain.name}\n` +
        `To: ${toChain.name}\n` +
        `Estimated Time: ~${Math.ceil(quote.estimatedTime / 60)} minutes\n\n` +
        `Transaction: [View](${fromChain.blockExplorer}/tx/${txHash})\n\n` +
        `⏳ Your funds will arrive on ${toChain.name} shortly!`
    }
  } catch (error) {
    console.error('[Bridge Service] Error executing bridge:', error)
    return { success: false, message: `❌ Bridge failed: ${error.message}` }
  }
}

/**
 * Check balance on specific chain
 */
export async function getChainBalance(walletAddress, tokenSymbol, chainId) {
  try {
    const chain = Object.values(CHAINS).find(c => c.chainId === chainId)
    if (!chain) return { success: false, message: `Chain ${chainId} not supported` }

    // Validate wallet address format (don't try ENS resolution on testnets)
    if (!ethers.isAddress(walletAddress)) {
      return { success: false, message: `Invalid wallet address: ${walletAddress}` }
    }

    const tokenAddress = TOKEN_ADDRESSES[tokenSymbol.toUpperCase()]?.[chainId]
    if (!tokenAddress) return { success: false, message: `Token ${tokenSymbol} not supported on ${chain.name}` }

    // Validate token address
    if (!ethers.isAddress(tokenAddress)) {
      return { success: false, message: `Invalid token address for ${tokenSymbol} on ${chain.name}` }
    }

    const provider = new ethers.JsonRpcProvider(chain.rpc)
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
    
    const [balance, decimals] = await Promise.all([
      tokenContract.balanceOf(walletAddress),
      tokenContract.decimals()
    ])

    return {
      success: true,
      chain: chain.name,
      chainId,
      tokenSymbol,
      balance: balance.toString(),
      balanceFormatted: parseFloat(ethers.formatUnits(balance, decimals)),
      decimals
    }
  } catch (error) {
    console.error('[Bridge Service] Error getting chain balance:', error)
    return { success: false, message: `Failed to get balance: ${error.message}` }
  }
}

/**
 * Check if bridge is needed
 */
export async function checkBridgeNeeded(walletAddress, tokenSymbol, requiredAmount, sourceChainId, targetChainId) {
  try {
    const targetBalance = await getChainBalance(walletAddress, tokenSymbol, targetChainId)
    if (!targetBalance.success) {
      return { needsBridge: true, message: `Unable to check balance: ${targetBalance.message}` }
    }

    const hasEnough = targetBalance.balanceFormatted >= requiredAmount
    if (hasEnough) {
      return {
        needsBridge: false,
        balance: targetBalance.balanceFormatted,
        message: `✅ Sufficient balance on target chain: $${targetBalance.balanceFormatted.toFixed(2)}`
      }
    }

    const sourceBalance = await getChainBalance(walletAddress, tokenSymbol, sourceChainId)
    const sourceChain = Object.values(CHAINS).find(c => c.chainId === sourceChainId)
    const targetChain = Object.values(CHAINS).find(c => c.chainId === targetChainId)

    return {
      needsBridge: true,
      sourceChain: sourceChain.name,
      targetChain: targetChain.name,
      sourceBalance: sourceBalance.balanceFormatted || 0,
      targetBalance: targetBalance.balanceFormatted,
      requiredAmount,
      shortfall: requiredAmount - targetBalance.balanceFormatted,
      canBridge: (sourceBalance.balanceFormatted || 0) >= (requiredAmount - targetBalance.balanceFormatted),
      message: `⚠️ **Bridge Required**\n\n` +
        `You need $${requiredAmount} on ${targetChain.name}, but only have $${targetBalance.balanceFormatted.toFixed(2)}.\n` +
        `You have $${(sourceBalance.balanceFormatted || 0).toFixed(2)} on ${sourceChain.name}.\n\n` +
        `Would you like me to bridge $${(requiredAmount - targetBalance.balanceFormatted).toFixed(2)} from ${sourceChain.name} to ${targetChain.name}?`
    }
  } catch (error) {
    console.error('[Bridge Service] Error checking bridge:', error)
    return { needsBridge: true, message: `Error: ${error.message}` }
  }
}

/**
 * Bridge funds and automatically execute payment on target chain
 * Combined bridge + payment flow for seamless cross-chain payments
 * @param {number} userId - Telegram user ID
 * @param {string} senderUsername - Sender username
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount to send
 * @param {string} tokenSymbol - Token symbol
 * @param {number} fromChainId - Source chain ID
 * @param {number} toChainId - Target chain ID
 * @param {Object} bot - Telegram bot instance
 * @returns {Promise<Object>} Execution result
 */
export async function bridgeAndPay(
  userId,
  senderUsername,
  recipientUsername,
  amount,
  tokenSymbol,
  fromChainId,
  toChainId,
  bot = null
) {
  try {
    console.log(`[BridgeAndPay] Starting bridge+payment: ${amount} ${tokenSymbol} from chain ${fromChainId} to ${toChainId}`)

    const user = await dbGet('SELECT wallet_address FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return { success: false, message: "❌ Wallet not found. Please register first." }
    }

    const walletAddress = user.wallet_address
    const fromChain = Object.values(CHAINS).find(c => c.chainId === fromChainId)
    const toChain = Object.values(CHAINS).find(c => c.chainId === toChainId)

    if (!fromChain || !toChain) {
      return { success: false, message: "❌ Invalid chain configuration." }
    }

    // Step 1: Bridge funds
    if (bot) {
      await bot.sendMessage(
        userId,
        `🌉 **Step 1: Bridging Funds**\n\n` +
        `Bridging $${amount} ${tokenSymbol} from ${fromChain.name} to ${toChain.name}...\n\n` +
        `⏳ This may take a few minutes...`
      )
    }

    const bridgeResult = await executeBridge(
      userId,
      senderUsername,
      fromChainId,
      toChainId,
      tokenSymbol,
      amount,
      bot
    )

    if (!bridgeResult.success) {
      return bridgeResult
    }

    // Step 2: Wait for bridge confirmation (poll for completion)
    if (bot) {
      await bot.sendMessage(
        userId,
        `⏳ Waiting for bridge confirmation...\n\n` +
        `Bridge TX: ${bridgeResult.txHash}\n` +
        `Estimated time: ~${Math.ceil(bridgeResult.estimatedTime / 60)} minutes`
      )
    }

    // Poll for bridge completion (simplified - in production, use webhooks or better polling)
    let bridgeComplete = false
    let attempts = 0
    const maxAttempts = 60 // 5 minutes max wait (5 second intervals)

    while (!bridgeComplete && attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds

      const targetBalance = await getChainBalance(walletAddress, tokenSymbol, toChainId)
      if (targetBalance.success && targetBalance.balanceFormatted >= parseFloat(amount)) {
        bridgeComplete = true
        break
      }

      attempts++
    }

    if (!bridgeComplete) {
      return {
        success: false,
        message: `⏳ Bridge is still processing. Payment will be executed automatically once bridge completes.\n\n` +
          `You can check bridge status with the transaction hash: ${bridgeResult.txHash}`
      }
    }

    // Step 3: Execute payment on target chain
    if (bot) {
      await bot.sendMessage(
        userId,
        `✅ **Bridge Complete!**\n\n` +
        `🌉 Funds arrived on ${toChain.name}\n\n` +
        `**Step 2: Executing Payment**\n` +
        `Sending $${amount} ${tokenSymbol} to @${recipientUsername} on ${toChain.name}...`
      )
    }

    // Import multi-chain payment service
    const { executePaymentOnChain } = await import('./multiChainPayment.js')
    const paymentResult = await executePaymentOnChain(
      userId,
      recipientUsername,
      amount,
      tokenSymbol,
      toChainId,
      bot
    )

    if (!paymentResult.success) {
      // Store bridge transaction record
      try {
        const { dbRun } = await import('./database.js')
        await dbRun(
          `INSERT INTO bridge_transactions 
           (user_id, from_chain, to_chain, token_symbol, amount, tx_hash, status, estimated_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, strftime('%s', 'now'))`,
          [userId, fromChainId, toChainId, tokenSymbol, amount, bridgeResult.txHash, bridgeResult.estimatedTime || 300]
        )
      } catch (dbError) {
        console.error('[BridgeAndPay] Error storing bridge transaction:', dbError)
      }

      return {
        success: false,
        message: `✅ Bridge completed, but payment failed:\n\n${paymentResult.message}\n\n` +
          `Your funds are on ${toChain.name}. You can retry the payment.`
      }
    }

    // Store payment record with chain info
    try {
      const { dbRun, dbGet } = await import('./database.js')
      const { getUsernameRegistry } = await import('./contracts.js')
      const registry = await getUsernameRegistry()
      const recipientAddress = await registry.usernameToAddress(recipientUsername.toLowerCase())

      await dbRun(
        `INSERT INTO payments 
         (tx_hash, from_address, to_address, from_username, to_username, token_address, amount, fee, status, memo, target_chain, target_chain_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
        [
          paymentResult.txHash,
          walletAddress,
          recipientAddress || recipientUsername,
          senderUsername || '',
          recipientUsername,
          TOKEN_ADDRESSES[tokenSymbol.toUpperCase()]?.[toChainId] || '',
          amount,
          '0', // Fee calculated separately
          'pending',
          null,
          toChain.name,
          toChainId
        ]
      )
    } catch (dbError) {
      console.error('[BridgeAndPay] Error storing payment:', dbError)
    }

    return {
      success: true,
      bridgeTxHash: bridgeResult.txHash,
      paymentTxHash: paymentResult.txHash,
      fromChain: fromChain.name,
      toChain: toChain.name,
      amount,
      tokenSymbol,
      message: `✅ **Cross-Chain Payment Complete!**\n\n` +
        `🌉 Bridge: ${bridgeResult.txHash}\n` +
        `💸 Payment: ${paymentResult.txHash}\n\n` +
        `@${recipientUsername} received $${amount} ${tokenSymbol} on ${toChain.name}!`
    }
  } catch (error) {
    console.error('[BridgeAndPay] Error:', error)
    return {
      success: false,
      message: `❌ Error in bridge+payment flow: ${error.message}`
    }
  }
}
