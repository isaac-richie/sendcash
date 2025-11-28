# SendCash Backend - Thirdweb Account Abstraction

Node.js backend with Telegram bot using **Thirdweb SDK** for account abstraction.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Update `.env` with your configuration:
   - `TELEGRAM_BOT_TOKEN` - Get from [@BotFather](https://t.me/BotFather)
   - `THIRDWEB_CLIENT_ID` - Get from [thirdweb.com](https://thirdweb.com) dashboard
   - `THIRDWEB_FACTORY_ADDRESS` - Smart wallet factory address
   - `RELAYER_PRIVATE_KEY` - Relayer wallet private key (for gas sponsorship)
   - Contract addresses (UsernameRegistry, SendCash)
   - `BASE_RPC_URL` - Base Sepolia RPC
   - Token addresses (USDC/USDT)

4. Start server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Telegram Bot Commands

### Getting Started
- `/register @username` - Create account (wallet created automatically via Thirdweb!)

### Wallet Management
- `/balance` - Check your token balances

### Payments
- `/send @username $amount [token]` - Send payment (e.g., `/send @alice $10 USDC`)
- `/confirm <tx_hash>` - Confirm a completed transaction
- `/history` - View transaction history

### Info
- `/start` - Welcome message and help
- `/help` - Show all commands

## How It Works

1. **Account Creation**: Users pick a username via `/register @username`
   - Thirdweb SDK creates ERC-4337 smart wallet automatically
   - Wallet address is deterministic (same inputs = same address)
   - Gasless via Thirdweb infrastructure
   
2. **Username Registration**: Username is registered in UsernameRegistry
   - Links username → wallet address on-chain
   - Sponsored by relayer (gasless for user)

3. **Transaction Preparation**: Bot prepares transaction data when user sends `/send`

4. **Transaction Signing**: User signs transaction (or via relayer for gasless)

5. **Confirmation**: User confirms with `/confirm <tx_hash>` after signing

## Thirdweb Integration

### Smart Wallet Creation

Uses Thirdweb's `createWallet()` function:
- Deterministic wallet addresses
- ERC-4337 compliant
- Built-in gas sponsorship
- Lazy deployment (deployed on first use)

### Gas Sponsorship

Thirdweb handles gas sponsorship automatically when `sponsorGas: true` is set.

## API Endpoints

The backend also provides REST API endpoints (used internally by bot):

### Username
- `GET /api/username/:username` - Lookup address for username
- `GET /api/username/by-address/:address` - Lookup username for address
- `POST /api/username/register` - Register username (cache)

### Payment
- `POST /api/payment/create` - Create payment intent
- `GET /api/payment/:txHash` - Get payment status
- `POST /api/payment/receipt` - Generate shareable receipt
- `POST /api/payment/store` - Store payment after confirmation

### Transactions
- `GET /api/transactions/:address` - Get transaction history

## Database

Uses SQLite for local development. Database file is created at `data/sendcash.db`.

For production, consider using PostgreSQL or another database.

## Environment Variables

- `TELEGRAM_BOT_TOKEN` - Bot token from BotFather
- `THIRDWEB_CLIENT_ID` - Thirdweb Client ID (get from dashboard)
- `THIRDWEB_FACTORY_ADDRESS` - Smart wallet factory address
- `RELAYER_PRIVATE_KEY` - Relayer wallet private key
- `USERNAME_REGISTRY_ADDRESS` - Contract address
- `SEND_CASH_ADDRESS` - Contract address
- `BASE_RPC_URL` - Base Sepolia RPC endpoint
- `USDC_ADDRESS` - USDC token address
- `USDT_ADDRESS` - USDT token address

## Thirdweb Setup

1. **Get Client ID**:
   - Sign up at https://thirdweb.com
   - Create a project
   - Get Client ID from dashboard

2. **Get Factory Address**:
   - Use Thirdweb's pre-deployed factory
   - Or deploy your own factory contract
   - Add to `.env` as `THIRDWEB_FACTORY_ADDRESS`

3. **Set Up Relayer**:
   - Create a wallet for sponsoring gas
   - Fund it with Base Sepolia ETH
   - Add private key to `.env` as `RELAYER_PRIVATE_KEY`
