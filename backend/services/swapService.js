import { ethers } from 'ethers'
import { Token, CurrencyAmount, TradeType, Percent } from '@uniswap/sdk-core'
import { Pool, Route, Trade } from '@uniswap/v3-sdk'
import { BASE_RPC, TOKENS } from './config.js'

/**
 * Error wrapper for swap operations
 * Provides detailed logging and error categorization
 */
class SwapError extends Error {
  constructor(message, category, context = {}, originalError = null) {
    super(message)
    this.name = 'SwapError'
    this.category = category // 'validation', 'quote', 'execution', 'approval', 'network', 'unknown'
    this.context = context
    this.originalError = originalError
    this.timestamp = new Date().toISOString()
  }
}

/**
 * Log swap error with full context
 */
const logSwapError = (error, operation, context = {}) => {
  const errorId = `SWAP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const timestamp = new Date().toISOString()
  
  console.error('\n' + '='.repeat(80))
  console.error(`[SwapService] ❌ ERROR DETECTED - ${errorId}`)
  console.error(`[SwapService] Timestamp: ${timestamp}`)
  console.error(`[SwapService] Operation: ${operation}`)
  console.error(`[SwapService] Error Category: ${error.category || 'unknown'}`)
  console.error(`[SwapService] Error Message: ${error.message}`)
  
  if (context.userId) console.error(`[SwapService] User ID: ${context.userId}`)
  if (context.username) console.error(`[SwapService] Username: @${context.username}`)
  if (context.fromToken) console.error(`[SwapService] From Token: ${context.fromToken}`)
  if (context.toToken) console.error(`[SwapService] To Token: ${context.toToken}`)
  if (context.amount) console.error(`[SwapService] Amount: ${context.amount}`)
  if (context.walletAddress) console.error(`[SwapService] Wallet: ${context.walletAddress}`)
  if (context.poolAddress) console.error(`[SwapService] Pool: ${context.poolAddress}`)
  if (context.txHash) console.error(`[SwapService] TX Hash: ${context.txHash}`)
  
  if (error.originalError) {
    console.error(`[SwapService] Original Error: ${error.originalError.message}`)
    console.error(`[SwapService] Original Stack: ${error.originalError.stack?.split('\n').slice(0, 5).join('\n')}`)
  }
  
  if (error.stack) {
    console.error(`[SwapService] Stack Trace:`)
    console.error(error.stack.split('\n').slice(0, 10).join('\n'))
  }
  
  console.error(`[SwapService] Error ID: ${errorId}`)
  console.error('='.repeat(80) + '\n')
  
  return errorId
}

/**
 * Wrap swap operation with error handling
 */
const wrapSwapOperation = async (operation, operationName, context = {}) => {
  try {
    return await operation()
  } catch (error) {
    // Determine error category
    let category = 'unknown'
    const errorMessage = error.message?.toLowerCase() || ''
    
    if (errorMessage.includes('token') || errorMessage.includes('address') || errorMessage.includes('not found')) {
      category = 'validation'
    } else if (errorMessage.includes('pool') || errorMessage.includes('liquidity') || errorMessage.includes('quote')) {
      category = 'quote'
    } else if (errorMessage.includes('allowance') || errorMessage.includes('approve')) {
      category = 'approval'
    } else if (errorMessage.includes('transaction') || errorMessage.includes('execute') || errorMessage.includes('send')) {
      category = 'execution'
    } else if (errorMessage.includes('network') || errorMessage.includes('rpc') || errorMessage.includes('timeout')) {
      category = 'network'
    } else if (errorMessage.includes('user') || errorMessage.includes('wallet')) {
      category = 'validation'
    }
    
    const swapError = new SwapError(
      error.message || 'Unknown swap error',
      category,
      context,
      error
    )
    
    logSwapError(swapError, operationName, context)
    throw swapError
  }
}

/**
 * Swap Service - Uniswap V3 Integration
 * Handles token swaps on Base Sepolia
 * 
 * Note: Starting with V3 since it's confirmed deployed on Base Sepolia
 * V4 can be evaluated later if needed
 */

// Uniswap V3 addresses on Base Sepolia (from official docs)
const UNISWAP_FACTORY = '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24'
const UNISWAP_UNIVERSAL_ROUTER = '0x492E6456D9528771018DeB9E87ef7750EF184104'
const UNISWAP_QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a' // QuoterV2 for accurate quotes

// Chain ID for Base Sepolia
const BASE_SEPOLIA_CHAIN_ID = 84532

// Fee tiers for Uniswap V3 pools (in basis points)
// Order matters: check most liquid pools first (0.3% is most common)
const FEE_TIERS = [3000, 500, 10000] // 0.3%, 0.05%, 1%

// Pool ABI for querying pool state
const POOL_ABI = [
  'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
  'function liquidity() external view returns (uint128)',
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function fee() external view returns (uint24)'
]

/**
 * Get Uniswap Token instance
 * @param {string} tokenSymbol - Token symbol (USDC, USDT, WBTC)
 * @returns {Token} Uniswap Token instance
 */
const getUniswapToken = (tokenSymbol) => {
  const tokenInfo = TOKENS[tokenSymbol.toUpperCase()]
  if (!tokenInfo || !tokenInfo.address) {
    throw new Error(`Token ${tokenSymbol} not supported or address not configured`)
  }
  
  return new Token(
    BASE_SEPOLIA_CHAIN_ID,
    tokenInfo.address,
    tokenInfo.decimals,
    tokenInfo.symbol,
    tokenInfo.name
  )
}

/**
 * Verify token addresses exist on Base Sepolia
 * @param {string} tokenSymbol - Token symbol to verify
 * @returns {Promise<boolean>} True if token exists
 */
export const verifyTokenAddress = async (tokenSymbol) => {
  try {
    const tokenInfo = TOKENS[tokenSymbol.toUpperCase()]
    if (!tokenInfo || !tokenInfo.address) {
      return false
    }
    
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    const code = await provider.getCode(tokenInfo.address)
    
    // If code exists and is not empty, token contract exists
    return code && code !== '0x'
  } catch (error) {
    console.error(`[SwapService] Error verifying token ${tokenSymbol}:`, error.message)
    return false
  }
}

/**
 * Find pool address for token pair
 * @param {Token} token0 - First token
 * @param {Token} token1 - Second token
 * @param {number} fee - Fee tier in basis points
 * @returns {Promise<string|null>} Pool address or null if not found
 */
/**
 * Find pool address for token pair using Uniswap Factory
 * Uniswap V3 pools are identified by (token0, token1, fee) where addresses are sorted
 * @param {Token} token0 - First token
 * @param {Token} token1 - Second token
 * @param {number} fee - Fee tier in basis points
 * @returns {Promise<string|null>} Pool address or null if not found
 */
const findPoolAddress = async (token0, token1, fee) => {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    
    const factoryABI = [
      'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)'
    ]
    
    const factory = new ethers.Contract(UNISWAP_FACTORY, factoryABI, provider)
    
    // Uniswap sorts token addresses, so we need to check both orders
    // Factory.getPool handles sorting internally, but we check both to be safe
    let poolAddress = await factory.getPool(token0.address, token1.address, fee)
    
    // If first check returns zero address, try reverse order
    if (!poolAddress || poolAddress === ethers.ZeroAddress) {
      poolAddress = await factory.getPool(token1.address, token0.address, fee)
    }
    
    // Return pool address if valid, otherwise null
    return poolAddress && poolAddress !== ethers.ZeroAddress ? poolAddress : null
  } catch (error) {
    console.error(`[SwapService] Error finding pool for ${token0.symbol}/${token1.symbol} (fee: ${fee}):`, error.message)
    return null
  }
}

/**
 * Get pool state
 * @param {string} poolAddress - Pool contract address
 * @returns {Promise<Object|null>} Pool state or null
 */
const getPoolState = async (poolAddress) => {
  try {
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider)
    
    const [slot0, liquidity, token0, token1, fee] = await Promise.all([
      pool.slot0(),
      pool.liquidity(),
      pool.token0(),
      pool.token1(),
      pool.fee()
    ])
    
    return {
      sqrtPriceX96: slot0.sqrtPriceX96,
      tick: slot0.tick,
      liquidity: liquidity,
      token0,
      token1,
      fee: Number(fee)
    }
  } catch (error) {
    console.error(`[SwapService] Error getting pool state:`, error.message)
    return null
  }
}

/**
 * Get swap quote with actual pool data
 * @param {string} fromToken - Source token symbol
 * @param {string} toToken - Destination token symbol
 * @param {string} amount - Amount to swap (as string, e.g., "100")
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} Quote information
 */
export const getSwapQuote = async (fromToken, toToken, amount, walletAddress) => {
  const context = { fromToken, toToken, amount, walletAddress }
  
  return await wrapSwapOperation(async () => {
    console.log(`[SwapService] Getting quote: ${amount} ${fromToken} → ${toToken}`)
    
    // Verify tokens
    const fromTokenExists = await verifyTokenAddress(fromToken)
    const toTokenExists = await verifyTokenAddress(toToken)
    
    if (!fromTokenExists) {
      throw new SwapError(
        `Token ${fromToken} not found on Base Sepolia`,
        'validation',
        { ...context, missingToken: fromToken }
      )
    }
    if (!toTokenExists) {
      throw new SwapError(
        `Token ${toToken} not found on Base Sepolia`,
        'validation',
        { ...context, missingToken: toToken }
      )
    }
    
    // Get token instances
    const tokenIn = getUniswapToken(fromToken)
    const tokenOut = getUniswapToken(toToken)
    
    // Parse amount
    const amountIn = CurrencyAmount.fromRawAmount(
      tokenIn,
      ethers.parseUnits(amount, tokenIn.decimals).toString()
    )
    
    // Try to find a pool for this pair using Uniswap liquidity pools
    let pool = null
    let poolAddress = null
    let foundFee = null
    
    console.log(`[SwapService] Searching for ${fromToken}/${toToken} liquidity pools...`)
    
    // Try different fee tiers (start with most common: 0.3%)
    for (const fee of FEE_TIERS) {
      poolAddress = await findPoolAddress(tokenIn, tokenOut, fee)
      if (poolAddress) {
        console.log(`[SwapService] Found pool at ${poolAddress} with fee ${fee / 10000}%`)
        const poolState = await getPoolState(poolAddress)
        if (poolState && poolState.liquidity > 0n) {
          console.log(`[SwapService] Pool has liquidity: ${poolState.liquidity.toString()}`)
          // Create Pool instance using actual pool data from Uniswap
          pool = new Pool(
            tokenIn,
            tokenOut,
            fee,
            poolState.sqrtPriceX96.toString(),
            poolState.liquidity.toString(),
            poolState.tick,
            [] // ticks array (optional, empty for now)
          )
          foundFee = fee
          break
        } else {
          console.log(`[SwapService] Pool found but has no liquidity`)
        }
      }
    }
    
    // Note: Multi-hop routes can be added later using AlphaRouter
    // For now, we focus on direct pools which are the most efficient
    
    if (!pool) {
      const error = new SwapError(
        `No liquidity pool found for ${fromToken}/${toToken}`,
        'quote',
        { ...context, checkedFeeTiers: FEE_TIERS, factory: UNISWAP_FACTORY }
      )
      logSwapError(error, 'getSwapQuote', context)
      
      return {
        fromToken,
        toToken,
        fromAmount: amount,
        toAmount: '0',
        estimatedGas: '0',
        priceImpact: '0',
        status: 'no_liquidity',
        message: `❌ **No Liquidity Pool Found**\n\n` +
          `The ${fromToken}/${toToken} pair doesn't have a liquidity pool on Base Sepolia testnet.\n\n` +
          `**Checked fee tiers:** ${FEE_TIERS.map(f => `${f/10000}%`).join(', ')}\n\n` +
          `💡 **What this means:**\n` +
          `• No one has created a liquidity pool for this pair yet\n` +
          `• This is common on testnets where pools need to be manually created\n` +
          `• You can create a test pool using Uniswap's interface or contract\n\n` +
          `**Alternative:** Try swapping other token pairs that may have pools, or create a test pool first.`
      }
    }
    
    // Create route and trade
    const route = new Route([pool], tokenIn, tokenOut)
    const trade = Trade.exactIn(route, amountIn)
    
    // Calculate output amount
    const amountOut = trade.outputAmount.toExact()
    
    return {
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: amountOut,
      toAmountRaw: trade.outputAmount.quotient.toString(),
      estimatedGas: '50000', // Rough estimate
      priceImpact: '0', // Will calculate later
      status: 'success',
      poolAddress,
      route: route.path.map(t => t.symbol).join(' → ')
    }
  }, 'getSwapQuote', context)
}

