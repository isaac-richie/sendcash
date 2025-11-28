# SendCash by Username - Project Summary (Updated)

## Overview

SendCash is a Venmo-like crypto payment system that allows users to send money via @username mentions. **All functionality is handled directly through Telegram bot commands** with **ERC-4337 account abstraction** for zero-friction onboarding - users just pick a username!

## Project Structure

```
sendcash/
├── contracts/          # Smart contracts (Hardhat)
│   ├── contracts/
│   │   ├── UsernameRegistry.sol
│   │   ├── SimpleAccount.sol      # ERC-4337 account
│   │   ├── AccountFactory.sol     # Wallet factory
│   │   ├── SendCash.sol
│   │   └── Paymaster.sol
│   └── scripts/
└── backend/           # Node.js API + Telegram Bot
    ├── routes/        # API endpoints
    ├── services/      # Wallet, contracts, accountFactory, database
    └── bot/           # Telegram bot handlers
```

## Features Implemented

### ✅ Smart Contracts
- **SimpleAccount**: ERC-4337 compatible smart contract wallet
- **AccountFactory**: Creates wallets automatically when users pick username
- **UsernameRegistry**: Maps usernames to addresses, handles registration
- **SendCash**: Payment contract with 0.5% fee for sends >$50
- **Paymaster**: Gasless transaction sponsorship

### ✅ Telegram Bot (All-in-One)
- **Account Creation**: `/register @username` - Creates wallet automatically!
- **Balance Checking**: `/balance` to view token balances
- **Payment Sending**: `/send @username $amount [token]` to send payments
- **Transaction History**: `/history` to view past transactions
- **Transaction Confirmation**: `/confirm <tx_hash>` to verify payments

### ✅ Backend Services
- Transaction preparation and validation
- Username lookup (on-chain + cache)
- Payment tracking and storage
- Token balance checking
- Transaction verification

### ✅ Database
- SQLite for local development
- Stores user wallet addresses
- Caches username mappings
- Tracks payment history

## How It Works

1. **User picks username**: `/register @alice` - wallet created automatically!
2. **Bot creates wallet**: Deterministic wallet address calculated and stored
3. **User sends payment**: `/send @bob $10 USDC`
4. **Bot prepares transaction**: Validates username, calculates fees, prepares tx data
5. **Bot shows transaction**: User sees transaction details in Telegram
6. **User signs in wallet**: Uses wallet to sign (or relayer sponsors gas)
7. **User confirms**: `/confirm 0x...` with transaction hash
8. **Bot verifies**: Checks on-chain and confirms payment

## Tech Stack

- **Smart Contracts**: Solidity + Hardhat
- **Backend**: Node.js + Express + SQLite
- **Telegram**: node-telegram-bot-api
- **Web3**: ethers.js
- **Blockchain**: Scroll L2 (Sepolia testnet)

## Key Files

### Contracts
- `contracts/contracts/UsernameRegistry.sol` - Username mapping
- `contracts/contracts/SendCash.sol` - Payment logic
- `contracts/scripts/deploy.js` - Deployment script

### Backend
- `backend/server.js` - Express server + bot initialization
- `backend/bot/handlers.js` - All Telegram bot commands
- `backend/services/wallet.js` - Transaction preparation
- `backend/services/database.js` - Database operations

## Bot Commands Reference

### Getting Started
- `/register @username` - Create account (pick username, wallet created automatically!)

### Wallet & Payments
- `/balance` - Check token balances
- `/send @username $amount [token]` - Send payment
- `/confirm <tx_hash>` - Confirm transaction
- `/history` - View transaction history

### Info
- `/start` - Welcome message
- `/help` - Show all commands

## Next Steps for Hackathon

1. **Deploy Contracts**
   - Deploy to Scroll Sepolia
   - Add USDC/USDT token addresses
   - Configure paymaster

2. **Deploy Backend**
   - Set up Telegram bot with @BotFather
   - Deploy to Railway/Render/Fly.io
   - Configure environment variables

3. **Test Flow**
   - Connect wallet
   - Register username
   - Send test payment
   - Verify transaction

4. **Demo Preparation**
   - Prepare demo script
   - Create test accounts
   - Test all commands

## Demo Flow

1. Show `/start` command in Telegram
2. Connect wallet with `/connect`
3. Check balance with `/balance`
4. Register username with `/register @demo`
5. Send payment with `/send @recipient $10 USDC`
6. Show transaction preparation
7. Demonstrate signing and confirmation
8. View history with `/history`

## Environment Variables Needed

### Backend
- `TELEGRAM_BOT_TOKEN` - Bot token from BotFather
- `USERNAME_REGISTRY_ADDRESS` - Contract address
- `SEND_CASH_ADDRESS` - Contract address
- `PAYMASTER_ADDRESS` - Contract address
- `SCROLL_RPC_URL` - Scroll RPC
- `USDC_ADDRESS` - USDC token address
- `USDT_ADDRESS` - USDT token address

## Advantages of ERC-4337 + Bot Approach

- ✅ **Zero friction onboarding** - Just pick a username!
- ✅ **No wallet setup** - Wallet created automatically
- ✅ **Gasless transactions** - First transactions sponsored
- ✅ **No external apps** - Everything in Telegram
- ✅ **Simple UX** - Users don't need blockchain knowledge
- ✅ **Educational** - Learn blockchain gradually
- ✅ **Secure** - ERC-4337 smart contract wallets
- ✅ **Easy to demo** - Perfect for hackathon

## Notes

- Users must sign transactions in their own wallets
- Bot only prepares and verifies transactions
- No private keys stored - fully non-custodial
- For production, add rate limiting and spam protection
- Consider adding transaction status polling for better UX
