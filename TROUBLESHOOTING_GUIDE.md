# Troubleshooting Guide: SendCash Smart Wallet Implementation

## 🎯 Overview

This guide explains the problems we encountered while implementing smart wallet transactions with Thirdweb and how we solved them. Written for junior developers who want to understand ERC-4337 account abstraction and smart wallet transaction routing.

---

## 📚 Key Concepts (Quick Primer)

Before diving into problems, let's understand a few key concepts:

### What is a Smart Wallet?
Think of a smart wallet like a **safe with a robot inside**. Instead of you directly opening the safe (like a regular wallet), you give instructions to the robot, and the robot opens the safe and does what you asked.

- **Regular Wallet**: You sign → Transaction goes directly to blockchain
- **Smart Wallet**: You sign → Transaction goes to smart wallet contract → Smart wallet executes your instruction

### What is `execute()`?
The smart wallet has a special function called `execute()` that acts like the robot. It takes three parameters:
```solidity
execute(address to, uint256 value, bytes data)
```
- `to`: Where to send the transaction (e.g., token contract)
- `value`: How much ETH to send (usually 0 for token transfers)
- `data`: What function to call (e.g., `approve()` or `transfer()`)

### What is `prepareExecute()`?
This is a helper function that **wraps** your transaction into a call to the smart wallet's `execute()` function. It's like putting your instruction inside an envelope addressed to the robot.

---

## 🐛 Problem #1: Paymaster Simulation Failure

### The Error
```
Paymaster error: 500 - {"error":"Internal server error",
"cause":"Invalid estimation result: UserOperation reverted during simulation with reason: 0x"}
```

### What Was Happening?
Imagine you're trying to send a letter, but the post office (paymaster) is trying to verify it will work before accepting it. The post office tries to simulate delivering your letter, but it fails because you addressed it incorrectly.

**In technical terms:**
- We were sending transactions **directly** to the token contract
- The paymaster tried to simulate the transaction
- But the transaction was going to the wrong address (token contract instead of smart wallet)
- So the simulation failed

### The Root Cause
We were passing a transaction like this:
```javascript
// ❌ WRONG: Direct call to token contract
{
  to: "0x...USDC_TOKEN...",
  data: "0x095ea7b3..." // approve() function call
}
```

But the smart wallet needs to receive this transaction and then execute it. So we needed:
```javascript
// ✅ CORRECT: Call to smart wallet's execute() function
{
  to: "0x...SMART_WALLET...",
  data: "0x..." // execute(tokenAddress, 0, approveCallData)
}
```

### The Solution
We manually wrapped the transaction using `prepareContractCall` to call the smart wallet's `execute()` function:

```javascript
// Wrap the transaction so it goes through the smart wallet
const executeTx = prepareContractCall({
  contract: accountContract, // The smart wallet contract
  method: "function execute(address, uint256, bytes)",
  params: [
    serializableTransaction.to,    // Where the original transaction was going
    serializableTransaction.value || 0n,  // How much ETH (usually 0)
    serializableTransaction.data   // The original transaction data
  ],
});
```

**Think of it like this:**
- Before: "Hey USDC contract, approve this!" ❌
- After: "Hey Smart Wallet, please tell USDC contract to approve this!" ✅

### Why This Works
1. The transaction now goes to the smart wallet first
2. The smart wallet's `execute()` function receives it
3. The smart wallet then calls the token contract on your behalf
4. The paymaster can simulate this correctly because the flow is proper

---

## 🐛 Problem #2: "AA10 Sender Already Constructed" Error

### The Error
```
Paymaster error: 500 - {"error":"Internal server error",
"cause":"Invalid estimation result: UserOperation reverted during simulation with reason: AA10 sender already constructed"}
```

### What Was Happening?
This error means: "Hey, you're trying to deploy a wallet that's already deployed!"