/**
 * Execute swap transaction
 * @param {number} userId - Telegram user ID
 * @param {string} username - User's username
 * @param {string} fromToken - Source token symbol
 * @param {string} toToken - Destination token symbol
 * @param {string} amount - Amount to swap
 * @param {number} slippageBps - Slippage tolerance in basis points (default: 100 = 1%)
 * @param {Object} bot - Telegram bot instance (optional)
 * @returns {Promise<Object>} Swap execution result
 */
export const executeSwap = async (userId, username, fromToken, toToken, amount, slippageBps = 100, bot = null) => {
  const context = { userId, username, fromToken, toToken, amount, slippageBps }
  
  return await wrapSwapOperation(async () => {
    console.log(`[SwapService] Executing swap: ${amount} ${fromToken} → ${toToken}`)
    
    // Import dependencies
    const { dbGet, dbRun } = await import('./database.js')
    const { getSmartWalletForUser, sendTransactionFromSmartWallet, approveTokenFromSmartWallet } = await import('./thirdwebWallet.js')
    
    // Get user
    const user = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
    if (!user || !user.wallet_address) {
      throw new SwapError(
        'User wallet not found',
        'validation',
        { ...context, userId }
      )
    }
    
    context.walletAddress = user.wallet_address
    
    // Get quote first
    if (bot) {
      await bot.sendMessage(userId, `💱 Getting best swap quote for ${amount} ${fromToken} → ${toToken}...`)
    }
    
    const quote = await getSwapQuote(fromToken, toToken, amount, user.wallet_address)
    
    if (quote.status !== 'success') {
      throw new SwapError(
        quote.message || 'Failed to get swap quote',
        'quote',
        { ...context, quoteStatus: quote.status }
      )
    }
    
    context.quote = quote
    context.poolAddress = quote.poolAddress
    
    // Get smart wallet
    let smartWallet, personalAccount, walletAddress
    try {
      const walletResult = await getSmartWalletForUser(username, userId)
      smartWallet = walletResult.smartWallet
      personalAccount = walletResult.personalAccount
      walletAddress = walletResult.walletAddress
      context.smartWalletAddress = walletAddress
    } catch (error) {
      throw new SwapError(
        `Failed to get smart wallet: ${error.message}`,
        'validation',
        { ...context },
        error
      )
    }
    
    // Check and approve token if needed
    const fromTokenInfo = TOKENS[fromToken.toUpperCase()]
    const amountWei = ethers.parseUnits(amount, fromTokenInfo.decimals)
    
    // Check allowance
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    const tokenContract = new ethers.Contract(
      fromTokenInfo.address,
      ['function allowance(address, address) view returns (uint256)'],
      provider
    )
    
    const allowance = await tokenContract.allowance(walletAddress, UNISWAP_UNIVERSAL_ROUTER)
    
    if (allowance < amountWei) {
      if (bot) {
        await bot.sendMessage(userId, `⏳ Approving ${fromToken} for swap...`)
      }
      
      // Approve token
      try {
        await approveTokenFromSmartWallet(
          smartWallet,
          fromTokenInfo.address,
          UNISWAP_UNIVERSAL_ROUTER,
          ethers.MaxUint256,
          personalAccount,
          walletAddress
        )
        console.log(`[SwapService] ✅ Token approval successful`)
      } catch (error) {
        throw new SwapError(
          `Token approval failed: ${error.message}`,
          'approval',
          { ...context, tokenAddress: fromTokenInfo.address, spender: UNISWAP_UNIVERSAL_ROUTER },
          error
        )
      }
    }
    
    // Calculate minimum amount out with slippage
    const slippagePercent = slippageBps / 10000 // Convert bps to decimal
    const toTokenInfo = TOKENS[toToken.toUpperCase()]
    const expectedAmountOut = ethers.parseUnits(quote.toAmount, toTokenInfo.decimals)
    const slippageAmount = (expectedAmountOut * BigInt(Math.floor(slippagePercent * 10000))) / 10000n
    const minAmountOut = expectedAmountOut - slippageAmount
    
    if (bot) {
      await bot.sendMessage(userId, `⏳ Executing swap...`)
    }
    
    // Get token instances for constructing swap
    const tokenIn = getUniswapToken(fromToken)
    const tokenOut = getUniswapToken(toToken)
    
    // Reconstruct the trade from quote data
    // We need to get the pool and create the trade again to get swap parameters
    let pool = null
    let poolAddress = null
    
    // Find the pool (same logic as getSwapQuote)
    for (const fee of FEE_TIERS) {
      poolAddress = await findPoolAddress(tokenIn, tokenOut, fee)
      if (poolAddress) {
        const poolState = await getPoolState(poolAddress)
        if (poolState && poolState.liquidity > 0n) {
          pool = new Pool(
            tokenIn,
            tokenOut,
            fee,
            poolState.sqrtPriceX96.toString(),
            poolState.liquidity.toString(),
            poolState.tick,
            []
          )
          break
        }
      }
    }
    
    if (!pool) {
      throw new SwapError(
        'Pool not found for swap execution',
        'quote',
        { ...context, checkedFeeTiers: FEE_TIERS }
      )
    }
    
    // Create route and trade
    const route = new Route([pool], tokenIn, tokenOut)
    const amountIn = CurrencyAmount.fromRawAmount(
      tokenIn,
      amountWei.toString()
    )
    const trade = Trade.exactIn(route, amountIn)
    
    // Get swap parameters from trade
    const deadline = Math.floor(Date.now() / 1000) + 60 * 20 // 20 minutes
    
    // Universal Router uses execute(bytes calldata commands, bytes[] calldata inputs)
    // Commands are encoded instructions
    // For V3_SWAP_EXACT_IN, we need to encode the command
    
    // Universal Router command encoding:
    // Command type (1 byte) + parameters
    // V3_SWAP_EXACT_IN = 0x00
    // We'll use the router's interface to construct this
    
    // For now, let's use a direct approach with the router's swap method
    // Universal Router may have a simpler interface we can use
    
    // Alternative: Use the Trade's swapCallParameters method if available
    // Or construct the calldata manually
    
    console.log(`[SwapService] Preparing swap transaction...`)
    console.log(`[SwapService] From: ${amount} ${fromToken}`)
    console.log(`[SwapService] To: ~${quote.toAmount} ${toToken}`)
    console.log(`[SwapService] Min out: ${ethers.formatUnits(minAmountOut, toTokenInfo.decimals)}`)
    console.log(`[SwapService] Pool: ${poolAddress}`)
    
    // Construct swap parameters
    // Universal Router execute() takes (bytes commands, bytes[] inputs)
    // For a V3 swap, we need to encode the command
    
    // Simplified approach: Use exactInputSingle if available
    // Or construct Universal Router command bytes
    
    // Universal Router uses execute(bytes calldata commands, bytes[] calldata inputs)
    // Commands format: [command_byte][encoded_parameters]
    // V3_SWAP_EXACT_IN = 0x00
    
    // Encode path: token0 (20 bytes) + fee (3 bytes) + token1 (20 bytes)
    const fee = pool.fee
    const feeBytes = ethers.zeroPadValue(ethers.toBeHex(fee), 3) // uint24 = 3 bytes
    const path = ethers.concat([
      ethers.zeroPadValue(tokenIn.address, 20), // token0
      feeBytes,                                  // fee (3 bytes)
      ethers.zeroPadValue(tokenOut.address, 20)  // token1
    ])
    
    // Encode command parameters
    const abiCoder = ethers.AbiCoder.defaultAbiCoder()
    const commandParams = abiCoder.encode(
      ['address', 'uint256', 'uint256', 'bytes', 'bool'],
      [
        walletAddress,        // recipient
        amountWei.toString(), // amountIn
        minAmountOut.toString(), // amountOutMin
        path,                 // path (token0 + fee + token1)
        true                  // payerIsUser (we pay from wallet)
      ]
    )
    
    // Combine command byte (0x00 for V3_SWAP_EXACT_IN) with parameters
    const command = ethers.concat(['0x00', commandParams])
    
    // Universal Router execute() signature: execute(bytes calldata commands, bytes[] calldata inputs)
    // For single command, inputs can be empty array or [0x]
    const inputs = []
    
    console.log(`[SwapService] Executing swap through Universal Router...`)
    console.log(`[SwapService] Router: ${UNISWAP_UNIVERSAL_ROUTER}`)
    console.log(`[SwapService] Command length: ${ethers.dataLength(command)} bytes`)
    console.log(`[SwapService] Path: ${tokenIn.symbol} (${pool.fee/10000}%) → ${tokenOut.symbol}`)
    
    // Execute swap through smart wallet (gasless via account abstraction)
    let swapTxHash
    try {
      swapTxHash = await sendTransactionFromSmartWallet(
        smartWallet,
        UNISWAP_UNIVERSAL_ROUTER,
        'execute',
        [
          command,  // bytes calldata commands
          inputs    // bytes[] calldata inputs (empty for single command)
        ],
        personalAccount,
        walletAddress
      )
      
      console.log(`[SwapService] ✅ Swap transaction sent: ${swapTxHash}`)
      context.txHash = swapTxHash
    } catch (error) {
      throw new SwapError(
        `Swap transaction execution failed: ${error.message}`,
        'execution',
        { ...context, router: UNISWAP_UNIVERSAL_ROUTER, commandLength: ethers.dataLength(command) },
        error
      )
    }
    
    // Store swap in database
    try {
      await dbRun(
        `INSERT INTO swaps (user_id, from_token, to_token, from_amount, to_amount, tx_hash, status, slippage_bps, pool_address, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, strftime('%s', 'now'))`,
        [
          userId,
          fromToken,
          toToken,
          amount,
          quote.toAmount,
          swapTxHash,
          slippageBps,
          poolAddress
        ]
      )
      console.log(`[SwapService] ✅ Swap stored in database`)
    } catch (dbError) {
      // Log but don't fail the swap if DB storage fails
      const dbError_wrapped = new SwapError(
        `Database storage failed: ${dbError.message}`,
        'execution',
        { ...context, txHash: swapTxHash },
        dbError
      )
      logSwapError(dbError_wrapped, 'executeSwap_db_storage', context)
      // Continue - swap was successful even if DB write failed
    }
    
    return {
      success: true,
      txHash: swapTxHash,
      fromToken,
      toToken,
      fromAmount: amount,
      toAmount: quote.toAmount,
      minAmountOut: ethers.formatUnits(minAmountOut, toTokenInfo.decimals),
      slippageBps,
      status: 'pending',
      poolAddress,
      deadline,
      blockExplorerUrl: `https://sepolia-explorer.base.org/tx/${swapTxHash}`
    }
  }, 'executeSwap', context)
}

