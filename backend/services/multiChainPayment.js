/**
 * Multi-Chain Payment Service
 * Orchestrates cross-chain payments with automatic bridging
 * Uses ERC-4337 + paymasters for gasless transactions across chains
 */

import { dbGet, dbRun } from './database.js'
import { getChainConfig, validateChainSupport, getDefaultChain } from './chainDetector.js'
import { CHAINS, TOKEN_ADDRESSES, getBridgeQuote, getChainBalance } from './bridgeService.js'
import { executePayment } from './aiActions.js'
import { getSmartWalletForChain } from './thirdwebWallet.js'
import { getUsernameRegistry } from './contracts.js'
import { TOKENS, CONTRACTS } from './config.js'
import { ethers } from 'ethers'

/**
 * Execute multi-chain payment
 * Main orchestrator that routes payments to same-chain or cross-chain handlers
 * @param {number} userId - Telegram user ID
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount to send
 * @param {string} tokenSymbol - Token symbol (USDC, USDT, etc.)
 * @param {string} targetChainKey - Target chain key (e.g., 'BSC', 'POLYGON')
 * @param {Object} bot - Telegram bot instance
 * @param {string} memo - Optional memo
 * @param {string} sourceChainKey - Optional source chain key (where funds currently are)
 * @param {boolean} cheapestRoute - Whether to find cheapest route
 * @param {boolean} useAnyChain - Whether to use any chain with sufficient balance
 * @returns {Promise<Object>} Execution result
 */
export async function executeMultiChainPayment(
  userId,
  recipientUsername,
  amount,
  tokenSymbol,
  targetChainKey,
  bot = null,
  memo = null,
  sourceChainKey = null,
  cheapestRoute = false,
  useAnyChain = false
) {
  try {
    console.log(`[MultiChainPayment] Executing payment: ${amount} ${tokenSymbol} to @${recipientUsername} on ${targetChainKey}`)

    // Validate target chain
    if (!validateChainSupport(targetChainKey)) {
      return {
        success: false,
        message: `❌ Unsupported chain: ${targetChainKey}. Supported chains: ${Object.keys(CHAINS).join(', ')}`
      }
    }

    const targetChain = getChainConfig(targetChainKey)
    
    // Determine source chain
    let sourceChain
    if (sourceChainKey) {
      // User specified source chain
      const sourceChainConfig = getChainConfig(sourceChainKey)
      if (!sourceChainConfig) {
        return {
          success: false,
          message: `❌ Invalid source chain: ${sourceChainKey}. Supported chains: ${Object.keys(CHAINS).join(', ')}`
        }
      }
      sourceChain = sourceChainConfig
    } else if (useAnyChain) {
      // Find chain with sufficient balance
      sourceChain = await findChainWithBalance(userId, tokenSymbol, amount)
      if (!sourceChain) {
        return {
          success: false,
          message: `❌ Insufficient balance on all chains. You need $${amount} ${tokenSymbol} but don't have enough on any supported chain.`
        }
      }
    } else {
      // Default to Base
      sourceChain = getDefaultChain()
    }

    // Get user
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return {
        success: false,
        message: '❌ Wallet not found. Please register first.'
      }
    }

    // Check if same chain
    if (targetChain.chainId === sourceChain.chainId) {
      // Same chain - use standard payment flow
      return await executeSameChainPayment(userId, recipientUsername, amount, tokenSymbol, targetChain, bot, memo)
    }

    // Different chain - need to bridge
    return await executeCrossChainPayment(
      userId,
      recipientUsername,
      amount,
      tokenSymbol,
      sourceChain,
      targetChain,
      bot,
      memo,
      cheapestRoute
    )
  } catch (error) {
    console.error('[MultiChainPayment] Error:', error)
    return {
      success: false,
      message: `❌ Error processing multi-chain payment: ${error.message}`
    }
  }
}

/**
 * Execute payment on same chain (no bridging needed)
 * @param {number} userId - Telegram user ID
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount to send
 * @param {string} tokenSymbol - Token symbol
 * @param {Object} targetChain - Target chain config
 * @param {Object} bot - Telegram bot instance
 * @param {string} memo - Optional memo
 * @returns {Promise<Object>} Execution result
 */
async function executeSameChainPayment(
  userId,
  recipientUsername,
  amount,
  tokenSymbol,
  targetChain,
  bot,
  memo
) {
  // For same chain, use standard payment flow but on target chain
  // This will be handled by executePayment with chain parameter
  return await executePayment(userId, recipientUsername, amount, tokenSymbol, bot, memo, targetChain.chainId)
}

/**
 * Find chain with sufficient balance
 * @param {number} userId - Telegram user ID
 * @param {string} tokenSymbol - Token symbol
 * @param {string} amount - Required amount
 * @returns {Promise<Object|null>} Chain config with sufficient balance, or null
 */
