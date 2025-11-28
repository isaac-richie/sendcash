# USDC Registration Fees Implementation

## Overview

Updated UsernameRegistry to use USDC fees instead of native ETH:
- **Regular username registration**: 1 USDC
- **Premium username registration**: 10 USDC

## Changes Made

### 1. Contract Updates (`UsernameRegistry.sol`)

#### Added USDC Token Support
- Added `IERC20` and `SafeERC20` imports
- Added `usdcToken` state variable
- Constructor now requires USDC token address

#### Fee Structure
```solidity
uint256 public registrationFee = 1 * 10**6;  // 1 USDC (6 decimals)
uint256 public premiumFee = 10 * 10**6;       // 10 USDC (6 decimals)
```

#### Updated Functions

**`registerUsername()`**
- Now requires 1 USDC fee payment
- Uses `usdcToken.safeTransferFrom()` to collect fee

**`registerUsernameForAddress()`**
- Added `feePayer` parameter (allows relayer to pay)
- Collects 1 USDC from `feePayer` address

**`registerPremiumUsername()`**
- Changed from `payable` (ETH) to USDC payment
- Now requires 10 USDC fee

**`withdrawFees()`**
- Updated to withdraw USDC instead of ETH
- Uses `usdcToken.safeTransfer()` to owner

#### New Functions
- `setRegistrationFee()` - Owner can update regular fee
- `getFeeBalance()` - View current USDC balance in contract

### 2. Backend Updates

#### `thirdwebWallet.js`
- Updated `registerUsernameInRegistry()` to:
  - Accept `feePayer` parameter
  - Check relayer USDC balance
  - Approve USDC if needed
  - Pass `feePayer` to contract

#### `accountFactory.js`
- Updated `registerUsernameForWallet()` to:
  - Accept `feePayer` parameter
  - Handle USDC approval
  - Support fee payment from relayer or user

#### `handlers.js`
- Updated registration flow to show fee information
- Better error messages for fee-related failures

### 3. Deployment Script

#### `deploy.js`
- Now requires `USDC_ADDRESS` environment variable
- Passes USDC address to UsernameRegistry constructor
- Shows fee information in deployment summary

## Deployment Instructions

### 1. Set USDC Address

In `contracts/.env`:
```bash
USDC_ADDRESS=0x... # Scroll Sepolia USDC address
```

### 2. Deploy Contracts

```bash
cd contracts
npm run deploy:scroll
```

The script will:
- Check for USDC_ADDRESS
- Deploy UsernameRegistry with USDC address
- Show fee information

### 3. Relayer Setup

Ensure relayer has USDC to pay registration fees:

```javascript
// Relayer needs at least 1 USDC per registration
// Approve UsernameRegistry to spend USDC:
const usdc = new ethers.Contract(USDC_ADDRESS, [...], relayer);
await usdc.approve(USERNAME_REGISTRY_ADDRESS, ethers.MaxUint256);
```

## Usage

### Regular Registration (1 USDC)

**Via Bot:**
```
/register @username
```
- Relayer pays 1 USDC fee
- User gets wallet + username

**Direct Contract Call:**
```solidity
// User must approve USDC first
usdc.approve(registryAddress, 1 * 10**6);
registry.registerUsername("alice");
```

### Premium Registration (10 USDC)

**Direct Contract Call:**
```solidity
// User must approve USDC first
usdc.approve(registryAddress, 10 * 10**6);
registry.registerPremiumUsername("vip");
```

### Relayer-Paid Registration

When using `registerUsernameForAddress()`:
```javascript
// Relayer pays fee
await registry.registerUsernameForAddress(
  "alice",
  walletAddress,
  relayerAddress  // feePayer
);
```

## Fee Management

### Owner Functions

**Update Fees:**
```solidity
registry.setRegistrationFee(2 * 10**6);  // Change to 2 USDC
registry.setPremiumFee(20 * 10**6);      // Change to 20 USDC
```

**Withdraw Fees:**
```solidity
registry.withdrawFees();  // Sends all USDC to owner
```

**Check Balance:**
```solidity
uint256 balance = registry.getFeeBalance();
```

## Important Notes

1. **USDC Decimals**: USDC uses 6 decimals, so:
   - 1 USDC = 1,000,000 (1 * 10^6)
   - 10 USDC = 10,000,000 (10 * 10^6)

2. **Approval Required**: Users/relayers must approve USDC before registration

3. **Relayer Balance**: Ensure relayer has sufficient USDC for registrations

4. **Gas Costs**: Registration still requires gas (for transaction), but fee is in USDC

## Migration Notes

If upgrading from old contract:
- Old contract used ETH for premium fees
- New contract uses USDC for all fees
- Need to redeploy UsernameRegistry
- Update all contract addresses in backend `.env`

## Testing

1. **Test Regular Registration:**
   ```bash
   # User approves 1 USDC
   # User calls registerUsername()
   # Verify 1 USDC transferred to contract
   ```

2. **Test Premium Registration:**
   ```bash
   # User approves 10 USDC
   # User calls registerPremiumUsername()
   # Verify 10 USDC transferred to contract
   ```

3. **Test Relayer Payment:**
   ```bash
   # Relayer approves USDC
   # Call registerUsernameForAddress() with relayer as feePayer
   # Verify relayer's USDC deducted
   ```


