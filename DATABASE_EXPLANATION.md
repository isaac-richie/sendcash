# Why SQLite Database?

## Overview

SQLite is used as a **cache and off-chain tracking layer** for the SendCash bot. The **source of truth** for usernames and wallet addresses is **on-chain** (the `UsernameRegistry` contract), but SQLite provides fast, local caching and transaction history.

## What SQLite Stores

### 1. **Telegram User Mapping** (`telegram_users`)
- Maps Telegram user IDs to wallet addresses
- Stores usernames for quick lookup
- **Purpose**: Fast lookup of user's wallet without querying blockchain

```sql
telegram_id → wallet_address, username
```

### 2. **Username Cache** (`usernames`)
- Caches on-chain username → address mappings
- Stores registration timestamps
- **Purpose**: Performance optimization - avoid repeated on-chain queries

```sql
username → address, registered_at, is_premium
```

### 3. **Payment History** (`payments`)
- Tracks all transactions (off-chain record)
- Stores transaction hashes, amounts, fees
- **Purpose**: Fast transaction history without scanning blockchain

```sql
tx_hash → from_address, to_address, amount, fee, status
```

### 4. **Receipts** (`receipts`)
- Stores shareable payment receipts
- Links to transaction hashes
- **Purpose**: Enable users to share payment confirmations

## Why SQLite?

### ✅ Advantages for This Use Case

1. **Lightweight & Zero Configuration**
   - No separate database server needed
   - Single file (`sendcash.db`)
   - Works out of the box

2. **Fast Performance**
   - Local file-based storage
   - Instant lookups (no network latency)
   - Perfect for caching frequently accessed data

3. **Simple Setup**
   - No installation required
   - No connection strings
   - Perfect for development and small-scale production

4. **Low Resource Usage**
   - Minimal memory footprint
   - Small file size (currently 36KB)
   - Efficient for read-heavy workloads

5. **ACID Compliance**
   - Reliable transactions
   - Data integrity guaranteed
   - No data loss risk

### ⚠️ Limitations

1. **Single Writer**
   - Only one process can write at a time
   - Fine for single bot instance
   - Not ideal for multiple bot instances

2. **No Network Access**
   - File-based, not network-accessible
   - Can't share across multiple servers
   - Requires file system access

3. **Scalability**
   - Works great for small to medium scale
   - May need upgrade for high traffic
   - Recommended: PostgreSQL for production at scale

## Architecture: On-Chain vs Off-Chain

```
┌─────────────────────────────────────────┐
│         Source of Truth (On-Chain)      │
│  ┌───────────────────────────────────┐  │
│  │   UsernameRegistry Contract       │  │
│  │   - username → address mapping    │  │
│  │   - Permanent, immutable         │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
              ↓ (read for verification)
┌─────────────────────────────────────────┐
│      Cache Layer (SQLite - Off-Chain)   │
│  ┌───────────────────────────────────┐  │
│  │   SQLite Database                 │  │
│  │   - Fast lookups                  │  │
│  │   - Transaction history           │  │
│  │   - Telegram ID mapping           │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Data Flow

1. **Registration**:
   - User registers username → Stored on-chain (UsernameRegistry)
   - Also cached in SQLite for fast access

2. **Lookup**:
   - Bot checks SQLite cache first (fast)
   - Falls back to on-chain if not in cache
   - Updates cache after on-chain query

3. **Payments**:
   - Transaction executed on-chain (SendCash contract)
   - Transaction details stored in SQLite for history
   - Receipt generated and stored

## When to Upgrade

Consider migrating to PostgreSQL or another database if:

- **Multiple bot instances** need to share data
- **High transaction volume** (thousands per second)
- **Need network access** to database
- **Require advanced features** (replication, sharding)
- **Team collaboration** on same database

## Current Status

- ✅ **Perfect for current scale**: Single bot instance, testnet
- ✅ **Fast lookups**: All queries are instant
- ✅ **Reliable**: No data loss, ACID compliant
- ✅ **Simple**: No maintenance required

## Migration Path

If you need to upgrade later:

1. **Keep same schema** - Tables can be migrated easily
2. **Use connection pooling** - Same code, different driver
3. **Gradual migration** - Can run both in parallel

The code is structured to make database migration easy - just swap the database connection, keep the same queries.

## Summary

SQLite is used because:
- **Fast caching** of on-chain data
- **Simple setup** - no infrastructure needed
- **Perfect for current scale** - single bot, testnet
- **Source of truth is on-chain** - SQLite is just a cache
- **Easy to upgrade** - can migrate to PostgreSQL later if needed

The database is **not** the source of truth - it's a performance optimization layer that makes the bot fast and responsive!


