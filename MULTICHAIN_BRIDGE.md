# 🌉 Multichain Bridge - Jarvis Bridge

## Overview

The SendCash AI agent now supports **true multichain bridging** from Base to **13+ major EVM chains** using Socket Protocol. Users can seamlessly bridge funds across any supported chain for swaps, payments, betting, or any other DeFi activity.

## Supported Chains

### ✅ Fully Supported EVM Chains

1. **Ethereum** (Chain ID: 1)
   - Mainnet: The original Ethereum network
   - USDC: `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48`
   - USDT: `0xdAC17F958D2ee523a2206206994597C13D831ec7`

2. **Base** (Chain ID: 8453 Mainnet, 84532 Sepolia)
   - Layer 2 on Ethereum
   - USDC: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (Mainnet)
   - USDT: `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2` (Mainnet)

3. **Polygon** (Chain ID: 137)
   - Sidechain with low fees
   - USDC: `0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`
   - USDT: `0xc2132D05D31c914a87C6611C10748AEb04B58e8F`

4. **Arbitrum** (Chain ID: 42161)
   - Optimistic rollup
   - USDC: `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`
   - USDT: `0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9`

5. **Optimism** (Chain ID: 10)
   - Optimistic rollup
   - USDC: `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85`
   - USDT: `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58`

6. **Avalanche** (Chain ID: 43114)
   - High-performance blockchain
   - USDC: `0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E`
   - USDT: `0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7`

7. **BNB Chain (BSC)** (Chain ID: 56)
   - Binance Smart Chain
   - USDC: `0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`
   - USDT: `0x55d398326f99059fF775485246999027B3197955`

8. **zkSync Era** (Chain ID: 324)
   - Zero-knowledge rollup
   - USDC: `0x3355df6D4c9C3035724Fd0e3914dE96A5a83aaf4`
   - USDT: `0x493257fD37EDB34451f62EDf8D2a0C418852bA4C`

9. **Linea** (Chain ID: 59144)
   - ConsenSys zkEVM
   - USDC: `0x176211869cA2b568f2A7D4EE941E073a821EE1ff`

10. **Scroll** (Chain ID: 534352)
    - Native zkEVM
    - USDC: `0x06eFdBFf2a14a7c8E15953D5F4e6545F93d9d7C3`

11. **Mantle** (Chain ID: 5000)
    - Modular L2
    - USDC: `0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9`

12. **Blast** (Chain ID: 81457)
    - Native yield L2
    - USDC: `0x4300000000000000000000000000000000000003`

## Supported Tokens

- **USDC** (USD Coin) - Available on all chains
- **USDT** (Tether) - Available on all chains

## Usage Examples

### Bridge Funds

Users can bridge funds using natural language:

```
"Bridge $10 USDC to Polygon"
"Bridge $50 to Arbitrum"
"Move funds to Optimism"
"Send $25 to Ethereum"
"Bridge to Avalanche"
"Bridge $100 USDT to BSC"
```

### Check Cross-Chain Balances

```
"My balance on Polygon"
"Check Polygon balance"
"Check balances across chains"
"Show my Arbitrum balance"
```

### AI Agent Recognition

The AI agent recognizes chain names in multiple formats:
- **Ethereum**: "ethereum", "eth"
- **Base**: "base"
- **Polygon**: "polygon"
- **Arbitrum**: "arbitrum", "arb"
- **Optimism**: "optimism", "op"
- **Avalanche**: "avalanche", "avax"
- **BSC**: "bsc", "binance", "bnb"
- **zkSync**: "zksync", "zksync era"
- **Linea**: "linea"
- **Scroll**: "scroll"
- **Mantle**: "mantle"
- **Blast**: "blast"

## Technical Details

### Socket Protocol Integration

The bridge uses [Socket Protocol](https://socket.tech/) for cross-chain transfers:
- **API Endpoint**: `https://api.socket.tech/v2`
- **API Key**: Required for production (set `SOCKET_API_KEY` in `.env`)
- **Supported Routes**: All EVM-to-EVM routes via Socket's liquidity network

### Bridge Flow

1. **User Request**: User asks to bridge funds via natural language
2. **Intent Extraction**: AI agent extracts amount, token, and destination chain
3. **Quote Fetching**: Get bridge quote from Socket API
4. **Balance Check**: Verify user has sufficient funds on source chain
5. **Token Approval**: Approve bridge contract if needed
6. **Bridge Execution**: Execute bridge transaction via smart wallet
7. **Transaction Tracking**: Store bridge transaction in database

### Database Schema

Bridge transactions are stored in `bridge_transactions` table:
- `user_id`: Telegram user ID
- `from_chain`: Source chain ID
- `to_chain`: Destination chain ID
- `token_symbol`: Token symbol (USDC/USDT)
- `amount`: Amount bridged
- `tx_hash`: Transaction hash
- `status`: Transaction status (pending/completed/failed)
- `estimated_time`: Estimated bridge time in seconds
- `created_at`: Timestamp

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Socket Protocol API Key (required for production)
SOCKET_API_KEY=your_socket_api_key_here

# Optional: Custom RPC URLs for specific chains
ETHEREUM_RPC_URL=https://eth.llamarpc.com
POLYGON_RPC_URL=https://polygon-rpc.com
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
OPTIMISM_RPC_URL=https://mainnet.optimism.io
AVALANCHE_RPC_URL=https://api.avax.network/ext/bc/C/rpc
BSC_RPC_URL=https://bsc-dataseed.binance.org
ZKSYNC_RPC_URL=https://mainnet.era.zksync.io
LINEA_RPC_URL=https://rpc.linea.build
SCROLL_RPC_URL=https://rpc.scroll.io
MANTLE_RPC_URL=https://rpc.mantle.xyz
BLAST_RPC_URL=https://rpc.blast.io
```

## Features

### ✅ Implemented

- [x] Multichain support (13+ EVM chains)
- [x] USDC/USDT bridging
- [x] Natural language bridge requests
- [x] Cross-chain balance checking
- [x] Bridge need detection (auto-detects when bridge is needed)
- [x] Bridge quote fetching
- [x] Smart wallet integration
- [x] Transaction tracking
- [x] Error handling

### 🚀 Future Enhancements

- [ ] Auto-bridging (bridge automatically when needed)
- [ ] Bridge status tracking and notifications
- [ ] Bridge history and analytics
- [ ] Support for more tokens (ETH, native tokens)
- [ ] Bridge fee estimation
- [ ] Multi-hop bridging
- [ ] Bridge comparison (show best route)

## Use Cases

1. **Polymarket Betting**: Bridge funds from Base to Polygon for betting
2. **DeFi Swaps**: Bridge to Arbitrum/Optimism for better swap rates
3. **Cross-Chain Payments**: Send funds to any supported chain
4. **Yield Farming**: Bridge to chains with better yield opportunities
5. **NFT Purchases**: Bridge to chains with specific NFT collections

## Testing

Run the bridge simulation test:

```bash
cd backend
node tests/test-bridge-simulation.js
```

## Related Files

- `backend/services/bridgeService.js` - Bridge service implementation
- `backend/services/aiAgent.js` - AI agent bridge integration
- `backend/services/database.js` - Database schema for bridge transactions
- `backend/tests/test-bridge-simulation.js` - Bridge simulation tests

## Notes

- Socket Protocol requires an API key for production use
- Bridge times vary by chain (typically 2-10 minutes)
- Gas fees are paid on the source chain
- Some chains may have minimum bridge amounts



