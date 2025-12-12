# 📝 Adding DAI to SendCashV2 Contract

**DAI is NOT automatically added to the contract - it must be added manually**

---

## ⚠️ Current Status

**DAI is configured in the backend** but **NOT yet added to the deployed contract**.

The contract requires tokens to be explicitly added by the owner using the `addSupportedToken()` function.

---

## 🔧 How to Add DAI

### **Option 1: Using Foundry Script** (Recommended)

1. **Update the script** with your contract address:
   ```solidity
   // In contracts/script/AddTokensV2.s.sol
   address constant SEND_CASH_V2 = 0x...; // Your deployed SendCashV2 address
   address constant DAI = 0x...; // DAI address on Base Sepolia
   ```

2. **Run the script**:
   ```bash
   cd contracts
   forge script script/AddTokensV2.s.sol:AddTokensV2 \
     --rpc-url $BASE_SEPOLIA_RPC_URL \
     --broadcast \
     --private-key $PRIVATE_KEY
   ```

### **Option 2: Direct Contract Call**

Call the contract directly:

```javascript
// Using ethers.js or web3
const sendCash = new ethers.Contract(
  SEND_CASH_V2_ADDRESS,
  ['function addSupportedToken(address token)'],
  signer
);

await sendCash.addSupportedToken(DAI_ADDRESS);
```

### **Option 3: Using Hardhat Console**

```bash
npx hardhat console --network baseSepolia
```

```javascript
const SendCashV2 = await ethers.getContractFactory("SendCashV2");
const sendCash = SendCashV2.attach(SEND_CASH_V2_ADDRESS);

await sendCash.addSupportedToken(DAI_ADDRESS);
console.log("DAI added:", await sendCash.supportedTokens(DAI_ADDRESS));
```

---

## ✅ Verification

After adding DAI, verify it's supported:

```solidity
// In Foundry console or contract call
bool daiSupported = sendCash.supportedTokens(DAI_ADDRESS);
require(daiSupported, "DAI not supported");
```

Or check via contract:
```javascript
const isSupported = await sendCash.supportedTokens(DAI_ADDRESS);
console.log("DAI supported:", isSupported);
```

---

## 📋 Required Information

Before adding DAI, you need:

1. **SendCashV2 Contract Address**: The deployed contract address
2. **DAI Token Address**: DAI address on Base Sepolia
   - You can find this on Base Sepolia explorer or deploy a test DAI token

---

## 🚀 Quick Add Script

I've created `contracts/script/AddTokensV2.s.sol` that will:
- ✅ Add USDC (if not already added)
- ✅ Add USDT (if not already added)
- ✅ Add WBTC (if not already added)
- ✅ Add DAI (if address is set)

Just update the addresses and run it!

---

## ⚡ One-Liner (if you have the addresses)

```bash
cast send $SEND_CASH_V2_ADDRESS \
  "addSupportedToken(address)" \
  $DAI_ADDRESS \
  --rpc-url $BASE_SEPOLIA_RPC \
  --private-key $PRIVATE_KEY
```

---

**Note**: Only the contract owner can add tokens. Make sure you're using the owner's private key.
