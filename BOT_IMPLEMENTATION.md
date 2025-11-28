# Telegram Bot Implementation Guide

## ✅ Implementation Status

The Telegram bot is **fully implemented** and ready for testing!

## 📋 Bot Commands

### Getting Started
- `/start` - Welcome message and onboarding guide
- `/register @username` - Create account and smart wallet automatically

### Wallet & Payments
- `/balance` - Check your token balances (USDC, USDT)
- `/send @username $amount [token]` - Send payment to another user
- `/confirm <tx_hash>` - Verify a completed transaction

### Information
- `/history` - View your transaction history
- `/help` - Show all available commands

## 🔧 How It Works

### Registration Flow
```
User: /register @alice
    ↓
Bot: Validates username format
    ↓
Bot: Checks username availability (on-chain)
    ↓
Bot: Creates Thirdweb smart wallet (deterministic)
    ↓
Bot: Registers username on-chain (free, test phase)
    ↓
Done! User has wallet + username
```

### Payment Flow
```
User: /send @bob $10 USDC
    ↓
Bot: Resolves @bob to wallet address
    ↓
Bot: Prepares transaction data
    ↓
Bot: Checks token allowance
    ↓
Bot: Provides transaction for signing
    ↓
User: Signs transaction (via wallet)
    ↓
User: /confirm <tx_hash>
    ↓
Bot: Verifies transaction on-chain
    ↓
Done! Payment confirmed
```

## 🏗️ Architecture

### Services
- `thirdwebWallet.js` - Smart wallet creation via Thirdweb SDK
- `wallet.js` - Token operations (balance, send, approve)
- `database.js` - SQLite database for caching
- `config.js` - Centralized configuration
- `contracts.js` - Contract interaction helpers

### Database Tables
- `telegram_users` - Maps Telegram IDs to wallet addresses
- `usernames` - Caches username → address mappings
- `payments` - Transaction history
- `receipts` - Payment receipts

## ⚙️ Configuration

### Required Environment Variables

```bash
# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather

# Thirdweb
THIRDWEB_CLIENT_ID=your_thirdweb_client_id

# Relayer (for gas sponsorship)
RELAYER_PRIVATE_KEY=your_relayer_private_key

# Contracts (deployed addresses)
USERNAME_REGISTRY_ADDRESS=0x31a01592aC3B973D1228ff63fe723514aB4c2e4D
SEND_CASH_ADDRESS=0xC59947735AF0bE7FaFe3499A76AFb3D898e80E30

# Tokens
USDC_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e

# Network
BASE_RPC_URL=https://sepolia.base.org
```

### Optional Variables

```bash
THIRDWEB_FACTORY_ADDRESS=0x...  # Optional, has default
SPONSOR_GAS=true  # Enable gasless transactions
PORT=5000  # Server port
APP_URL=http://localhost:3000
```

## 🚀 Starting the Bot

```bash
cd backend
npm start
```

The bot will:
1. Initialize database
2. Connect to Telegram
3. Start listening for commands
4. Serve API endpoints on port 5000

## 🧪 Testing

### Test Registration
1. Open your Telegram bot
2. Send `/start`
3. Send `/register @testuser`
4. Bot creates wallet and registers username

### Test Balance
1. Send `/balance`
2. Bot shows your token balances

### Test Payment
1. Register two users: `/register @alice` and `/register @bob`
2. Fund alice's wallet with USDC
3. Send `/send @bob $10 USDC` from alice
4. Sign transaction
5. Confirm with `/confirm <tx_hash>`

## 📝 Features

### ✅ Implemented
- Automatic smart wallet creation
- Free username registration (test phase)
- Gasless transactions (via Thirdweb)
- Multi-token support
- Transaction history
- Balance checking
- Transaction verification

### 🔄 Flow Details

**Registration:**
- Username validation (3-32 chars, alphanumeric + underscore)
- On-chain availability check
- Deterministic wallet creation
- Free registration (0 USDC fee)

**Payments:**
- Username resolution to address
- Fee calculation (0.5% of amount)
- Token allowance checking
- Transaction preparation
- On-chain verification

## 🔍 Troubleshooting

### Bot Not Responding
- Check `TELEGRAM_BOT_TOKEN` is set correctly
- Verify bot is running: `npm start`
- Check server logs for errors

### Wallet Creation Fails
- Verify `THIRDWEB_CLIENT_ID` is set
- Check Thirdweb dashboard for client ID
- Ensure `SPONSOR_GAS=true` for gasless transactions

### Registration Fails
- Check `RELAYER_PRIVATE_KEY` is set
- Verify relayer has Base Sepolia ETH for gas
- Check contract addresses are correct

### Payment Fails
- Ensure user has token balance
- Check token allowance
- Verify recipient username exists

## 📊 Current Status

- ✅ All commands implemented
- ✅ Database setup complete
- ✅ Thirdweb integration ready
- ✅ Contract addresses configured
- ✅ Ready for testing!

## 🎯 Next Steps

1. **Start the bot**: `cd backend && npm start`
2. **Test registration**: `/register @testuser`
3. **Test balance**: `/balance`
4. **Test payment**: `/send @user $10 USDC`
5. **Monitor logs** for any issues

The bot is ready to use! 🚀