/**
 * Test function to verify service setup
 * @returns {Promise<Object>} Test results
 */
export const testSwapService = async () => {
  try {
    console.log('[SwapService] Testing swap service setup...')
    
    const results = {
      tokens: {},
      contracts: {},
      errors: []
    }
    
    // Test token verification
    for (const tokenSymbol of ['USDC', 'USDT', 'WBTC']) {
      try {
        const exists = await verifyTokenAddress(tokenSymbol)
        results.tokens[tokenSymbol] = {
          exists,
          address: TOKENS[tokenSymbol]?.address || 'NOT_SET'
        }
      } catch (error) {
        results.errors.push(`Token ${tokenSymbol}: ${error.message}`)
      }
    }
    
    // Test Uniswap contracts
    const provider = new ethers.JsonRpcProvider(BASE_RPC)
    
    try {
      const factoryCode = await provider.getCode(UNISWAP_FACTORY)
      results.contracts.factory = {
        address: UNISWAP_FACTORY,
        exists: factoryCode && factoryCode !== '0x'
      }
    } catch (error) {
      results.errors.push(`Factory check: ${error.message}`)
    }
    
    try {
      const routerCode = await provider.getCode(UNISWAP_UNIVERSAL_ROUTER)
      results.contracts.router = {
        address: UNISWAP_UNIVERSAL_ROUTER,
        exists: routerCode && routerCode !== '0x'
      }
    } catch (error) {
      results.errors.push(`Router check: ${error.message}`)
    }
    
    return results
  } catch (error) {
    console.error('[SwapService] Test error:', error)
    return { error: error.message }
  }
}

