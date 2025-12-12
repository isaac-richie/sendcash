/**
 * Supabase Database Service
 * Supports both SQLite (fallback) and Supabase PostgreSQL
 * 
 * Usage:
 * - Set DATABASE_URL or SUPABASE_URL + SUPABASE_KEY to use Supabase
 * - Leave unset to use SQLite (fallback)
 */

import sqlite3 from 'sqlite3'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Determine which database to use
const useSupabase = !!(process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_KEY))
const dbType = useSupabase ? 'supabase' : 'sqlite'

console.log(`[Database] Using: ${dbType.toUpperCase()}`)

// SQLite setup (fallback)
const dbPath = path.join(__dirname, '../data/sendcash.db')
let sqliteDb = null

// Supabase setup
let supabaseClient = null
let pgPool = null

/**
 * Initialize database connection
 */
export const initDatabase = async () => {
  if (useSupabase) {
    await initSupabase()
  } else {
    initSQLite()
  }
}

/**
 * Initialize Supabase connection
 */
async function initSupabase() {
  try {
    // Option 1: Use Supabase client (if SUPABASE_URL is set)
    if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
      supabaseClient = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_KEY
      )
      console.log('[Database] Connected to Supabase (client mode)')
      
      // Test connection
      const { data, error } = await supabaseClient.from('telegram_users').select('count').limit(1)
      if (error && !error.message.includes('relation') && !error.message.includes('does not exist')) {
        console.warn('[Database] Supabase connection test:', error.message)
      }
    }
    
    // Option 2: Use direct PostgreSQL connection (if DATABASE_URL is set)
    if (process.env.DATABASE_URL) {
      pgPool = new pg.Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('supabase') ? { rejectUnauthorized: false } : false,
        max: 20, // Connection pool size
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      })
      
      // Test connection
      try {
        await pgPool.query('SELECT NOW()')
        console.log('[Database] Connected to Supabase (PostgreSQL mode)')
      } catch (error) {
        console.error('[Database] PostgreSQL connection error:', error.message)
        throw error
      }
    }
    
    // Create tables if they don't exist
    await createSupabaseTables()
  } catch (error) {
    console.error('[Database] Failed to initialize Supabase, falling back to SQLite:', error.message)
    // Fallback to SQLite
    initSQLite()
  }
}

/**
 * Initialize SQLite connection
 */
function initSQLite() {
  if (!sqliteDb) {
    sqliteDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err)
      } else {
        console.log('Connected to SQLite database')
      }
    })
  }
  createSQLiteTables()
}

/**
 * Create Supabase/PostgreSQL tables
 */