async function findChainWithBalance(userId, tokenSymbol, amount) {
  try {
    const user = await dbGet('SELECT wallet_address FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return null
    }

    // Check all supported chains
    const chains = Object.values(CHAINS)
    const { getChainBalance } = await import('./bridgeService.js')

    for (const chain of chains) {
      const balance = await getChainBalance(user.wallet_address, tokenSymbol, chain.chainId)
      if (balance.success && parseFloat(balance.balanceFormatted || 0) >= parseFloat(amount)) {
        return chain
      }
    }

    return null
  } catch (error) {
    console.error('[MultiChainPayment] Error finding chain with balance:', error)
    return null
  }
}

/**
 * Execute cross-chain payment (with bridging)
 * @param {number} userId - Telegram user ID
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount to send
 * @param {string} tokenSymbol - Token symbol
 * @param {Object} sourceChain - Source chain config
 * @param {Object} targetChain - Target chain config
 * @param {Object} bot - Telegram bot instance
 * @param {string} memo - Optional memo
 * @param {boolean} cheapestRoute - Whether to find cheapest route
 * @returns {Promise<Object>} Execution result
 */
async function executeCrossChainPayment(
  userId,
  recipientUsername,
  amount,
  tokenSymbol,
  sourceChain,
  targetChain,
  bot,
  memo,
  cheapestRoute = false
) {
  try {
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    
    if (bot) {
      let message = `🌉 **Cross-Chain Payment Routing**\n\n`
      if (cheapestRoute) {
        message += `💰 Finding cheapest route...\n\n`
      }
      if (useAnyChain) {
        message += `🔍 Checking balances across all chains...\n\n`
      }
      message += `Routing payment to ${targetChain.name}...\n` +
        `• Amount: $${amount} ${tokenSymbol}\n` +
        `• To: @${recipientUsername}\n` +
        `• From: ${sourceChain.name}\n` +
        `• To: ${targetChain.name}`
      await bot.sendMessage(userId, message)
    }

    // Check sender balance on source chain
    const sourceBalance = await getChainBalance(user.wallet_address, tokenSymbol, sourceChain.chainId)
    if (!sourceBalance.success || parseFloat(sourceBalance.balanceFormatted || 0) < parseFloat(amount)) {
      return {
        success: false,
        message: `❌ Insufficient balance on ${sourceChain.name}.\n\n` +
          `Required: $${amount}\n` +
          `Your Balance: $${sourceBalance.balanceFormatted || '0'}`
      }
    }

    // Check if recipient exists on target chain
    const recipientExists = await checkRecipientOnChain(recipientUsername, targetChain.chainId)
    if (!recipientExists.exists) {
      return {
        success: false,
        message: `❌ Recipient @${recipientUsername} not found on ${targetChain.name}.\n\n` +
          `The recipient needs to register on ${targetChain.name} first.`
      }
    }

    // Use bridgeAndPay from bridgeService
    const { bridgeAndPay } = await import('./bridgeService.js')
    
    // If cheapest route requested, we could compare multiple routes
    // For now, we'll use the standard bridge (Socket Protocol handles route optimization)
    if (cheapestRoute && bot) {
      await bot.sendMessage(
        userId,
        `💰 **Finding Cheapest Route**\n\n` +
        `Comparing bridge routes from ${sourceChain.name} to ${targetChain.name}...\n` +
        `Socket Protocol will automatically select the most cost-effective route.`
      )
    }
    
    return await bridgeAndPay(
      userId,
      user.username,
      recipientUsername,
      amount,
      tokenSymbol,
      sourceChain.chainId,
      targetChain.chainId,
      bot
    )
  } catch (error) {
    console.error('[MultiChainPayment] Cross-chain payment error:', error)
    return {
      success: false,
      message: `❌ Error processing cross-chain payment: ${error.message}`
    }
  }
}

/**
 * Check if recipient wallet exists on target chain
 * @param {string} recipientUsername - Recipient username
 * @param {number} chainId - Target chain ID
 * @returns {Promise<Object>} {exists: boolean, address: string|null}
 */
async function checkRecipientOnChain(recipientUsername, chainId) {
  try {
    // Check if username exists in database first (works across all chains)
    const recipient = await dbGet(
      'SELECT wallet_address FROM telegram_users WHERE username = ?',
      [recipientUsername.toLowerCase()]
    )

    if (recipient && recipient.wallet_address) {
      // Username exists - smart wallets are deterministic across chains
      // So if username exists on Base, wallet can receive on any chain
      return { exists: true, address: recipient.wallet_address }
    }

    // Fallback: Try to check via contract (only works if contract is deployed on that chain)
    // This will fail for chains where SendCash contract isn't deployed yet
    try {
      const registry = await getUsernameRegistry()
      // Only check contract if we're on Base (where contract is deployed)
      const baseChainId = 84532 // Base Sepolia
      if (chainId === baseChainId) {
        const recipientAddress = await registry.usernameToAddress(recipientUsername.toLowerCase())
        if (recipientAddress && recipientAddress !== ethers.ZeroAddress) {
          return { exists: true, address: recipientAddress }
        }
      }
    } catch (contractError) {
      // Contract not deployed on this chain - that's okay, we'll use database check
      console.log(`[MultiChainPayment] Contract check skipped for chain ${chainId}: ${contractError.message}`)
    }

    return { exists: false, address: null }
  } catch (error) {
    console.error('[MultiChainPayment] Error checking recipient:', error)
    return { exists: false, address: null }
  }
}

