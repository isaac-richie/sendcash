import { ethers } from 'ethers'
import { CONTRACTS, BASE_RPC, BASE_RPC_FALLBACKS } from './config.js'

// ✅ CRITICAL FIX: Create provider with retry logic
let provider = null
let currentRpcIndex = 0

const createProvider = (rpcUrl) => {
  return new ethers.JsonRpcProvider(rpcUrl, undefined, {
    staticNetwork: true,
    batchMaxCount: 1,
  })
}

const getProvider = () => {
  if (!provider) {
    provider = createProvider(BASE_RPC_FALLBACKS[currentRpcIndex])
  }
  return provider
}

// ✅ CRITICAL FIX: Retry with fallback RPC endpoints
const getProviderWithRetry = async () => {
  const maxRetries = BASE_RPC_FALLBACKS.length
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const rpcUrl = BASE_RPC_FALLBACKS[(currentRpcIndex + attempt) % BASE_RPC_FALLBACKS.length]
      const testProvider = createProvider(rpcUrl)
      
      // Test connection
      await testProvider.getBlockNumber()
      
      // If successful, update current provider
      if (attempt > 0) {
        currentRpcIndex = (currentRpcIndex + attempt) % BASE_RPC_FALLBACKS.length
        provider = testProvider
        console.log(`[RPC] Switched to fallback RPC: ${rpcUrl}`)
      }
      
      return provider
    } catch (error) {
      console.warn(`[RPC] Attempt ${attempt + 1} failed:`, error.message)
      if (attempt === maxRetries - 1) {
        throw new Error(`All RPC endpoints failed. Last error: ${error.message}`)
      }
    }
  }
  
  return provider
}

// Initialize provider on first use

export const getSendCash = async () => {
  // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
  const currentProvider = await getProviderWithRetry()
  return new ethers.Contract(
    CONTRACTS.SEND_CASH,
    [
      // Payment functions
      'function sendPayment(string, address, uint256)',
      'function calculateFee(uint256) pure returns (uint256)',
      
      // Token management
      'function supportedTokens(address) view returns (bool)',
      'function addSupportedToken(address)',
      'function removeSupportedToken(address)',
      
      // Contract info
      'function usernameRegistry() view returns (address)',
      'function FEE_PERCENTAGE() view returns (uint256)',
      'function BASIS_POINTS() view returns (uint256)',
      
      // Events (for listening)
      'event PaymentSent(address indexed from, address indexed to, address indexed token, uint256 amount, uint256 fee, string fromUsername, string toUsername)',
      'event TokenAdded(address indexed token)',
      'event TokenRemoved(address indexed token)'
    ],
    currentProvider
  )
}

export const getUsernameRegistry = async () => {
  // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
  const currentProvider = await getProviderWithRetry()
  return new ethers.Contract(
    CONTRACTS.USERNAME_REGISTRY,
    [
      // Mapping getters (auto-generated from public mappings)
      'function usernameToAddress(string) view returns (address)',
      'function addressToUsername(address) view returns (string)',
      
      // Explicit lookup functions (preferred for clarity)
      'function getAddress(string) view returns (address)',
      'function getUsername(address) view returns (string)',
      
      // Registration functions
      'function registerUsername(string)',
      'function registerUsernameForAddress(string, address, address)',
      'function registerPremiumUsername(string)',
      'function updateUsername(string)',
      
      // Validation functions
      'function isUsernameAvailable(string) view returns (bool)',
      'function isValidUsername(string) pure returns (bool)',
      
      // Fee functions
      'function registrationFee() view returns (uint256)',
      'function premiumFee() view returns (uint256)',
      'function getFeeBalance() view returns (uint256)',
      
      // Premium username check
      'function premiumUsernames(string) view returns (bool)'
    ],
    currentProvider
  )
}

export const getTokenContract = async (tokenAddress) => {
  // ✅ CRITICAL FIX: Use getProviderWithRetry for automatic RPC fallback
  const currentProvider = await getProviderWithRetry()
  return new ethers.Contract(
    tokenAddress,
    [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function approve(address, uint256)',
      'function allowance(address, address) view returns (uint256)'
    ],
    currentProvider
  )
}

// Export provider getter for use in other services
export { getProvider, getProviderWithRetry }

