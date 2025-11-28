# ⚡ AI Agent Performance Optimizations

**How to improve response time for AI agent messages**

---

## 🎯 Current Performance Issues

1. **OpenAI API Latency** - Each request takes 1-3 seconds
2. **Sequential Processing** - Some operations run one after another
3. **Cache TTL Too Short** - Frequent cache misses
4. **Database Queries** - Multiple queries per request
5. **RPC Calls** - Balance checks can be slow

---

## 🚀 Optimization Strategies

### 1. **Increase OpenAI Concurrency** ⚡
**Current:** `maxConcurrentOpenAI = 5`
**Optimized:** `maxConcurrentOpenAI = 10`

**Location:** `backend/services/aiAgent.js` line 46

```javascript
this.maxConcurrentOpenAI = 10 // Increased for faster response times
```

**Impact:** ⭐⭐⭐⭐ (40-50% faster for multiple users)

---

### 2. **Extend Cache TTL** 💾
**Current:** 
- Balances: 30 seconds
- Intents: 5 minutes

**Optimized:**
- Balances: 60 seconds (balance doesn't change that fast)
- Intents: 10 minutes (intents rarely change)

**Location:** `backend/services/aiAgent.js` lines 36-41

```javascript
this.cacheTTL = {
  balances: 60000, // 60 seconds (increased from 30)
  analysis: 120000, // 2 minutes (increased from 1)
  intents: 600000, // 10 minutes (increased from 5)
  paymentIntents: 600000 // 10 minutes (increased from 5)
}
```

**Impact:** ⭐⭐⭐ (30-40% faster for repeated queries)

---

### 3. **Parallelize Independent Operations** 🔀
**Current:** Sequential database and RPC calls
**Optimized:** Run independent operations in parallel

**Example:** When checking balance, fetch all token balances in parallel:

```javascript
// Instead of:
const usdcBalance = await getTokenBalance(address, USDC_ADDRESS)
const usdtBalance = await getTokenBalance(address, USDT_ADDRESS)
const wbtcBalance = await getTokenBalance(address, WBTC_ADDRESS)

// Do:
const [usdcBalance, usdtBalance, wbtcBalance] = await Promise.all([
  getTokenBalance(address, USDC_ADDRESS),
  getTokenBalance(address, USDT_ADDRESS),
  getTokenBalance(address, WBTC_ADDRESS)
])
```

**Impact:** ⭐⭐⭐⭐ (50-70% faster for balance checks)

---

### 4. **Reduce OpenAI Token Limits** 📉
**Current:**
- classifyIntent: 150 tokens
- extractPaymentIntent: 200 tokens
- executeGeneralChat: 500 tokens

**Optimized:**
- classifyIntent: 100 tokens (intent is simple)
- extractPaymentIntent: 150 tokens (payment details are structured)
- executeGeneralChat: 300 tokens (shorter responses)

**Location:** Various places in `aiAgent.js`

**Impact:** ⭐⭐⭐ (20-30% faster API responses)

---

### 5. **Use Manual Extraction First** 🎯
**Current:** Always calls AI for payment extraction
**Optimized:** Try manual regex extraction first, only use AI if needed

**Location:** `executeSendPayment` method

```javascript
// Try manual extraction first (fast, no API call)
const manualExtract = this.manualExtractPayment(message)
if (manualExtract && manualExtract.amount && manualExtract.recipient) {
  // Use manual extraction - no AI call needed!
  return { success: true, data: manualExtract }
}

// Only call AI if manual extraction fails
const paymentIntent = await this.extractPaymentIntent(message)
```

**Impact:** ⭐⭐⭐⭐⭐ (80-90% faster for simple payments)

---

### 6. **Pre-warm Common Caches** 🔥
**Current:** Cache only on first request
**Optimized:** Pre-warm cache for common operations

**Location:** `initialize()` method

```javascript
async initialize() {
  // ... existing code ...
  
  // Pre-warm cache for common intents
  this.setCache('help', { intent: 'help' }, 'intents')
  this.setCache('balance', { intent: 'check_balance' }, 'intents')
}
```

**Impact:** ⭐⭐ (10-20% faster for common queries)

---

### 7. **Optimize Database Queries** 🗄️
**Current:** Multiple separate queries
**Optimized:** Batch queries where possible

**Example:** Get user and wallet in one query:

```javascript
// Instead of:
const user = await dbGet('SELECT * FROM telegram_users WHERE telegram_id = ?', [userId])
const wallet = await dbGet('SELECT * FROM wallets WHERE user_id = ?', [userId])

// Do:
const user = await dbGet(`
  SELECT u.*, w.* 
  FROM telegram_users u 
  LEFT JOIN wallets w ON u.id = w.user_id 
  WHERE u.telegram_id = ?
`, [userId])
```

**Impact:** ⭐⭐⭐ (30-40% faster for user lookups)

---

### 8. **Reduce Queue Delay** ⏱️
**Current:** 100ms delay between batches
**Optimized:** 50ms or remove delay

**Location:** `processQueue()` method line 214

```javascript
// Small delay between batches
if (this.openaiQueue.length > 0) {
  await new Promise(resolve => setTimeout(resolve, 50)) // Reduced from 100ms
}
```

**Impact:** ⭐⭐ (10-15% faster queue processing)

---

### 9. **Stream Responses** 📡
**Current:** Wait for full response
**Optimized:** Stream partial responses for long operations

**Impact:** ⭐⭐⭐⭐ (Perceived faster - user sees response immediately)

---

### 10. **Connection Pooling** 🔌
**Current:** New provider for each request
**Optimized:** Reuse provider connections

**Location:** `contracts.js` - already has provider reuse, but can optimize further

**Impact:** ⭐⭐⭐ (20-30% faster RPC calls)

---

## 📊 Expected Performance Improvements

### Before Optimizations:
- Simple payment: 2-4 seconds
- Balance check: 1-2 seconds
- History: 1-2 seconds
- Search: 1-3 seconds

### After Optimizations:
- Simple payment: 0.5-1 second (manual extraction)
- Balance check: 0.3-0.8 seconds (parallel + cache)
- History: 0.5-1 second (optimized queries)
- Search: 0.5-1.5 seconds (cache + parallel)

**Overall Improvement: 60-75% faster response times**

---

## 🛠️ Implementation Priority

### Quick Wins (Implement First):
1. ✅ Increase concurrency to 10
2. ✅ Extend cache TTL
3. ✅ Use manual extraction first
4. ✅ Reduce token limits
5. ✅ Reduce queue delay

### Medium Effort:
6. Parallelize operations
7. Optimize database queries
8. Connection pooling

### Advanced:
9. Stream responses
10. Pre-warm caches

---

## 📝 Code Changes Needed

See `AI_AGENT_PERFORMANCE_PATCH.md` for specific code changes.

---

**Last Updated:** Based on current implementation analysis


