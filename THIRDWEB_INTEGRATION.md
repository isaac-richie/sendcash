# Thirdweb Account Abstraction Integration

## Overview

SendCash now uses **Thirdweb SDK** for account abstraction instead of custom AccountFactory. This provides:
- ✅ Audited ERC-4337 smart wallets
- ✅ Built-in gas sponsorship
- ✅ Automatic wallet deployment
- ✅ Production-ready infrastructure

## What Changed

### Before (Custom Implementation)
- Custom `AccountFactory` contract
- Custom `SimpleAccount` contract
- Manual CREATE2 wallet creation
- Custom Paymaster

### After (Thirdweb Integration)
- Thirdweb smart wallet factory (pre-deployed)
- Thirdweb smart wallets (audited)
- Automatic wallet creation via SDK
- Built-in gas sponsorship

## Architecture

```
User: /register @alice
    ↓
Bot: Creates Thirdweb smart wallet (deterministic)
    ↓
Thirdweb: Deploys ERC-4337 wallet (lazy deployment)
    ↓
Bot: Registers username in UsernameRegistry
    ↓
Done! @alice → Smart Wallet Address
```

## Setup

### 1. Get Thirdweb Client ID

1. Sign up at [thirdweb.com](https://thirdweb.com)
2. Create a project
3. Get your Client ID from dashboard
4. Add to `.env`: `THIRDWEB_CLIENT_ID=your_client_id`

### 2. Configure Factory Address

Thirdweb provides pre-deployed smart wallet factories. For Scroll Sepolia, you may need to:
- Use Thirdweb's default factory
- Or deploy your own using Thirdweb's factory contract

Update `.env`:
```bash
THIRDWEB_FACTORY_ADDRESS=0x... # Thirdweb factory on Scroll
```

### 3. Enable Gas Sponsorship

Set in `.env`:
```bash
SPONSOR_GAS=true
```

This enables gasless transactions via Thirdweb's infrastructure.

### 4. Optional: Relayer Private Key

If you want to sponsor transactions yourself:
```bash
RELAYER_PRIVATE_KEY=your_private_key
```

Otherwise, Thirdweb can handle sponsorship.

## How It Works

### Wallet Creation

```javascript
// backend/services/thirdwebWallet.js
const { walletAddress, smartWallet } = await createSmartWalletForUsername(username, userId)
```

**What happens:**
1. Creates deterministic personal wallet (from Telegram ID + username)
2. Creates Thirdweb smart wallet configuration
3. Gets deterministic smart wallet address
4. Wallet deploys lazily on first transaction

### Username Registration

```javascript
// Register in your custom UsernameRegistry
await registerUsernameForWallet(username, walletAddress, relayer)
```

**What happens:**
1. Smart wallet is created (or address calculated)
2. Username registered in UsernameRegistry
3. Mapping: `@alice` → `0x1234...` (smart wallet)

## Key Files

### New Files
- `backend/services/thirdwebWallet.js` - Thirdweb wallet creation

### Updated Files
- `backend/bot/handlers.js` - Uses Thirdweb for wallet creation
- `backend/services/config.js` - Thirdweb configuration
- `backend/.env.example` - Thirdweb environment variables

### Unchanged
- `contracts/contracts/UsernameRegistry.sol` - Still used for username mapping
- `contracts/contracts/SendCash.sol` - Payment logic unchanged

## Benefits

1. **No Custom Factory Needed**: Use Thirdweb's audited factory
2. **Gasless by Default**: Built-in sponsorship
3. **Lazy Deployment**: Wallets deploy on first use
4. **Production Ready**: Audited, battle-tested contracts
5. **Less Maintenance**: Thirdweb handles infrastructure

## Migration Notes

### AccountFactory Contract

The custom `AccountFactory.sol` is no longer needed for wallet creation, but:
- Can be kept for reference
- Or removed if not using custom factory
- UsernameRegistry still needed for username mapping

### SimpleAccount Contract

No longer needed - Thirdweb provides smart wallets.

### Paymaster

Thirdweb handles gas sponsorship, but you can still use custom Paymaster if needed.

## Testing

1. Set `THIRDWEB_CLIENT_ID` in `.env`
2. Run bot: `npm start`
3. Test: `/register @testuser`
4. Check: Wallet address should be deterministic
5. Verify: Username registered in UsernameRegistry

## Resources

- [Thirdweb Account Abstraction Docs](https://portal.thirdweb.com/typescript/v5/account-abstraction/get-started)
- [Thirdweb Smart Wallets](https://thirdweb.com/account-abstraction)
- [Thirdweb SDK Reference](https://portal.thirdweb.com/typescript/v5)
