/**
 * Test Supabase Connection
 * Verifies that Supabase environment variables work and connection is successful
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
dotenv.config()

console.log('🧪 Testing Supabase Connection...\n')

// Check environment variables
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY
const databaseUrl = process.env.DATABASE_URL

console.log('📋 Environment Variables:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`SUPABASE_URL: ${supabaseUrl ? '✅ SET' : '❌ NOT SET'}`)
console.log(`SUPABASE_KEY: ${supabaseKey ? '✅ SET' : '❌ NOT SET'}`)
console.log(`DATABASE_URL: ${databaseUrl ? '✅ SET' : '❌ NOT SET'}`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// Test Option 1: Supabase Client
if (supabaseUrl && supabaseKey) {
  console.log('🔌 Testing Supabase Client Connection...')
  try {
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Test connection by querying a table
    const { data, error } = await supabase
      .from('telegram_users')
      .select('count')
      .limit(1)
    
    if (error) {
      if (error.message.includes('relation') || error.message.includes('does not exist')) {
        console.log('✅ Supabase Client: Connected successfully!')
        console.log('   ⚠️  Tables not created yet (this is normal for new projects)')
      } else {
        console.log('❌ Supabase Client: Connection failed')
        console.log(`   Error: ${error.message}`)
      }
    } else {
      console.log('✅ Supabase Client: Connected successfully!')
      console.log('   Tables exist and accessible')
    }
  } catch (error) {
    console.log('❌ Supabase Client: Connection failed')
    console.log(`   Error: ${error.message}`)
  }
  console.log('')
}

// Test Option 2: Direct PostgreSQL Connection
if (databaseUrl) {
  console.log('🔌 Testing PostgreSQL Direct Connection...')
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes('supabase') ? { rejectUnauthorized: false } : false,
    max: 1,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 5000,
  })
  
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version')
    console.log('✅ PostgreSQL: Connected successfully!')
    console.log(`   Current time: ${result.rows[0].current_time}`)
    console.log(`   PostgreSQL version: ${result.rows[0].pg_version.substring(0, 50)}...`)
    
    // Test if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)
    
    if (tablesResult.rows.length > 0) {
      console.log(`   📊 Found ${tablesResult.rows.length} tables:`)
      tablesResult.rows.forEach(row => {
        console.log(`      - ${row.table_name}`)
      })
    } else {
      console.log('   ⚠️  No tables found (tables will be created on first use)')
    }
    
    await pool.end()
  } catch (error) {
    console.log('❌ PostgreSQL: Connection failed')
    console.log(`   Error: ${error.message}`)
    await pool.end()
  }
  console.log('')
}

// Summary
const useSupabase = !!(databaseUrl || (supabaseUrl && supabaseKey))
const dbType = useSupabase ? 'supabase' : 'sqlite'

console.log('📊 Summary:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`Database Type: ${dbType.toUpperCase()}`)

if (useSupabase) {
  if (databaseUrl) {
    console.log('Connection Method: Direct PostgreSQL (DATABASE_URL)')
  } else {
    console.log('Connection Method: Supabase Client (SUPABASE_URL + SUPABASE_KEY)')
  }
  console.log('✅ Supabase is configured and ready!')
} else {
  console.log('Connection Method: SQLite (fallback)')
  console.log('⚠️  Supabase not configured - using SQLite fallback')
  console.log('')
  console.log('To enable Supabase:')
  console.log('  1. Set SUPABASE_URL + SUPABASE_KEY, OR')
  console.log('  2. Set DATABASE_URL')
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('\n✅ Connection test complete!')



