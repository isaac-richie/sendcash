# 🐛 Known Bugs & Issues - SendCash

**Last Updated:** December 2024

---

## 🔴 **CRITICAL BUGS** (Fix Immediately)

### 1. **Wallet Transaction Method Missing** ✅ FIXED
**Status:** ✅ **FIXED - December 2024**
**Location:** `backend/services/thirdwebWallet.js` - `sendTransactionFromSmartWallet()`
**Fix Applied:**
- ✅ Enhanced sendTransaction attachment logic
- ✅ Custom sendTransaction method properly attached
- ✅ Improved error handling and validation
- ✅ Address property fix for wallet instance

**Priority:** ✅ **FIXED**

---

### 2. **RPC Connection Issues** ✅ FIXED
**Status:** ✅ **FIXED - December 2024**
**Location:** Multiple services using `BASE_RPC`
**Fix Applied:**
- ✅ Implemented `getProviderWithRetry()` with automatic fallback
- ✅ Updated all services to use retry logic
- ✅ Added 4 fallback RPC endpoints
- ✅ Connection testing before use
- ✅ All contract functions now async with retry

**Priority:** ✅ **FIXED**

---

### 3. **Payment Confirmation Flow - Silent Failures** ✅ FIXED
**Status:** ✅ **FIXED - December 2024**
**Location:** `backend/services/aiAgent.js` - `confirmAndExecute()`
**Fix Applied:**
- ✅ Enhanced error handling in confirmation flow
- ✅ User notifications for all payment failures
- ✅ Transaction status polling implemented (`pollTransactionStatus()`)
- ✅ Clear error messages with suggestions
- ✅ Real-time status updates (1, 3, 12 block confirmations)

**Priority:** ✅ **FIXED**

---

## 🟡 **MEDIUM PRIORITY BUGS**

### 4. **Polymarket Bet Price Fetching** ⚠️
**Status:** 🟡 **MEDIUM**
**Location:** `backend/services/polymarketService.js` - Line 750
**Issue:**
- Bet price defaults to 0.5 (50%) instead of fetching actual market price
- TODO comment: "Fetch actual market price from orderbook"
- Users may get incorrect bet prices

**Impact:**
- ⚠️ Incorrect bet pricing
- ⚠️ Users may overpay or underpay for bets
- ⚠️ Not using real market data

**Fix Required:**
- [ ] Integrate Polymarket orderbook API
- [ ] Fetch actual market price for YES/NO sides
- [ ] Use real-time price data
- [ ] Add price validation

**Priority:** 🟡 **MEDIUM** - Affects betting accuracy

---

### 5. **Username Registry Address Bug (Handled)** ✅
**Status:** ✅ **WORKAROUND IN PLACE**
**Location:** `backend/services/aiActions.js`, `backend/services/wallet.js`, `backend/services/aiAgent.js`
**Issue:**
- `getAddress()` has a bug that returns registry address for non-existent usernames
- Comment: "getAddress() has a bug that returns registry address for non-existent usernames"

**Current Status:**
- ✅ Workaround: Using `usernameToAddress()` which correctly returns zero address
- ✅ Zero address checks in place
- ✅ Error handling implemented

**Fix Required:**
- [ ] Verify if this is still an issue
- [ ] Consider updating contract if bug exists
- [ ] Document workaround

**Priority:** 🟡 **LOW** - Workaround is working

---

### 6. **Polymarket GraphQL Schema Mismatch** ⚠️
**Status:** 🟡 **MEDIUM**
**Location:** `backend/services/polymarketService.js`
**Issue:**
- GraphQL queries don't perfectly match subgraph schema
- Errors like: `Type 'Condition' has no field 'questionId'`
- Some queries may fail

**Impact:**
- ⚠️ Market search may fail
- ⚠️ Prediction queries may error
- ⚠️ Inconsistent data fetching

**Fix Required:**
- [ ] Review Polymarket subgraph schema
- [ ] Update GraphQL queries to match schema
- [ ] Test all query types
- [ ] Add error handling for schema mismatches

**Priority:** 🟡 **MEDIUM** - Affects Polymarket features

---

## 🟢 **LOW PRIORITY / ENHANCEMENTS**

### 7. **Socket API Authentication** ⚠️
**Status:** 🟢 **LOW** (Expected Behavior)
**Location:** `backend/services/bridgeService.js`
**Issue:**
- Socket API returns 401 Unauthorized without API key
- Bridge quotes fail without `SOCKET_API_KEY`

