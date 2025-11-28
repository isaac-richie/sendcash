import sqlite3 from 'sqlite3'
import { promisify } from 'util'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '../data/sendcash.db')

let db = null

export const getDatabase = () => {
  if (!db) {
    db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err)
      } else {
        console.log('Connected to SQLite database')
      }
    })
  }
  return db
}

export const initDatabase = () => {
  const db = getDatabase()
  
  // Username registry (cache of on-chain data)
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
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )
  `)
  
  // ✅ QUICK WIN 1: Add memo column if it doesn't exist (migration)
  db.run(`
    ALTER TABLE payments ADD COLUMN memo TEXT
  `, (err) => {
    // Ignore error if column already exists
    if (err && !err.message.includes('duplicate column name')) {
      console.warn('Note: memo column may already exist')
    }
  })
  
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
  
  console.log('Database initialized')
}

// Promisified database methods
export const dbRun = (query, params = []) => {
  return new Promise((resolve, reject) => {
    const db = getDatabase()
    db.run(query, params, function(err) {
      if (err) reject(err)
      else resolve({ lastID: this.lastID, changes: this.changes })
    })
  })
}

export const dbGet = (query, params = []) => {
  return new Promise((resolve, reject) => {
    const db = getDatabase()
    db.get(query, params, (err, row) => {
      if (err) reject(err)
      else resolve(row)
    })
  })
}

export const dbAll = (query, params = []) => {
  return new Promise((resolve, reject) => {
    const db = getDatabase()
    db.all(query, params, (err, rows) => {
      if (err) reject(err)
      else resolve(rows)
    })
  })
}

