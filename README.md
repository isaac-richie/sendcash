# 💸 SendCash by Username

**Venmo for crypto, powered by ERC-4337 account abstraction**

Send money via @username - no addresses, no gas fees, zero friction. Just pick a username and start sending.

---

## 🎯 What We're Building

SendCash is a **Venmo-like crypto payment system** that makes sending cryptocurrency as simple as sending a text message. Users can send and receive payments using memorable @usernames instead of long, error-prone wallet addresses.

### Key Features

- 🚀 **Zero-Friction Onboarding**: Just pick a @username - wallet is created automatically
- 💸 **Send via Username**: Send money to `@alice` instead of `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- ⛽ **Gasless Transactions**: Powered by ERC-4337 account abstraction - users never pay gas
- 📱 **Telegram Bot Interface**: Everything works directly in Telegram - no external apps needed
- 🔔 **Real-Time Notifications**: Get notified instantly when you receive payments
- 🔒 **Smart Wallets**: ERC-4337 compliant smart contract wallets for enhanced security
- 🌐 **Built on Base**: Leveraging Base Sepolia for fast, cheap transactions

---

## 🚨 Problems We're Solving

### 1. **Complex Wallet Setup**
**Problem**: Traditional crypto wallets require:
- Downloading apps
- Writing down seed phrases
- Understanding private keys
- Managing multiple addresses

**Solution**: SendCash auto-creates smart wallets when users pick a username. No seed phrases, no downloads, no complexity.

### 2. **Address Errors**
**Problem**: 
- Long, confusing addresses like `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- One typo = lost funds forever
- Hard to remember or share

**Solution**: Use memorable @usernames like `@alice` or `@bob`. Easy to remember, easy to share, impossible to mistype.

### 3. **Gas Fees**
**Problem**: 
- Users need ETH to pay for transactions
- High gas costs on mainnet
- Confusing gas estimation
- Failed transactions still cost gas

**Solution**: ERC-4337 account abstraction with gas sponsorship. Users never see or pay gas fees - transactions are completely gasless.

### 4. **Poor User Experience**
**Problem**: 
- Multiple apps and wallets to manage
- Complex transaction flows
- No notifications
- Requires blockchain knowledge

**Solution**: Everything works in Telegram. Send payments like texting. Get instant notifications. No blockchain knowledge required.

### 5. **Onboarding Friction**
**Problem**: 
- New users need to:
  - Understand wallets
  - Buy ETH for gas
  - Learn about addresses
  - Navigate complex UIs

**Solution**: Pick a username → Start sending. That's it. Zero learning curve.

---

## 🏗️ How It Works

### 1. **Registration**
```
User: /register @alice
Bot: ✅ Wallet created! Username registered on-chain.
```

A smart wallet is automatically created and linked to `@alice` on-chain.

### 2. **Sending Payments**
```
User: /send @bob $10 USDC
Bot: ✅ Payment sent! @bob will be notified.
```

The payment is executed via the smart wallet (gasless), and the recipient gets a notification.

### 3. **Receiving Payments**
```
@bob receives: 💰 You received $10 USDC from @alice!
```

Recipients are automatically notified when payments arrive.

---

## 🛠️ Tech Stack

### Smart Contracts
- **Solidity** + **Hardhat** for contract development
- **ERC-4337** account abstraction standard
- **Base Sepolia** testnet
- **OpenZeppelin** for security

### Backend
- **Node.js** + **Express** for API
- **Thirdweb SDK** for account abstraction
- **Telegram Bot API** for user interface
- **SQLite** for local data storage

### Key Contracts
- `UsernameRegistry.sol` - Maps usernames to wallet addresses
- `SendCash.sol` - Payment execution with 0.5% fee
- Smart Wallets - ERC-4337 compliant (via Thirdweb)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- Telegram Bot Token (from [@BotFather](https://t.me/BotFather))
- Thirdweb Client ID (from [thirdweb.com](https://thirdweb.com))

### Installation

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd sendcash
```

2. **Install dependencies**
```bash
# Backend
cd backend
npm install

# Contracts
cd ../contracts
npm install
```

3. **Configure environment**
```bash
cd backend
cp .env.example .env
```

Update `.env` with:
- `TELEGRAM_BOT_TOKEN` - Your Telegram bot token
- `THIRDWEB_CLIENT_ID` - Thirdweb client ID
- `RELAYER_PRIVATE_KEY` - Wallet for sponsoring gas
- Contract addresses (after deployment)
- Token addresses (USDC/USDT on Base Sepolia)

4. **Deploy contracts**
```bash
cd contracts
npx hardhat run scripts/deploy.js --network baseSepolia
```

5. **Start the bot**
```bash
cd backend
npm start
```

---

## 📱 Bot Commands

### Getting Started
- `/start` - Welcome message and setup
- `/register @username` - Create account and pick username
- `/help` - Show all commands

### Wallet & Payments
- `/balance` - Check token balances (shows wallet address)
- `/send @username $amount [token]` - Send payment
- `/history` - View transaction history

### Examples
```
/register @alice
/send @bob $10 USDC
/balance
```

---

## 🎓 Key Concepts

### Account Abstraction (ERC-4337)
Instead of traditional wallets, SendCash uses **smart contract wallets** that:
- Can be created deterministically (same inputs = same address)
- Support gas sponsorship (users don't pay gas)
- Enable advanced features (recovery, multi-sig, etc.)

### Username Registry
On-chain mapping of usernames to wallet addresses:
- `@alice` → `0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb`
- Permanent and verifiable on-chain
- Premium usernames available (non-transferable)

### Gas Sponsorship
Transactions are sponsored by a relayer, so users never pay gas:
- First transaction deploys wallet (sponsored)
- All subsequent transactions are gasless
- Powered by Thirdweb's infrastructure

---

## 🔐 Security

- **Non-Custodial**: Users control their wallets
- **Smart Contract Security**: Audited OpenZeppelin contracts
- **Deterministic Wallets**: Same username + Telegram ID = same wallet
- **On-Chain Verification**: All usernames verified on-chain
- **Private Keys**: Generated deterministically, never stored

---

## 📊 Current Status

✅ **Completed**
- Username registration system
- Smart wallet creation (ERC-4337)
- Payment sending via @username
- Gasless transactions
- Real-time payment notifications
- Balance checking
- Transaction history
- Telegram bot interface

🚧 **In Progress**
- Premium usernames
- Payment requests
- Multi-token support

💡 **Future Features**
- Payment splitting
- Recurring payments
- QR code payments
- Mobile app

---

## 🤝 Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- **Thirdweb** for account abstraction SDK
- **Base** for L2 infrastructure
- **OpenZeppelin** for secure contract libraries
- **ERC-4337** community for the standard

---

## 📞 Contact

- **Twitter**: [@yourhandle](https://twitter.com/yourhandle)
- **Telegram**: [@SendCashBot](https://t.me/yourbot)
- **Website**: Coming soon

---

**Built with ❤️ for the Web3 community**

*Making crypto payments as simple as sending a text message.*