async function createSupabaseTables() {
  if (!pgPool) {
    console.warn('[Database] No PostgreSQL pool, skipping table creation')
    return
  }

  const client = await pgPool.connect()
  try {
    // Username registry
    await client.query(`
      CREATE TABLE IF NOT EXISTS usernames (
        username TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        registered_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        is_premium INTEGER DEFAULT 0
      )
    `)

    // Payments tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        tx_hash TEXT PRIMARY KEY,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        from_username TEXT,
        to_username TEXT,
        token_address TEXT NOT NULL,
        amount TEXT NOT NULL,
        fee TEXT DEFAULT '0',
        status TEXT DEFAULT 'pending',
        memo TEXT,
        target_chain TEXT,
        target_chain_id BIGINT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `)

    // Receipts
    await client.query(`
      CREATE TABLE IF NOT EXISTS receipts (
        id SERIAL PRIMARY KEY,
        tx_hash TEXT UNIQUE NOT NULL,
        share_link TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `)

    // Telegram user mapping
    await client.query(`
      CREATE TABLE IF NOT EXISTS telegram_users (
        telegram_id BIGINT PRIMARY KEY,
        wallet_address TEXT,
        username TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
      )
    `)

    // Scheduled payments
    await client.query(`
      CREATE TABLE IF NOT EXISTS scheduled_payments (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        recipient_username TEXT NOT NULL,
        amount TEXT NOT NULL,
        token_symbol TEXT NOT NULL,
        token_address TEXT NOT NULL,
        memo TEXT,
        scheduled_for BIGINT NOT NULL,
        status TEXT DEFAULT 'pending',
        tx_hash TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
      )
    `)

    // Create indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status 
      ON scheduled_payments(status, scheduled_for)
    `)

    // Swaps tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS swaps (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        from_token TEXT NOT NULL,
        to_token TEXT NOT NULL,
        from_amount TEXT NOT NULL,
        to_amount TEXT,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending',
        price_impact TEXT,
        slippage_bps INTEGER DEFAULT 100,
        pool_address TEXT,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_swaps_user_status 
      ON swaps(user_id, status, created_at)
    `)

    // Polymarket bets tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS polymarket_bets (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        market_id TEXT NOT NULL,
        market_question TEXT NOT NULL,
        side TEXT NOT NULL CHECK(side IN ('YES', 'NO')),
        token_id TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        price NUMERIC NOT NULL,
        shares NUMERIC NOT NULL,
        order_id TEXT,
        order_hash TEXT,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'submitted', 'filled', 'cancelled', 'failed')),
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        filled_at BIGINT,
        FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_polymarket_bets_user_status 
      ON polymarket_bets(user_id, status, created_at)
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_polymarket_bets_market 
      ON polymarket_bets(market_id, status)
    `)

    // Bridge transactions tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS bridge_transactions (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        from_chain INTEGER NOT NULL,
        to_chain INTEGER NOT NULL,
        token_symbol TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        tx_hash TEXT,
        status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
        estimated_time INTEGER,
        created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()),
        completed_at BIGINT,
        FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
      )
    `)

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_bridge_transactions_user_status 
      ON bridge_transactions(user_id, status, created_at)
    `)

    console.log('[Database] Supabase tables created/verified')
  } catch (error) {
    console.error('[Database] Error creating Supabase tables:', error)
    throw error
  } finally {
    client.release()
  }
}

/**
 * Create SQLite tables (fallback)
 */
