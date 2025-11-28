# Environment Variables Reference

Complete list of all environment variables used in SendCash project.

## 📋 Backend Environment Variables

### Required Variables

#### Telegram Bot
```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```
- **Description**: Token from @BotFather for Telegram bot
- **Where**: `backend/server.js`
- **Required**: ✅ Yes

#### Contract Addresses
```bash
USERNAME_REGISTRY_ADDRESS=0x...
SEND_CASH_ADDRESS=0x...
```
- **Description**: Deployed contract addresses on Base Sepolia
- **Where**: `backend/services/config.js`
- **Required**: ✅ Yes (after deployment)

#### Network Configuration
```bash
BASE_RPC_URL=https://sepolia.base.org
```
- **Description**: Base Sepolia RPC endpoint
- **Where**: `backend/services/config.js`, `backend/services/thirdwebWallet.js`
- **Default**: `https://sepolia.base.org`
- **Required**: ⚠️ Optional (has default)

#### Token Addresses
```bash
USDC_ADDRESS=0x...
USDT_ADDRESS=0x...
```
- **Description**: ERC-20 token addresses on Base Sepolia
- **Where**: `backend/services/config.js`
- **Required**: ✅ Yes (for payments to work)

#### Thirdweb Configuration
```bash
THIRDWEB_CLIENT_ID=your_thirdweb_client_id
```
- **Description**: Thirdweb Client ID for account abstraction
- **Where**: `backend/services/thirdwebWallet.js`
- **Required**: ✅ Yes (for smart wallet creation)

#### Relayer (Gas Sponsorship)
```bash
RELAYER_PRIVATE_KEY=your_relayer_private_key
```
- **Description**: Private key of wallet that sponsors gas fees
- **Where**: `backend/services/thirdwebWallet.js`
- **Required**: ✅ Yes (for gasless transactions)

### Optional Variables

#### Thirdweb Factory
```bash
THIRDWEB_FACTORY_ADDRESS=0x...
```
- **Description**: Thirdweb smart wallet factory address
- **Where**: `backend/services/thirdwebWallet.js`
- **Default**: `0x00000000fC1237824fb747aBDE0CD183d8C90270`
- **Required**: ⚠️ Optional (has default)

#### Gas Sponsorship
```bash
SPONSOR_GAS=true
```
- **Description**: Enable gasless transactions via Thirdweb
- **Where**: `backend/services/thirdwebWallet.js`
- **Default**: `false` (if not set)
- **Required**: ⚠️ Optional (recommended: `true`)

#### Entry Point
```bash
ENTRY_POINT_ADDRESS=0x...
```
- **Description**: ERC-4337 EntryPoint contract address
- **Where**: `backend/services/config.js`
- **Default**: `0x0000000071727De22E5E9d8BAf0BaAc3cC26537` (standard)
- **Required**: ⚠️ Optional (has default)

#### Application URL
```bash
APP_URL=http://localhost:3000
```
- **Description**: Base URL for the application
- **Where**: `backend/services/config.js`, `backend/bot/handlers.js`
- **Default**: `http://localhost:3000`
- **Required**: ⚠️ Optional (has default)

#### Server Port
```bash
PORT=5000
```
- **Description**: Backend server port
- **Where**: `backend/server.js`
- **Default**: `5000`
- **Required**: ⚠️ Optional (has default)

#### Signing Service URL
```bash
SIGNING_SERVICE_URL=https://app.uniswap.org
```
- **Description**: URL for transaction signing service
- **Where**: `backend/services/config.js`, `backend/bot/handlers.js`
- **Default**: `https://app.uniswap.org`
- **Required**: ⚠️ Optional (has default)

---

## 📋 Contracts Environment Variables

### Required Variables

#### Deployment Account
```bash
PRIVATE_KEY=your_deployer_private_key
```
- **Description**: Private key of account deploying contracts
- **Where**: `contracts/hardhat.config.js`
- **Required**: ✅ Yes (for deployment)

#### USDC Address (for Deployment)
```bash
USDC_ADDRESS=0x...
```
- **Description**: USDC token address (passed to UsernameRegistry constructor)
- **Where**: `contracts/scripts/deploy.js`
- **Required**: ✅ Yes (deployment will fail without it)

### Optional Variables

#### Base Sepolia RPC
```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```
- **Description**: Base Sepolia RPC for Hardhat
- **Where**: `contracts/hardhat.config.js`
- **Default**: `https://sepolia.base.org`
- **Required**: ⚠️ Optional (has default)

#### Basescan API Key
```bash
BASESCAN_API_KEY=your_basescan_api_key
```
- **Description**: API key for Base Sepolia block explorer verification
- **Where**: `contracts/hardhat.config.js`
- **Required**: ⚠️ Optional (only for contract verification)

---

## 📝 Complete .env Example

### Backend `.env` (in `backend/` directory)