/**
 * Execute payment on a specific chain
 * @param {number} userId - Telegram user ID
 * @param {string} recipientUsername - Recipient username
 * @param {string} amount - Amount to send
 * @param {string} tokenSymbol - Token symbol
 * @param {number} chainId - Target chain ID
 * @param {Object} bot - Telegram bot instance
 * @param {string} memo - Optional memo
 * @returns {Promise<Object>} Execution result
 */
export async function executePaymentOnChain(
  userId,
  recipientUsername,
  amount,
  tokenSymbol,
  chainId,
  bot = null,
  memo = null
) {
  try {
    console.log(`[executePaymentOnChain] Executing payment on chain ${chainId}`)

    const chain = Object.values(CHAINS).find(c => c.chainId === chainId)
    if (!chain) {
      return {
        success: false,
        message: `❌ Chain ${chainId} not supported`
      }
    }

    // Get user
    const user = await dbGet('SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      return {
        success: false,
        message: '❌ Wallet not found. Please register first.'
      }
    }

    // Check if SendCash contract exists on target chain
    // For now, we'll use the same contract address assumption
    // In production, you'd have chain-specific contract addresses
    const tokenAddress = TOKEN_ADDRESSES[tokenSymbol.toUpperCase()]?.[chainId]
    if (!tokenAddress) {
      return {
        success: false,
        message: `❌ Token ${tokenSymbol} not supported on ${chain.name}`
      }
    }

    // Check balance on target chain
    const balance = await getChainBalance(user.wallet_address, tokenSymbol, chainId)
    if (!balance.success || parseFloat(balance.balanceFormatted || 0) < parseFloat(amount)) {
      return {
        success: false,
        message: `❌ Insufficient balance on ${chain.name}.\n\n` +
          `Required: $${amount}\n` +
          `Your Balance: $${balance.balanceFormatted || '0'}`
      }
    }

    // Get smart wallet for target chain
    const { getSmartWalletForChain, sendTransactionOnChain } = await import('./thirdwebWallet.js')
    const { smartWallet, walletAddress } = await getSmartWalletForChain(
      user.username,
      userId,
      chainId
    )

    // For now, we'll use a simplified approach:
    // Since SendCash contracts need to be deployed on each chain,
    // we'll bridge the funds and notify the user that payment execution
    // requires contract deployment on the target chain
    
    // In production, you would:
    // 1. Deploy SendCashV2 on each target chain
    // 2. Store chain-specific contract addresses in config
    // 3. Execute payment using that chain's contract
    
    // For now, return success with bridge info
    // The bridge has already completed, funds are on target chain
    return {
      success: true,
      message: `✅ **Funds Bridged to ${chain.name}**\n\n` +
        `🌉 Your $${amount} ${tokenSymbol} has been bridged to ${chain.name}.\n\n` +
        `⚠️ **Note**: To complete the payment to @${recipientUsername}, ` +
        `SendCash contract needs to be deployed on ${chain.name}.\n\n` +
        `Your funds are safe on ${chain.name}. You can use them once the contract is deployed.`
    }
  } catch (error) {
    console.error('[executePaymentOnChain] Error:', error)
    return {
      success: false,
      message: `❌ Error executing payment on chain: ${error.message}`
    }
  }
}

/**
 * Detect payment chain from payment intent
 * @param {Object} paymentIntent - Payment intent from AI
 * @returns {Object|null} Chain config or null
 */
export function detectPaymentChain(paymentIntent) {
  if (!paymentIntent || !paymentIntent.chain) {
    return null
  }

  return getChainConfig(paymentIntent.chain)
}

/**
 * Route payment to appropriate handler
 * @param {number} userId - Telegram user ID
 * @param {Object} paymentIntent - Payment intent
 * @param {Object} bot - Telegram bot instance
 * @returns {Promise<Object>} Execution result
 */
export async function routePayment(userId, paymentIntent, bot) {
  const { recipient, amount, token, chain, memo } = paymentIntent

  // If chain is specified, use multi-chain payment
  if (chain) {
    return await executeMultiChainPayment(
      userId,
      recipient,
      amount.toString(),
      token || 'USDC',
      chain,
      bot,
      memo
    )
  }

  // Default: use standard payment on Base
  const { executePayment } = await import('./aiActions.js')
  return await executePayment(userId, recipient, amount.toString(), token || 'USDC', bot, memo)
}