**The scenario:**
1. Wallet gets deployed (first time)
2. We check if it's deployed → `false` (check happens too early)
3. We try to deploy it again → Error! It's already deployed

### The Root Cause
We were checking if the wallet was deployed, but then not updating our variable when deployment completed:

```javascript
// ❌ WRONG: Variable never updates
const walletIsDeployed = await checkDeployed(walletAddress);
// ... deploy wallet ...
// walletIsDeployed is still false! 😱
```

### The Solution
We changed `const` to `let` and updated the variable after deployment:

```javascript
// ✅ CORRECT: Update the variable
let walletIsDeployed = await checkDeployed(walletAddress);

if (!walletIsDeployed) {
  // Deploy the wallet
  await deployWalletExplicitly(walletAddress, adminAddress);
  walletIsDeployed = true; // ✅ Update the variable!
  
  // Double-check to be sure
  walletIsDeployed = await checkDeployed(walletAddress);
}
```

**Think of it like this:**
- Before: "Is the door locked?" → "Yes" → Try to lock it again → Error! ❌
- After: "Is the door locked?" → "No" → Lock it → "Now it's locked!" → Remember it's locked ✅

### Why This Matters
When creating a UserOperation, we need to tell the system:
- If wallet is NOT deployed: Include deployment code (`initCode`)
- If wallet IS deployed: Don't include deployment code

If we include `initCode` for an already-deployed wallet, we get the "AA10" error.

---

## 🐛 Problem #3: Import Path Errors

### The Error
```
Cannot find module '.../calls.js.js' imported from ...
```

### What Was Happening?
Node.js was looking for a file called `calls.js.js` (double extension) instead of `calls.js`.

### The Root Cause
We tried to import an internal function:
```javascript
// ❌ WRONG: Trying to import internal function
const { prepareExecute } = await import("thirdweb/wallets/smart/lib/calls.js");
```

Thirdweb's internal functions aren't meant to be imported directly, and the module resolution was adding an extra `.js`.

### The Solution
We implemented the wrapping logic manually instead of importing the internal function:

```javascript
// ✅ CORRECT: Manual implementation
const executeTx = prepareContractCall({
  contract: accountContract,
  method: "function execute(address, uint256, bytes)",
  params: [
    serializableTransaction.to || "",
    serializableTransaction.value || 0n,
    serializableTransaction.data || "0x"
  ],
});
```

**Think of it like this:**
- Before: Trying to use a private tool from a locked toolbox ❌
- After: Building our own tool that does the same thing ✅

---

## 🐛 Problem #4: Transaction Not Wrapped Correctly

### The Error
Paymaster simulation kept failing because transactions weren't being routed through the smart wallet.

### What Was Happening?
We were passing the raw transaction to `createUnsignedUserOp`, but it expected the transaction to already be wrapped.

**The flow we thought would work:**
```
prepareContractCall() → sendTransaction() → createUnsignedUserOp() → ✅
```

**What actually happened:**
```
prepareContractCall() → sendTransaction() → serializableTransaction → 
createUnsignedUserOp(serializableTransaction) → ❌ (not wrapped!)
```

### The Root Cause
`createUnsignedUserOp` expects a transaction that's already wrapped to call `execute()`, but we were giving it the raw transaction.

### The Solution
We wrapped the transaction **before** passing it to `createUnsignedUserOp`:

```javascript
// Step 1: Get the raw transaction (direct call to token)
const serializableTransaction = {
  to: tokenAddress,
  data: approveCallData,
  value: 0n
};

// Step 2: Wrap it to call smart wallet's execute()
const executeTx = prepareContractCall({
  contract: accountContract, // Smart wallet
  method: "function execute(address, uint256, bytes)",
  params: [
    serializableTransaction.to,    // Token address
    serializableTransaction.value, // 0
    serializableTransaction.data   // Approve call data
  ]
});

// Step 3: Now pass the wrapped transaction
const unsignedUserOp = await createUnsignedUserOp({
  transaction: executeTx, // ✅ Already wrapped!
  // ...
});
```

