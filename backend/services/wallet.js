import { ethers } from 'ethers'
import { CONTRACTS, TOKENS } from './config.js'
import { getSendCash, getTokenContract, getUsernameRegistry, getProvider, getProviderWithRetry } from './contracts.js'

// Get balance for a token
export const getTokenBalance = async (address, tokenAddress) => {
  const maxRetries = 3
  let lastError = null
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
      const provider = await getProviderWithRetry()
      const token = new ethers.Contract(
        tokenAddress,
        ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
        provider
      )
      const balance = await token.balanceOf(address)
      const decimals = await token.decimals()
      return { balance, decimals, formatted: ethers.formatUnits(balance, decimals) }
    } catch (error) {
      lastError = error
      console.warn(`[getTokenBalance] Attempt ${attempt}/${maxRetries} failed:`, error.message)
      
      // If it's a connection error, retry after delay
      if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.message.includes('timeout') || error.message.includes('network')) {
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)) // Exponential backoff
          continue
        }
      }
      
      // For other errors, don't retry
      break
    }
  }
  
  console.error('Error getting token balance after retries:', lastError)
  return null
}

// Prepare send transaction (returns transaction data for signing)
export const prepareSendTransaction = async (fromAddress, toUsername, tokenSymbol, amount) => {
  try {
    // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
    const provider = await getProviderWithRetry()
    const sendCash = await getSendCash()

    // Get recipient address from username
    // ✅ FIX: Use usernameToAddress mapping directly instead of getAddress()
    // getAddress() has a bug that returns registry address for non-existent usernames
    const registry = await getUsernameRegistry()
    
    const toAddress = await registry.usernameToAddress(toUsername.toLowerCase())
    if (!toAddress || toAddress === ethers.ZeroAddress) {
      throw new Error('Username not found')
    }

    // Get token address
    const token = TOKENS[tokenSymbol.toUpperCase()]
    if (!token) {
      throw new Error('Token not supported')
    }

    // Check if token is supported
    const isSupported = await sendCash.supportedTokens(token.address)
    if (!isSupported) {
      throw new Error('Token not supported in contract')
    }

    // Parse amount
    const amountWei = ethers.parseUnits(amount, token.decimals)

    // Calculate fee
    const fee = await sendCash.calculateFee(amountWei)
    const amountAfterFee = amountWei - fee

    // Prepare transaction
    const tx = await sendCash.sendPayment.populateTransaction(
      toUsername.toLowerCase(),
      token.address,
      amountWei
    )

    return {
      to: CONTRACTS.SEND_CASH,
      data: tx.data,
      value: 0,
      from: fromAddress,
      amount: amount,
      amountWei: amountWei.toString(),
      fee: fee.toString(),
      token: tokenSymbol,
      recipient: toAddress,
      recipientUsername: toUsername
    }
  } catch (error) {
    console.error('Error preparing transaction:', error)
    throw error
  }
}

// Check if user needs to approve token first
export const checkTokenAllowance = async (ownerAddress, tokenAddress, amount) => {
  try {
    // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
    const provider = await getProviderWithRetry()
    const token = new ethers.Contract(
      tokenAddress,
      ['function allowance(address, address) view returns (uint256)'],
      provider
    )
    
    const allowance = await token.allowance(ownerAddress, CONTRACTS.SEND_CASH)
    return allowance >= amount
  } catch (error) {
    console.error('Error checking allowance:', error)
    return false
  }
}

// Prepare approve transaction
export const prepareApproveTransaction = async (ownerAddress, tokenAddress) => {
  try {
    // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
    const provider = await getProviderWithRetry()
    const token = new ethers.Contract(
      tokenAddress,
      ['function approve(address, uint256)'],
      provider
    )

    const tx = await token.approve.populateTransaction(
      CONTRACTS.SEND_CASH,
      ethers.MaxUint256
    )

    return {
      to: tokenAddress,
      data: tx.data,
      value: 0,
      from: ownerAddress
    }
  } catch (error) {
    console.error('Error preparing approve transaction:', error)
    throw error
  }
}

