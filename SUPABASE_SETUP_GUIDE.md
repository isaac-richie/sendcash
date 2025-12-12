# 🚀 Supabase Setup Guide - Step by Step

**Complete guide to set up Supabase for SendCash backend**

---

## 📋 Prerequisites

- Node.js installed
- npm installed
- Supabase account (free tier works!)

---

## Step 1: Create Supabase Project

1. **Go to** [supabase.com](https://supabase.com)
2. **Sign up** (free account)
3. **Click** "New Project"
4. **Fill in:**
   - Project Name: `sendcash` (or your choice)
   - Database Password: (save this! You'll need it)
   - Region: Choose closest to you
5. **Click** "Create new project"
6. **Wait** 2-3 minutes for project to be created

---

## Step 2: Get Connection Details

Once your project is ready:

1. **Go to** Project Settings → API
2. **Copy these values:**
   - `Project URL` → This is your `SUPABASE_URL`
   - `anon public` key → This is your `SUPABASE_KEY`

3. **Or get PostgreSQL connection string:**
   - Go to Project Settings → Database
   - Find "Connection string" section
   - Copy the "URI" connection string
   - This is your `DATABASE_URL`

---

## Step 3: Update Environment Variables

Add to your `.env` file in the `backend/` directory:

### Option A: Using Supabase Client (Recommended)
```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your-anon-key-here
```

### Option B: Using Direct PostgreSQL Connection
```env
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.your-project-id.supabase.co:5432/postgres
```

**Note:** Replace `[YOUR-PASSWORD]` with the database password you set in Step 1.

---

## Step 4: Test Connection

1. **Start your server:**
   ```bash
   cd backend
   npm start
   ```

2. **Check logs:**
   - You should see: `[Database] Using: SUPABASE`
   - You should see: `[Database] Connected to Supabase`
   - You should see: `[Database] Supabase tables created/verified`

3. **If you see errors:**
   - Check your connection string
   - Verify your password
   - Check firewall settings

---

## Step 5: Verify Tables Created

1. **Go to** Supabase Dashboard → Table Editor
2. **You should see these tables:**
   - ✅ `usernames`
   - ✅ `payments`
   - ✅ `receipts`
   - ✅ `telegram_users`
   - ✅ `scheduled_payments`
   - ✅ `swaps`
   - ✅ `polymarket_bets`
   - ✅ `bridge_transactions`

---

## Step 6: Migrate Existing Data (Optional)

If you have existing SQLite data:

1. **Export SQLite data:**
   ```bash
   sqlite3 backend/data/sendcash.db .dump > dump.sql
   ```

2. **Convert to PostgreSQL format:**
   - Replace `INTEGER PRIMARY KEY AUTOINCREMENT` with `SERIAL PRIMARY KEY`
   - Replace `strftime('%s', 'now')` with `EXTRACT(EPOCH FROM NOW())`
   - Replace `INTEGER` timestamps with `BIGINT`

3. **Import to Supabase:**
   - Use Supabase SQL Editor
   - Or use `psql` command line tool

**Note:** For now, you can start fresh - the system will create new data in Supabase.

---

## ✅ Verification Checklist

- [ ] Supabase project created
- [ ] Connection details copied
- [ ] Environment variables set
- [ ] Server starts without errors
- [ ] Tables created in Supabase
- [ ] Can perform basic operations

---

## 🔧 Troubleshooting

### Error: "Connection refused"
- **Fix:** Check your `DATABASE_URL` or `SUPABASE_URL`
- **Fix:** Verify your database password

### Error: "relation does not exist"
- **Fix:** Tables will be created automatically on first run
- **Fix:** Check server logs for table creation errors

### Error: "SSL required"
- **Fix:** Add `?sslmode=require` to your `DATABASE_URL`
- **Fix:** Or use Supabase client mode (handles SSL automatically)

### Still using SQLite?
- **Check:** Make sure `SUPABASE_URL` or `DATABASE_URL` is set
- **Check:** Restart your server after setting env vars
- **Check:** Look for `[Database] Using: SQLITE` in logs

---

## 🎯 Next Steps

Once Supabase is working:

1. **Test all features:**
   - User registration
   - Payments
   - Scheduled payments
   - Swaps
   - Polymarket bets

2. **Monitor performance:**
   - Check query times
   - Monitor connection pool
   - Watch for errors

3. **Migrate data** (if needed):
   - Export from SQLite
   - Import to Supabase
   - Verify data integrity

---

## 📊 What You Get

- ✅ **10x faster** queries
- ✅ **10,000+ concurrent users** support
- ✅ **Automatic backups** (Supabase handles this)
- ✅ **Web dashboard** for data management
- ✅ **Real-time subscriptions** (if needed later)
- ✅ **Auto-scaling** as you grow

---

## 💰 Cost

- **Free Tier:** 500MB storage, 2GB bandwidth
- **Pro Tier:** $25/month (8GB storage, 50GB bandwidth)
- **Perfect for:** Up to 10,000 users

---

**Need Help?** Check the migration plan: `SUPABASE_MIGRATION_PLAN.md`



