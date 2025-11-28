# SendCash Setup Guide - Thirdweb Account Abstraction

Complete setup instructions for SendCash with automatic wallet creation via Thirdweb SDK.

## Prerequisites

- Node.js 18+ and npm
- Telegram account
- Scroll Sepolia testnet ETH (for deployment gas only - users don't need it!)

## Key Feature: Zero-Friction Onboarding

Users just pick a username - no wallet connection needed! The system automatically creates an ERC-4337 smart contract wallet for them.

## 1. Smart Contracts Setup

```bash
cd contracts
npm install
cp .env.example .env
# Edit .env with your private key and RPC URL
```

Deploy contracts:
```bash
npm run compile
npm run deploy:scroll
```

This will deploy:
1. UsernameRegistry - Maps usernames to addresses
2. SendCash - Payment contract

**Note**: We use Thirdweb SDK for wallet creation, so AccountFactory and Paymaster are not needed.

**Save contract addresses!**

## 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `TELEGRAM_BOT_TOKEN` - Get from [@BotFather](https://t.me/BotFather)
- All contract addresses from step 1
- `SCROLL_RPC_URL` - Scroll Sepolia RPC
- `USDC_ADDRESS` - USDC token address on Scroll Sepolia
- `USDT_ADDRESS` - USDT token address on Scroll Sepolia

Start backend:
```bash
npm start
```

## 3. Telegram Bot Setup

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token to backend `.env` as `TELEGRAM_BOT_TOKEN`
4. Test with `/start` command

## 4. Testing Flow

### New User Onboarding

1. Open your Telegram bot
2. Send `/start` to see welcome message
3. **Pick a username**: `/register @alice`
   - Bot creates wallet automatically
   - No MetaMask or wallet connection needed!
4. Check balance: `/balance`
5. Send payment: `/send @bob $10 USDC`
6. View history: `/history`

### How It Works

1. User sends `/register @alice`
2. Bot checks username availability
3. Bot calculates wallet address (deterministic from username)
4. Wallet is created on first use (or by relayer)
5. Username is registered on-chain
6. User can immediately receive payments!

## 5. Adding Supported Tokens

After deployment, add supported tokens to SendCash contract:

```javascript
// In Hardhat console or script
const sendCash = await ethers.getContractAt("SendCash", SEND_CASH_ADDRESS)
await sendCash.addSupportedToken(USDC_ADDRESS)
await sendCash.addSupportedToken(USDT_ADDRESS)
```

## Architecture

### Thirdweb Account Abstraction

- **Thirdweb Smart Wallets**: ERC-4337 compliant, audited smart wallets
- **Thirdweb Factory**: Pre-deployed factory for wallet creation
- **Gas Sponsorship**: Built-in via Thirdweb infrastructure
- **UsernameRegistry**: Custom contract for username → address mapping

### User Flow

```
User: /register @alice
  ↓
Bot: Checks availability
  ↓
Bot: Calculates wallet address (deterministic)
  ↓
Bot: Stores mapping (username → wallet)
  ↓
On first payment/receive:
  ↓
Wallet created on-chain (sponsored by paymaster)
  ↓
Username registered in UsernameRegistry
  ↓
User can send/receive payments!
```

## Benefits

✅ **Zero friction**: No wallet connection needed
✅ **Gasless**: First transactions sponsored by paymaster
✅ **Simple**: Users just pick a username
✅ **Educational**: Users learn blockchain gradually
✅ **Secure**: ERC-4337 smart contract wallets

## Troubleshooting

### Bot not responding
- Check `TELEGRAM_BOT_TOKEN` in backend `.env`
- Ensure backend is running
- Check bot logs

### Wallet creation fails
- Verify contract addresses in `.env`
- Check AccountFactory is deployed
- Ensure EntryPoint address is correct

### Username registration fails
- Check username format (alphanumeric + underscore only)
- Verify username is available
- Check UsernameRegistry contract

### Transaction confirmation fails
- Verify transaction hash is correct
- Check transaction on block explorer
- Ensure transaction was actually sent

## Demo Flow for Hackathon

1. Show `/start` command
2. Demonstrate `/register @demo` - wallet created instantly
3. Show `/balance` - check balance (even if $0)
4. Send test payment with `/send`
5. Show transaction confirmation
6. View history with `/history`

## Next Steps

- Set up relayer for automatic wallet creation
- Configure paymaster with funds for gasless transactions
- Add more supported tokens
- Implement social recovery for wallets