function createSQLiteTables() {
  const db = getSQLiteDatabase()
  
  // Username registry
  db.run(`
    CREATE TABLE IF NOT EXISTS usernames (
      username TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      registered_at INTEGER DEFAULT (strftime('%s', 'now')),
      is_premium INTEGER DEFAULT 0
    )
  `)
  
  // Payments tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      tx_hash TEXT PRIMARY KEY,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      from_username TEXT,
      to_username TEXT,
      token_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      fee TEXT DEFAULT '0',
      status TEXT DEFAULT 'pending',
      memo TEXT,
      target_chain TEXT,
      target_chain_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)
  
  // Receipts
  db.run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tx_hash TEXT UNIQUE NOT NULL,
      share_link TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)
  
  // Telegram user mapping
  db.run(`
    CREATE TABLE IF NOT EXISTS telegram_users (
      telegram_id INTEGER PRIMARY KEY,
      wallet_address TEXT,
      username TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)
  
  // Scheduled payments
  db.run(`
    CREATE TABLE IF NOT EXISTS scheduled_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      recipient_username TEXT NOT NULL,
      amount TEXT NOT NULL,
      token_symbol TEXT NOT NULL,
      token_address TEXT NOT NULL,
      memo TEXT,
      scheduled_for INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      tx_hash TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
    )
  `)
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status 
    ON scheduled_payments(status, scheduled_for)
  `)
  
  // Swaps tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS swaps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_token TEXT NOT NULL,
      to_token TEXT NOT NULL,
      from_amount TEXT NOT NULL,
      to_amount TEXT,
      tx_hash TEXT,
      status TEXT DEFAULT 'pending',
      price_impact TEXT,
      slippage_bps INTEGER DEFAULT 100,
      pool_address TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
    )
  `)
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_swaps_user_status 
    ON swaps(user_id, status, created_at)
  `)
  
  // Polymarket bets tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS polymarket_bets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      market_id TEXT NOT NULL,
      market_question TEXT NOT NULL,
      side TEXT NOT NULL CHECK(side IN ('YES', 'NO')),
      token_id TEXT NOT NULL,
      amount REAL NOT NULL,
      price REAL NOT NULL,
      shares REAL NOT NULL,
      order_id TEXT,
      order_hash TEXT,
      tx_hash TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'submitted', 'filled', 'cancelled', 'failed')),
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      filled_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
    )
  `)
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_polymarket_bets_user_status 
    ON polymarket_bets(user_id, status, created_at)
  `)
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_polymarket_bets_market 
    ON polymarket_bets(market_id, status)
  `)
  
  // Bridge transactions tracking
  db.run(`
    CREATE TABLE IF NOT EXISTS bridge_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      from_chain INTEGER NOT NULL,
      to_chain INTEGER NOT NULL,
      token_symbol TEXT NOT NULL,
      amount REAL NOT NULL,
      tx_hash TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'completed', 'failed')),
      estimated_time INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      completed_at INTEGER,
      FOREIGN KEY (user_id) REFERENCES telegram_users(telegram_id)
    )
  `)
  
  db.run(`
    CREATE INDEX IF NOT EXISTS idx_bridge_transactions_user_status 
    ON bridge_transactions(user_id, status, created_at)
  `)
  
  console.log('[Database] SQLite tables created/verified')
}

/**
 * Get SQLite database instance
 */
function getSQLiteDatabase() {
  if (!sqliteDb) {
    sqliteDb = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening SQLite database:', err)
      }
    })
  }
  return sqliteDb
}

/**
 * Execute a query (INSERT, UPDATE, DELETE)
 * Returns: { lastID, changes }
 */
export const dbRun = async (query, params = []) => {
  if (useSupabase && pgPool) {
    // PostgreSQL
    const client = await pgPool.connect()
    try {
      // Convert SQLite parameter placeholders (?) to PostgreSQL ($1, $2, ...)
      const pgQuery = convertQueryToPostgres(query, params)
      const result = await client.query(pgQuery.query, pgQuery.params)
      return {
        lastID: result.rows[0]?.id || result.insertId || null,
        changes: result.rowCount || 0
      }
    } finally {
      client.release()
    }
  } else {
    // SQLite
    return new Promise((resolve, reject) => {
      const db = getSQLiteDatabase()
      db.run(query, params, function(err) {
        if (err) reject(err)
        else resolve({ lastID: this.lastID, changes: this.changes })
      })
    })
  }
}

/**
 * Get a single row
 */
export const dbGet = async (query, params = []) => {
  if (useSupabase && pgPool) {
    // PostgreSQL
    const client = await pgPool.connect()
    try {
      const pgQuery = convertQueryToPostgres(query, params)
      const result = await client.query(pgQuery.query, pgQuery.params)
      return result.rows[0] || null
    } finally {
      client.release()
    }
  } else {
    // SQLite
    return new Promise((resolve, reject) => {
      const db = getSQLiteDatabase()
      db.get(query, params, (err, row) => {
        if (err) reject(err)
        else resolve(row || null)
      })
    })
  }
}

/**
 * Get all rows
 */
export const dbAll = async (query, params = []) => {
  if (useSupabase && pgPool) {
    // PostgreSQL
    const client = await pgPool.connect()
    try {
      const pgQuery = convertQueryToPostgres(query, params)
      const result = await client.query(pgQuery.query, pgQuery.params)
      return result.rows || []
    } finally {
      client.release()
    }
  } else {
    // SQLite
    return new Promise((resolve, reject) => {
      const db = getSQLiteDatabase()
      db.all(query, params, (err, rows) => {
        if (err) reject(err)
        else resolve(rows || [])
      })
    })
  }
}

/**
 * Convert SQLite query to PostgreSQL format
 * Converts ? placeholders to $1, $2, etc.
 */
function convertQueryToPostgres(query, params) {
  let paramIndex = 1
  const convertedQuery = query.replace(/\?/g, () => `$${paramIndex++}`)
  
  return {
    query: convertedQuery,
    params: params
  }
}

/**
 * Get database type (for debugging)
 */
export const getDatabaseType = () => dbType

/**
 * Close database connections
 */
export const closeDatabase = async () => {
  if (pgPool) {
    await pgPool.end()
    console.log('[Database] PostgreSQL pool closed')
  }
  if (sqliteDb) {
    sqliteDb.close()
    console.log('[Database] SQLite connection closed')
  }
}



