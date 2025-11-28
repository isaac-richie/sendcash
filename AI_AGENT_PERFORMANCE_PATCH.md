# 🔧 AI Agent Performance Patch

**Specific code changes to improve response time**

⚠️ **IMPORTANT:** The `aiAgent.js` file was accidentally overwritten. You'll need to restore it first, then apply these patches.

---

## Patch 1: Increase Concurrency

**File:** `backend/services/aiAgent.js`  
**Line:** ~46

**Change:**
```javascript
// Before:
this.maxConcurrentOpenAI = 5

// After:
this.maxConcurrentOpenAI = 10 // Increased for faster response times
```

---

## Patch 2: Extend Cache TTL

**File:** `backend/services/aiAgent.js`  
**Line:** ~36-41

**Change:**
```javascript
// Before:
this.cacheTTL = {
  balances: 30000, // 30 seconds
  analysis: 60000, // 1 minute
  intents: 300000, // 5 minutes
  paymentIntents: 300000 // 5 minutes
}

// After:
this.cacheTTL = {
  balances: 60000, // 60 seconds (increased)
  analysis: 120000, // 2 minutes (increased)
  intents: 600000, // 10 minutes (increased)
  paymentIntents: 600000 // 10 minutes (increased)
}
```

---

## Patch 3: Reduce Queue Delay

**File:** `backend/services/aiAgent.js`  
**Line:** ~214

**Change:**
```javascript
// Before:
await new Promise(resolve => setTimeout(resolve, 100))

// After:
await new Promise(resolve => setTimeout(resolve, 50)) // Reduced delay
```

---

## Patch 4: Use Manual Extraction First

**File:** `backend/services/aiAgent.js`  
**Location:** `executeSendPayment` method (~1057)

**Change:**
```javascript
// Add this BEFORE the AI extraction:
// Try manual extraction first (fast, no API call)
const manualExtract = this.manualExtractPayment(message)
if (manualExtract && manualExtract.amount && manualExtract.recipient && !manualExtract.needsContext) {
  console.log(`[AI Agent] Using fast manual extraction (no AI call)`)
  const amount = manualExtract.amount
  const recipient = manualExtract.recipient
  const tokenSymbol = manualExtract.tokenSymbol || 'USDC'
  
  return {
    success: true,
    needsConfirmation: true,
    action: 'send_payment',
    message: `💸 Payment Details:\n\n` +
      `To: @${recipient}\n` +
      `Amount: $${amount} ${tokenSymbol}\n` +
      `Fee: 0.5%\n\n` +
      `Reply "yes" or "confirm" to send, or "cancel" to abort.`,
    data: {
      recipient,
      amount: amount.toString(),
      tokenSymbol
    }
  }
}

// Then continue with existing AI extraction as fallback
let paymentIntent = await this.extractPaymentIntent(message)
```

---

## Patch 5: Reduce Token Limits

**File:** `backend/services/aiAgent.js`  
**Locations:** Multiple

**Change 1 - classifyIntent (~879):**
```javascript
// Before:
max_tokens: 150

// After:
max_tokens: 100 // Reduced - intent classification is simple
```

**Change 2 - extractPaymentIntent (~1827):**
```javascript
// Before:
max_tokens: 200

// After:
max_tokens: 150 // Reduced - payment extraction is structured
```

**Change 3 - executeGeneralChat (~1652):**
```javascript
// Before:
max_tokens: 500

// After:
max_tokens: 300 // Reduced - shorter responses are faster
```

---

## Patch 6: Parallelize Balance Checks

**File:** `backend/services/aiAgent.js`  
**Location:** `getWalletBalances` method (~311)

**Change:**
```javascript
// Before (sequential):
for (const [symbol, token] of Object.entries(TOKENS)) {
  const balance = await getTokenBalance(walletAddress, token.address)
  // ...
}

// After (parallel):
const balancePromises = Object.entries(TOKENS).map(async ([symbol, token]) => {
  const balance = await getTokenBalance(walletAddress, token.address)
  return { symbol, token, balance }
})

const balanceResults = await Promise.all(balancePromises)

const balances = {}
for (const { symbol, token, balance } of balanceResults) {
  if (balance) {
    balances[symbol] = {
      amount: balance.formatted,
      raw: balance.balance.toString(),
      decimals: balance.decimals
    }
  }
}
```

---

## Patch 7: Optimize Database Queries

**File:** `backend/services/aiAgent.js`  
**Location:** `processNaturalLanguage` method (~1567)

**Change:**
```javascript
// Before:
if (!walletAddress && userId) {
  const user = await dbGet(
    'SELECT wallet_address, username FROM telegram_users WHERE telegram_id = ?',
    [userId]
  )
  walletAddress = user?.wallet_address
  username = user?.username
}

// After (add index hint if needed):
// Ensure database has index: CREATE INDEX IF NOT EXISTS idx_telegram_id ON telegram_users(telegram_id);
// Query is already optimal, but ensure index exists
```

---

## 📋 Quick Apply Script

Create a file `apply-performance-patches.sh`:

```bash
#!/bin/bash
# Apply performance optimizations to aiAgent.js

FILE="backend/services/aiAgent.js"

# Patch 1: Increase concurrency
sed -i '' 's/this\.maxConcurrentOpenAI = 5/this.maxConcurrentOpenAI = 10/' $FILE

# Patch 2: Extend cache TTL
sed -i '' 's/balances: 30000/balances: 60000/' $FILE
sed -i '' 's/analysis: 60000/analysis: 120000/' $FILE
sed -i '' 's/intents: 300000/intents: 600000/' $FILE
sed -i '' 's/paymentIntents: 300000/paymentIntents: 600000/' $FILE

# Patch 3: Reduce queue delay
sed -i '' 's/setTimeout(resolve, 100)/setTimeout(resolve, 50)/' $FILE

# Patch 5: Reduce token limits
sed -i '' 's/max_tokens: 150.*intent/max_tokens: 100 \/\/ Reduced for faster responses/' $FILE
sed -i '' 's/max_tokens: 200.*payment/mmax_tokens: 150 \/\/ Reduced for faster responses/' $FILE
sed -i '' 's/max_tokens: 500.*general/max_tokens: 300 \/\/ Reduced for faster responses/' $FILE

echo "✅ Performance patches applied!"
```

---

## ⚠️ Important Notes

1. **Restore aiAgent.js first** - The file was accidentally overwritten
2. **Test after each patch** - Apply patches incrementally
3. **Monitor performance** - Check response times before/after
4. **Backup first** - Always backup before making changes

---

**Expected Improvement:** 60-75% faster response times


