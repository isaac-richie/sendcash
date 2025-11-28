// Contract addresses (update after deployment)
export const CONTRACTS = {
  USERNAME_REGISTRY: process.env.VITE_USERNAME_REGISTRY_ADDRESS || '',
  SEND_CASH: process.env.VITE_SEND_CASH_ADDRESS || '',
  PAYMASTER: process.env.VITE_PAYMASTER_ADDRESS || '',
}

// Supported tokens (Scroll Sepolia testnet - update with actual addresses)
export const TOKENS = {
  USDC: {
    address: process.env.VITE_USDC_ADDRESS || '',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin'
  },
  USDT: {
    address: process.env.VITE_USDT_ADDRESS || '',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD'
  }
}

// API endpoint
export const API_URL = process.env.VITE_API_URL || 'http://localhost:5000/api'

// Scroll L2 RPC
export const SCROLL_RPC = process.env.VITE_SCROLL_RPC || 'https://sepolia-rpc.scroll.io'

// Chain ID for Scroll Sepolia
export const CHAIN_ID = 534351 // Scroll Sepolia testnet