**Current Status:**
- ✅ Error handling in place
- ✅ Documentation updated
- ✅ User-friendly error messages

**Fix Required:**
- [ ] Document API key requirement
- [ ] Add setup instructions
- [ ] Consider free tier alternatives

**Priority:** 🟢 **LOW** - Expected behavior, documented

---

### 8. **Transaction Status Tracking Missing** ✅ FIXED
**Status:** ✅ **FIXED - December 2024**
**Location:** Payment execution flows
**Fix Applied:**
- ✅ `pollTransactionStatus()` method implemented
- ✅ Polls transaction status after sending
- ✅ Sends update message when confirmed (1, 3, 12 blocks)
- ✅ Shows block confirmation count
- ✅ Handles failed transactions gracefully
- ✅ Explorer links included

**Priority:** ✅ **FIXED**

---

## 📋 **KNOWN LIMITATIONS** (Not Bugs, But Should Be Documented)

### 9. **AI Agent Knowledge Cutoff** 📅
**Status:** ℹ️ **LIMITATION**
**Issue:**
- GPT-3.5-turbo knowledge cutoff: April 2024
- Cannot answer questions about events after this date
- May provide outdated information

**Workaround:**
- ✅ Agent admits when it doesn't have real-time data
- ✅ Suggests reliable sources
- ✅ Can discuss general concepts

**Priority:** 🟢 **LOW** - Documented limitation

---

### 10. **No Real-Time Data Access** 📊
**Status:** ℹ️ **LIMITATION**
**Issue:**
- No access to real-time crypto prices
- No weather data
- No live news
- No current events

**Workaround:**
- ✅ Agent is honest about limitations
- ✅ Suggests external sources
- ✅ Can discuss general concepts

**Priority:** 🟢 **LOW** - Documented limitation

---

## 🔧 **TECHNICAL DEBT**

### 11. **Database Indexing Missing** 🗄️
**Status:** 🟡 **PERFORMANCE**
**Location:** `backend/services/database.js`
**Issue:**
- No indexes on frequently queried columns
- Slow queries on large datasets

**Fix Required:**
- [ ] Index `telegram_id` in `telegram_users`
- [ ] Index `from_address`, `to_address` in `payments`
- [ ] Index `tx_hash` for lookups
- [ ] Index `created_at` for date queries

**Priority:** 🟡 **MEDIUM** - Performance optimization

---

### 12. **Error Logging Not Structured** 📊
**Status:** 🟡 **MAINTAINABILITY**
**Location:** All services
**Issue:**
- Logs are not structured (no JSON)
- Hard to parse and analyze
- No error tracking service integration

**Fix Required:**
- [ ] Implement structured logging (JSON)
- [ ] Add error tracking (Sentry)
- [ ] Add performance metrics
- [ ] Add alerting on errors

**Priority:** 🟡 **MEDIUM** - Maintainability

---

## 🎯 **Priority Summary**

### ✅ **FIXED (December 2024)**
1. ✅ **Wallet transaction method** - FIXED
2. ✅ **RPC connection issues** - FIXED
3. ✅ **Payment confirmation flow** - FIXED
4. ✅ **Transaction status tracking** - FIXED

### Next Sprint (2 Weeks) - **REMAINING BUGS**
4. 🟡 **Fix Polymarket bet price fetching** (MEDIUM)
5. 🟡 **Fix Polymarket GraphQL schema** (MEDIUM)

### Following Sprint (1 Month)
7. 🟢 **Add database indexes** (PERFORMANCE)
8. 🟢 **Implement structured logging** (MAINTAINABILITY)
9. 🟢 **Add error tracking** (MONITORING)

---

## 📊 **Bug Statistics**

- **Critical Bugs:** 3 ✅ **ALL FIXED**
- **Medium Priority:** 3 (2 remaining)
- **Low Priority/Enhancements:** 6
- **Total Issues:** 12
- **Fixed:** 4 ✅
- **Remaining:** 8

---

## 🔍 **How to Report New Bugs**

1. Check if bug is already listed here
2. Test the bug to reproduce it
3. Document:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - Error messages/logs
   - Environment details
4. Add to this document with priority

---

**Last Updated:** December 2024
**Next Review:** After critical fixes are implemented



