import { ethers } from 'ethers'
import { CONTRACTS, TOKENS, SCROLL_RPC, CHAIN_ID } from './config'

// ABI imports (simplified - in production, import from artifacts)
import UsernameRegistryABI from '../abis/UsernameRegistry.json'
import SendCashABI from '../abis/SendCash.json'
import ERC20ABI from '../abis/ERC20.json'

let provider = null
let signer = null

export const getProvider = () => {
  if (typeof window !== 'undefined' && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum)
  }
  return new ethers.JsonRpcProvider(SCROLL_RPC)
}

export const connectWallet = async () => {
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask or compatible wallet not found')
  }

  provider = new ethers.BrowserProvider(window.ethereum)
  
  // Request account access
  await provider.send('eth_requestAccounts', [])
  
  // Switch to Scroll network if needed
  try {
    await provider.send('wallet_switchEthereumChain', [{ chainId: `0x${CHAIN_ID.toString(16)}` }])
  } catch (switchError) {
    // Chain doesn't exist, add it
    if (switchError.code === 4902) {
      await provider.send('wallet_addEthereumChain', [{
        chainId: `0x${CHAIN_ID.toString(16)}`,
        chainName: 'Scroll Sepolia',
        nativeCurrency: {
          name: 'ETH',
          symbol: 'ETH',
          decimals: 18
        },
        rpcUrls: [SCROLL_RPC],
        blockExplorerUrls: ['https://sepolia-blockscout.scroll.io']
      }])
    }
  }

  signer = await provider.getSigner()
  return signer
}

export const getSigner = () => {
  if (!signer) {
    throw new Error('Wallet not connected')
  }
  return signer
}

export const getUsernameRegistry = () => {
  const signer = getSigner()
  return new ethers.Contract(CONTRACTS.USERNAME_REGISTRY, UsernameRegistryABI, signer)
}

export const getSendCash = () => {
  const signer = getSigner()
  return new ethers.Contract(CONTRACTS.SEND_CASH, SendCashABI, signer)
}

export const getTokenContract = (tokenAddress) => {
  const signer = getSigner()
  return new ethers.Contract(tokenAddress, ERC20ABI, signer)
}

export const getBalance = async (address, tokenAddress) => {
  const provider = getProvider()
  const token = new ethers.Contract(tokenAddress, ERC20ABI, provider)
  return await token.balanceOf(address)
}

export const formatTokenAmount = (amount, decimals = 6) => {
  return ethers.formatUnits(amount, decimals)
}

export const parseTokenAmount = (amount, decimals = 6) => {
  return ethers.parseUnits(amount, decimals)
}