```bash
# ============================================
# REQUIRED - Telegram Bot
# ============================================
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather

# ============================================
# REQUIRED - Contract Addresses (after deployment)
# ============================================
USERNAME_REGISTRY_ADDRESS=0x...
SEND_CASH_ADDRESS=0x...

# ============================================
# REQUIRED - Network Configuration
# ============================================
BASE_RPC_URL=https://sepolia.base.org

# ============================================
# REQUIRED - Token Addresses (Base Sepolia)
# ============================================
USDC_ADDRESS=0x...  # Base Sepolia USDC
USDT_ADDRESS=0x...  # Base Sepolia USDT

# ============================================
# REQUIRED - Thirdweb Account Abstraction
# ============================================
THIRDWEB_CLIENT_ID=your_thirdweb_client_id
RELAYER_PRIVATE_KEY=your_relayer_private_key

# ============================================
# OPTIONAL - Thirdweb Configuration
# ============================================
THIRDWEB_FACTORY_ADDRESS=0x...  # Optional, has default
SPONSOR_GAS=true  # Enable gasless transactions

# ============================================
# OPTIONAL - Application Settings
# ============================================
APP_URL=http://localhost:3000
PORT=5000
ENTRY_POINT_ADDRESS=0x0000000071727De22E5E9d8BAf0BaAc3cC26537
SIGNING_SERVICE_URL=https://app.uniswap.org
```

### Contracts `.env` (in `contracts/` directory)

```bash
# ============================================
# REQUIRED - Deployment
# ============================================
PRIVATE_KEY=your_deployer_private_key
USDC_ADDRESS=0x...  # Base Sepolia USDC address

# ============================================
# OPTIONAL - Network & Verification
# ============================================
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASESCAN_API_KEY=your_basescan_api_key  # For contract verification
```

---

## 🔍 Variable Usage by File

### Backend Files

| File | Variables Used |
|------|---------------|
| `backend/server.js` | `TELEGRAM_BOT_TOKEN`, `PORT` |
| `backend/services/config.js` | `USERNAME_REGISTRY_ADDRESS`, `SEND_CASH_ADDRESS`, `ENTRY_POINT_ADDRESS`, `BASE_RPC_URL`, `USDC_ADDRESS`, `USDT_ADDRESS`, `THIRDWEB_CLIENT_ID`, `THIRDWEB_FACTORY_ADDRESS`, `SPONSOR_GAS`, `APP_URL`, `SIGNING_SERVICE_URL` |
| `backend/services/thirdwebWallet.js` | `THIRDWEB_CLIENT_ID`, `BASE_RPC_URL`, `RELAYER_PRIVATE_KEY`, `THIRDWEB_FACTORY_ADDRESS`, `SPONSOR_GAS` |
| `backend/bot/handlers.js` | `BASE_RPC_URL`, `APP_URL`, `SIGNING_SERVICE_URL` |
| `backend/routes/payment.js` | `APP_URL` |

### Contracts Files

| File | Variables Used |
|------|---------------|
| `contracts/hardhat.config.js` | `BASE_SEPOLIA_RPC_URL`, `PRIVATE_KEY`, `BASESCAN_API_KEY` |
| `contracts/scripts/deploy.js` | `USDC_ADDRESS` |

---

## ✅ Quick Setup Checklist

### Backend Setup
- [ ] `TELEGRAM_BOT_TOKEN` - Get from @BotFather
- [ ] `THIRDWEB_CLIENT_ID` - Get from thirdweb.com dashboard
- [ ] `RELAYER_PRIVATE_KEY` - Create wallet for gas sponsorship
- [ ] `USERNAME_REGISTRY_ADDRESS` - After contract deployment
- [ ] `SEND_CASH_ADDRESS` - After contract deployment
- [ ] `USDC_ADDRESS` - Base Sepolia USDC address
- [ ] `USDT_ADDRESS` - Base Sepolia USDT address (optional)
- [ ] `BASE_RPC_URL` - Optional (has default)
- [ ] `SPONSOR_GAS=true` - Recommended

### Contracts Setup
- [ ] `PRIVATE_KEY` - Deployer wallet private key
- [ ] `USDC_ADDRESS` - Base Sepolia USDC address
- [ ] `BASE_SEPOLIA_RPC_URL` - Optional (has default)
- [ ] `BASESCAN_API_KEY` - Optional (for verification only)

---

## 🔐 Security Notes

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Private keys** - Keep secure, never share
3. **Bot tokens** - Keep private, rotate if compromised
4. **Use different keys** - Separate deployer and relayer keys
5. **Testnet vs Mainnet** - Use different keys for each

---

## 📚 Where to Get Values

### Telegram Bot Token
1. Open Telegram
2. Search for @BotFather
3. Send `/newbot`
4. Follow instructions
5. Copy token

### Thirdweb Client ID
1. Go to [thirdweb.com](https://thirdweb.com)
2. Sign up / Log in
3. Create project
4. Copy Client ID from dashboard

### Base Sepolia Token Addresses
- Check Base documentation
- Use Base Sepolia block explorer
- Check Thirdweb dashboard

### Base Sepolia RPC
- Public: `https://sepolia.base.org`
- Or use Alchemy/Infura endpoint

---

## 🚨 Common Issues

### Missing Required Variables
- **Error**: `RELAYER_PRIVATE_KEY not set in .env`
- **Fix**: Add `RELAYER_PRIVATE_KEY` to backend `.env`

### Wrong Network
- **Error**: Contract calls failing
- **Fix**: Ensure `BASE_RPC_URL` points to Base Sepolia

### Token Address Wrong
- **Error**: Token transfers failing
- **Fix**: Verify `USDC_ADDRESS` is correct Base Sepolia address

---

## 📖 Related Documentation

- `SETUP.md` - Full setup guide
- `THIRDWEB_INTEGRATION.md` - Thirdweb setup
- `README.md` - Project overview


