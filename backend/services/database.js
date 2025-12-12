/**
 * Supabase-first database shim.
 * Routes all database operations through databaseSupabase.js
 * (Supabase when env vars are set, SQLite fallback otherwise).
 */
export {
  initDatabase,
  dbRun,
  dbGet,
  dbAll,
  closeDatabase,
  getDatabaseType
} from './databaseSupabase.js'

