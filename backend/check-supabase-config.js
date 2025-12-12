/**
 * Check Supabase Configuration
 * Shows which Supabase environment variables are set (without revealing values)
 */

import dotenv from 'dotenv'
dotenv.config()

console.log('🔍 Checking Supabase Configuration...\n')

// Check for Supabase variables
const hasSupabaseUrl = !!process.env.SUPABASE_URL
const hasSupabaseKey = !!process.env.SUPABASE_KEY
const hasDatabaseUrl = !!process.env.DATABASE_URL

console.log('Environment Variables Status:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`SUPABASE_URL:     ${hasSupabaseUrl ? '✅ SET' : '❌ NOT SET'}`)
if (hasSupabaseUrl) {
  const url = process.env.SUPABASE_URL
  const projectId = url.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || 'unknown'
  console.log(`                  Project ID: ${projectId}`)
  console.log(`                  Full URL: ${url}`)
}

console.log(`SUPABASE_KEY:     ${hasSupabaseKey ? '✅ SET' : '❌ NOT SET'}`)
if (hasSupabaseKey) {
  const key = process.env.SUPABASE_KEY
  console.log(`                  Key length: ${key.length} chars`)
  console.log(`                  Key preview: ${key.substring(0, 20)}...`)
}

console.log(`DATABASE_URL:     ${hasDatabaseUrl ? '✅ SET' : '❌ NOT SET'}`)
if (hasDatabaseUrl) {
  const dbUrl = process.env.DATABASE_URL
  // Mask password in URL
  const maskedUrl = dbUrl.replace(/:\/\/[^:]+:[^@]+@/, '://***:***@')
  console.log(`                  ${maskedUrl}`)
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// Determine which database will be used
const useSupabase = !!(process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_KEY))
const dbType = useSupabase ? 'supabase' : 'sqlite'

console.log('📊 Database Selection:')
console.log(`   Will use: ${dbType.toUpperCase()}`)

if (useSupabase) {
  if (process.env.DATABASE_URL) {
    console.log('   Method: Direct PostgreSQL connection (DATABASE_URL)')
  } else {
    console.log('   Method: Supabase client (SUPABASE_URL + SUPABASE_KEY)')
  }
} else {
  console.log('   Method: SQLite (fallback - no Supabase config found)')
}

console.log('\n✅ Configuration check complete!')



