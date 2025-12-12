# 🐛 Remaining Bugs to Fix - SendCash

**Last Updated:** December 2024

---

## ✅ **CRITICAL BUGS - ALL FIXED!**

All 3 critical bugs have been fixed:
1. ✅ Wallet Transaction Method - FIXED
2. ✅ RPC Connection Issues - FIXED
3. ✅ Payment Confirmation Flow - FIXED
4. ✅ Transaction Status Tracking - FIXED (bonus!)

---

## 🟡 **MEDIUM PRIORITY BUGS** (Next to Fix)

### 1. **Polymarket Bet Price Fetching** ⚠️
**Status:** 🟡 **MEDIUM PRIORITY**
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
- [ ] Research Polymarket orderbook API
- [ ] Integrate orderbook API to fetch real-time prices
- [ ] Fetch actual market price for YES/NO sides
- [ ] Use real-time price data
- [ ] Add price validation
- [ ] Handle price fetch failures gracefully

**Priority:** 🟡 **MEDIUM** - Affects betting accuracy

**Estimated Effort:** 3-4 hours

---

### 2. **Polymarket GraphQL Schema Mismatch** ⚠️
**Status:** 🟡 **MEDIUM PRIORITY**
**Location:** `backend/services/polymarketService.js`
**Issue:**
- GraphQL queries don't perfectly match subgraph schema
- Errors like: `Type 'Condition' has no field 'questionId'`
- Some queries may fail intermittently

**Impact:**
- ⚠️ Market search may fail
- ⚠️ Prediction queries may error
- ⚠️ Inconsistent data fetching

**Fix Required:**
- [ ] Review Polymarket subgraph schema documentation
- [ ] Query the subgraph schema directly to get correct fields
- [ ] Update GraphQL queries to match actual schema
- [ ] Test all query types (searchMarkets, getMarketById, getSportsMarkets)
- [ ] Add error handling for schema mismatches
- [ ] Add fallback queries if schema changes

**Priority:** 🟡 **MEDIUM** - Affects Polymarket features

**Estimated Effort:** 2-3 hours

---

## 🟢 **LOW PRIORITY / ENHANCEMENTS**

### 3. **Database Indexing Missing** 🗄️
**Status:** 🟡 **PERFORMANCE**
**Location:** `backend/services/database.js`
**Issue:**
- No indexes on frequently queried columns
- Slow queries on large datasets
- Performance degradation as data grows

**Impact:**
- ⚠️ Slow queries on large datasets
- ⚠️ Poor performance with many users
- ⚠️ Database bottlenecks

**Fix Required:**
- [ ] Index `telegram_id` in `telegram_users`
- [ ] Index `from_address`, `to_address` in `payments`
- [ ] Index `tx_hash` for lookups
- [ ] Index `created_at` for date queries
- [ ] Index `user_id` in `scheduled_payments`
- [ ] Index `user_id` in `polymarket_bets`
- [ ] Index `user_id` in `bridge_transactions`

**Priority:** 🟡 **MEDIUM** - Performance optimization

**Estimated Effort:** 1-2 hours

---

### 4. **Error Logging Not Structured** 📊
**Status:** 🟡 **MAINTAINABILITY**
**Location:** All services
**Issue:**
- Logs are not structured (no JSON)
- Hard to parse and analyze
- No error tracking service integration
- Difficult to debug production issues

**Impact:**
- ⚠️ Hard to debug issues
- ⚠️ No centralized error tracking
- ⚠️ Difficult to monitor production

**Fix Required:**
- [ ] Implement structured logging (JSON format)
- [ ] Add error tracking service (Sentry or similar)
- [ ] Add performance metrics
- [ ] Add alerting on errors
- [ ] Create logging utility module
- [ ] Add log levels (info, warn, error, debug)

**Priority:** 🟡 **MEDIUM** - Maintainability

**Estimated Effort:** 4-5 hours

---

### 5. **Socket API Authentication** ⚠️
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
- [x] Document API key requirement ✅
- [ ] Add setup instructions in README
- [ ] Consider free tier alternatives
- [ ] Add API key validation on startup

**Priority:** 🟢 **LOW** - Expected behavior, documented

**Estimated Effort:** 30 minutes

---

## 📋 **KNOWN LIMITATIONS** (Not Bugs)

### 6. **AI Agent Knowledge Cutoff** 📅
**Status:** ℹ️ **LIMITATION** (Not a bug)
- GPT-3.5-turbo knowledge cutoff: April 2024
- ✅ Workaround: Agent admits limitations, suggests sources

### 7. **No Real-Time Data Access** 📊
**Status:** ℹ️ **LIMITATION** (Not a bug)
- No access to real-time crypto prices, weather, news
- ✅ Workaround: Agent is honest about limitations

---

## 🎯 **Recommended Fix Order**

### **Immediate (This Week)**
1. 🟡 **Fix Polymarket GraphQL schema** (2-3 hours)
   - Quick win, fixes search/prediction errors
   - Improves Polymarket feature reliability

### **Next (This Week)**
2. 🟡 **Fix Polymarket bet price fetching** (3-4 hours)
   - Improves betting accuracy
   - Uses real market data

### **Following Week**
3. 🟡 **Add database indexes** (1-2 hours)
   - Performance optimization
   - Prevents future slowdowns

4. 🟡 **Implement structured logging** (4-5 hours)
   - Better debugging
   - Production monitoring

---

## 📊 **Summary**

**Total Remaining Bugs:** 4
- **Medium Priority:** 2 (Polymarket issues)
- **Performance:** 1 (Database indexing)
- **Maintainability:** 1 (Structured logging)

**Estimated Total Time:** 10-14 hours

**Recommended:** Fix Polymarket bugs first (they affect user-facing features), then performance/maintainability improvements.

---

**Last Updated:** December 2024



