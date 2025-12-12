// Ensure dotenv is loaded when this module is imported
import dotenv from 'dotenv'
dotenv.config()

export const CONTRACTS = {
  USERNAME_REGISTRY: process.env.USERNAME_REGISTRY_ADDRESS || '',
  SEND_CASH: process.env.SEND_CASH_ADDRESS || '',
  ENTRY_POINT: process.env.ENTRY_POINT_ADDRESS || '0x0000000071727De22E5E9d8BAf0BaAc3cC26537', // Standard ERC-4337 EntryPoint
}

// ✅ CRITICAL FIX: Add fallback RPC endpoints for reliability
export const BASE_RPC = process.env.BASE_RPC_URL || 'https://sepolia.base.org'
export const BASE_RPC_FALLBACKS = [
  process.env.BASE_RPC_URL || 'https://sepolia.base.org',
  'https://base-sepolia-rpc.publicnode.com',
  'https://base-sepolia.gateway.tenderly.co',
  'https://base-sepolia.drpc.org'
]

export const APP_URL = process.env.APP_URL || 'http://localhost:3000'

// Supported tokens (Base Sepolia addresses)
export const TOKENS = {
  USDC: {
    address: process.env.USDC_ADDRESS || '',
    symbol: 'USDC',
    decimals: 6,
    name: 'USD Coin'
  },
  USDT: {
    address: process.env.USDT_ADDRESS || '',
    symbol: 'USDT',
    decimals: 6,
    name: 'Tether USD'
  },
  WBTC: {
    address: process.env.WBTC_ADDRESS || '',
    symbol: 'WBTC',
    decimals: 8,
    name: 'Wrapped Bitcoin'
  },
  DAI: {
    address: process.env.DAI_ADDRESS || '',
    symbol: 'DAI',
    decimals: 18,
    name: 'Dai Stablecoin'
  }
}

// Thirdweb configuration
export const THIRDWEB_CONFIG = {
  CLIENT_ID: process.env.THIRDWEB_CLIENT_ID || '',
  FACTORY_ADDRESS: process.env.THIRDWEB_FACTORY_ADDRESS || '',
  SPONSOR_GAS: process.env.SPONSOR_GAS === 'true',
}

// WalletConnect or signing service URL (for transaction signing)
export const SIGNING_SERVICE_URL = process.env.SIGNING_SERVICE_URL || 'https://app.uniswap.org'