**Think of it like this:**
- Before: "Here's a letter, please deliver it" (but the letter is addressed to the wrong place) ❌
- After: "Here's a letter for you (smart wallet), please deliver the letter inside to the token contract" ✅

---

## 🎓 Key Learnings for Junior Developers

### 1. Always Wrap Smart Wallet Transactions
**Rule of thumb:** If you're using a smart wallet, transactions must go through the `execute()` function.

```javascript
// ❌ Don't do this
sendTransaction({
  to: tokenContract,
  data: approveData
});

// ✅ Do this instead
sendTransaction({
  to: smartWallet,
  data: execute(tokenContract, 0, approveData)
});
```

### 2. Track State Changes
When you modify state (like deploying a wallet), update your variables:

```javascript
// ❌ Bad
const isDeployed = false;
await deployWallet();
// isDeployed is still false!

// ✅ Good
let isDeployed = false;
await deployWallet();
isDeployed = true; // Update it!
```

### 3. Understand the Transaction Flow
For smart wallets, the flow is:
```
User Request → Smart Wallet execute() → Target Contract
```

Not:
```
User Request → Target Contract (direct)
```

### 4. Internal Functions Are Internal for a Reason
If a function is marked as `@internal` or in a `lib/` folder, it's not part of the public API. Instead of trying to import it, implement the logic yourself.

---

## 🔧 Debugging Tips

### 1. Check Transaction Destination
Always verify where your transaction is going:
```javascript
console.log('Transaction to:', transaction.to);
// Should be smart wallet address, not token address!
```

### 2. Verify Wallet Deployment Status
Before creating UserOperations, check deployment:
```javascript
const isDeployed = await isSmartWalletDeployed(walletAddress);
console.log('Wallet deployed:', isDeployed);
```

### 3. Log Transaction Data
See what data you're sending:
```javascript
console.log('Transaction data:', transaction.data);
// Should start with execute() function selector, not approve()
```

### 4. Test Paymaster Simulation
If paymaster simulation fails, the transaction format is wrong. Check:
- Is the transaction wrapped with `execute()`?
- Is the wallet deployed?
- Are all parameters correct?

---

## 📝 Summary

We fixed four main issues:

1. **Paymaster Simulation**: Wrapped transactions to go through smart wallet's `execute()`
2. **AA10 Error**: Properly tracked wallet deployment status
3. **Import Errors**: Implemented wrapping logic manually instead of importing internal functions
4. **Transaction Routing**: Ensured all transactions are wrapped before creating UserOperations

### The Golden Rule
**For smart wallets, always route transactions through the `execute()` function!**

---

## 🚀 Final Working Flow

Here's how transactions work now:

```
1. User wants to approve token
   ↓
2. prepareContractCall() creates approve transaction
   ↓
3. sendTransaction() serializes it
   ↓
4. Our custom sendTransaction() wraps it with execute()
   ↓
5. createUnsignedUserOp() creates UserOperation
   ↓
6. Paymaster simulates (✅ succeeds!)
   ↓
7. UserOperation is signed and sent
   ↓
8. Smart wallet executes approve() on token contract
   ↓
9. ✅ Success!
```

---

## 💡 Questions to Ask Yourself

When debugging smart wallet issues, ask:

1. **Is the transaction wrapped?** → Check if it calls `execute()`
2. **Is the wallet deployed?** → Verify deployment status
3. **Is the state tracked?** → Make sure variables are updated
4. **Is the import valid?** → Don't use internal functions
5. **Can the paymaster simulate?** → If not, transaction format is wrong

---

## 🎉 Success!

After all these fixes, we now have:
- ✅ Working token approvals
- ✅ Working payment sending
- ✅ Gasless transactions (sponsored by paymaster)
- ✅ Proper smart wallet execution
- ✅ No more simulation errors

The system is ready for users! 🚀


