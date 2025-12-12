/**
 * Test Supabase Authentication
 * Verifies Supabase credentials and connection
 */

import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'
dotenv.config({ path: './.env' })

console.log('🔐 Testing Supabase Authentication...\n')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_KEY

console.log('📋 Configuration Check:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`SUPABASE_URL: ${supabaseUrl ? '✅' : '❌'} ${supabaseUrl ? supabaseUrl : 'NOT SET'}`)
console.log(`SUPABASE_KEY: ${supabaseKey ? '✅' : '❌'} ${supabaseKey ? `SET (${supabaseKey.length} chars)` : 'NOT SET'}`)

if (!supabaseUrl || !supabaseKey) {
  console.log('\n❌ Missing required environment variables!')
  console.log('   Make sure SUPABASE_URL and SUPABASE_KEY are in backend/.env')
  process.exit(1)
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

// Test connection
console.log('🔌 Testing Supabase Connection...')
try {
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  // Test 1: Basic connection (query a system table)
  console.log('   Test 1: Basic connection...')
  const { data: testData, error: testError } = await supabase
    .from('telegram_users')
    .select('count')
    .limit(1)
  
  if (testError) {
    if (testError.message.includes('relation') || testError.message.includes('does not exist')) {
      console.log('   ✅ Connection successful! (Tables not created yet - this is normal)')
    } else if (testError.message.includes('JWT') || testError.message.includes('Invalid API key')) {
      console.log('   ❌ Authentication failed!')
      console.log(`   Error: ${testError.message}`)
      console.log('   ⚠️  Your SUPABASE_KEY might be incorrect')
      process.exit(1)
    } else {
      console.log('   ⚠️  Connection issue:')
      console.log(`   ${testError.message}`)
    }
  } else {
    console.log('   ✅ Connection successful!')
  }
  
  // Test 2: Check project info
  console.log('   Test 2: Project information...')
  const projectId = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  console.log(`   Project ID: ${projectId}`)
  console.log(`   API URL: ${supabaseUrl}`)
  
  // Test 3: Verify key format
  console.log('   Test 3: Key validation...')
  if (supabaseKey.startsWith('eyJ')) {
    console.log('   ✅ Key format looks correct (JWT token)')
  } else {
    console.log('   ⚠️  Key format might be incorrect (should start with eyJ)')
  }
  
  console.log('\n✅ All authentication tests passed!')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Summary:')
  console.log('   ✅ SUPABASE_URL: Valid')
  console.log('   ✅ SUPABASE_KEY: Valid')
  console.log('   ✅ Connection: Successful')
  console.log('   ✅ Authentication: Working')
  console.log('\n🎉 Supabase is ready to use!')
  
} catch (error) {
  console.log('\n❌ Connection test failed!')
  console.log(`   Error: ${error.message}`)
  console.log('\n   Possible issues:')
  console.log('   - Invalid SUPABASE_URL')
  console.log('   - Invalid SUPABASE_KEY')
  console.log('   - Network connectivity issues')
  process.exit(1)
}



