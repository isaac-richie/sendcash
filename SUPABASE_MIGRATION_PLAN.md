# 🚀 Supabase Migration Plan - Slow & Steady

**Step-by-step migration from SQLite to Supabase PostgreSQL**

---

## 📋 Migration Strategy

### Approach: **Dual Support** (SQLite + Supabase)
- Keep SQLite as fallback during migration
- Support both databases simultaneously
- Gradually migrate services
- Test thoroughly at each step

### Benefits:
- ✅ Zero downtime
- ✅ Easy rollback if issues
- ✅ Test in production safely
- ✅ Gradual migration

---

## 🎯 Migration Steps

### **Phase 1: Setup & Preparation** ✅ (Current)
- [x] Create migration plan
- [ ] Install Supabase dependencies
- [ ] Create Supabase project
- [ ] Get connection credentials
- [ ] Update environment variables

### **Phase 2: Database Service** (Next)
- [ ] Create dual-database service
- [ ] Support both SQLite and Supabase
- [ ] Add database selection logic
- [ ] Test basic operations

### **Phase 3: Schema Migration**
- [ ] Create PostgreSQL schema
- [ ] Convert SQLite types to PostgreSQL
- [ ] Create indexes
- [ ] Test schema creation

### **Phase 4: Data Migration**
- [ ] Export SQLite data
- [ ] Convert to PostgreSQL format
- [ ] Import to Supabase
- [ ] Verify data integrity

### **Phase 5: Service Updates**
- [ ] Update all services to use new database
- [ ] Test each service individually
- [ ] Monitor for issues

### **Phase 6: Production Switch**
- [ ] Switch to Supabase in production
- [ ] Keep SQLite as backup
- [ ] Monitor performance
- [ ] Remove SQLite after validation

---

## 🔧 Technical Details

### Database Selection Logic
```javascript
// Use Supabase if DATABASE_URL is set, otherwise fallback to SQLite
const useSupabase = !!process.env.DATABASE_URL
```

### Schema Differences

| SQLite | PostgreSQL |
|--------|------------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` |
| `TEXT` | `TEXT` or `VARCHAR` |
| `REAL` | `NUMERIC` or `DOUBLE PRECISION` |
| `strftime('%s', 'now')` | `EXTRACT(EPOCH FROM NOW())` |
| `INTEGER` (timestamp) | `BIGINT` or `TIMESTAMP` |

### Connection Strings
```env
# Supabase
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:5432/postgres

# Or use Supabase client
SUPABASE_URL=https://[PROJECT].supabase.co
SUPABASE_KEY=[ANON_KEY]
```

---

## 📊 Current Tables to Migrate

1. **usernames** - Username cache
2. **payments** - Payment history
3. **receipts** - Payment receipts
4. **telegram_users** - User mapping
5. **scheduled_payments** - Scheduled payments
6. **swaps** - Token swaps
7. **polymarket_bets** - Polymarket bets
8. **bridge_transactions** - Bridge transactions

---

## ✅ Testing Checklist

- [ ] All tables created successfully
- [ ] Indexes created
- [ ] Basic CRUD operations work
- [ ] Foreign keys work
- [ ] Transactions work
- [ ] Performance is acceptable
- [ ] Data integrity maintained

---

## 🚨 Rollback Plan

If issues occur:
1. Set `DATABASE_URL` to empty
2. System falls back to SQLite
3. Fix issues
4. Retry migration

---

**Status:** Phase 1 in progress  
**Next Step:** Install dependencies and create Supabase project



