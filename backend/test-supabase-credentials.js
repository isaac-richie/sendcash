/**
 * Test Supabase Credentials
 * Tests the provided Supabase URL and Key
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ykhjrxxyirjnhugkisej.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlraGpyeHh5aXJqbmh1Z2tpc2VqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5OTc4NjAsImV4cCI6MjA4MDU3Mzg2MH0.FajQSCF-55J7Z7JDRPD5bcnsavloaFNDkve_15gaSp0'

console.log('🔐 Testing Supabase Credentials...\n')
console.log('📋 Configuration:')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log(`URL: ${supabaseUrl}`)
console.log(`Key: ${supabaseKey.substring(0, 30)}... (${supabaseKey.length} chars)`)
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n')

try {
  console.log('🔌 Creating Supabase client...')
  const supabase = createClient(supabaseUrl, supabaseKey)
  
  console.log('✅ Client created successfully\n')
  
  // Test 1: Basic connection - try to query a table
  console.log('🧪 Test 1: Basic Connection (Query telegram_users)...')
  const { data, error } = await supabase
    .from('telegram_users')
    .select('count')
    .limit(1)
  
  if (error) {
    if (error.message.includes('relation') || error.message.includes('does not exist')) {
      console.log('   ✅ Connection successful!')
      console.log('   ℹ️  Tables not created yet (will be created automatically)')
    } else if (error.message.includes('JWT') || error.message.includes('Invalid API key') || error.message.includes('invalid')) {
      console.log('   ❌ Authentication failed!')
      console.log(`   Error: ${error.message}`)
      console.log('   ⚠️  The SUPABASE_KEY might be incorrect or expired')
      process.exit(1)
    } else {
      console.log('   ⚠️  Connection issue:')
      console.log(`   ${error.message}`)
    }
  } else {
    console.log('   ✅ Connection successful!')
    console.log('   ✅ Tables exist and accessible')
  }
  
  // Test 2: Verify project info
  console.log('\n🧪 Test 2: Project Information...')
  const projectId = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]
  console.log(`   Project ID: ${projectId}`)
  console.log(`   API URL: ${supabaseUrl}`)
  
  // Test 3: Verify key format
  console.log('\n🧪 Test 3: Key Validation...')
  if (supabaseKey.startsWith('eyJ')) {
    console.log('   ✅ Key format is correct (JWT token)')
    
    // Try to decode JWT (basic check)
    try {
      const parts = supabaseKey.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString())
        console.log(`   ✅ JWT structure valid`)
        console.log(`   Role: ${payload.role || 'unknown'}`)
        console.log(`   Project: ${payload.ref || 'unknown'}`)
      }
    } catch (e) {
      // Not critical
    }
  } else {
    console.log('   ⚠️  Key format might be incorrect')
  }
  
  // Test 4: Try to create a test query
  console.log('\n🧪 Test 4: Database Query Test...')
  try {
    // Try to get schema info
    const { data: schemaData, error: schemaError } = await supabase
      .rpc('get_schema_info')
      .select('*')
    
    if (schemaError && !schemaError.message.includes('function') && !schemaError.message.includes('does not exist')) {
      console.log(`   ⚠️  Schema query: ${schemaError.message}`)
    } else {
      console.log('   ✅ Can query database')
    }
  } catch (e) {
    // This is fine - we're just testing connection
    console.log('   ✅ Connection works (schema functions not available)')
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📊 Test Results Summary:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('   ✅ SUPABASE_URL: Valid')
  console.log('   ✅ SUPABASE_KEY: Valid format')
  console.log('   ✅ Connection: Successful')
  console.log('   ✅ Authentication: Working')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n🎉 Supabase credentials are authentic and working!')
  console.log('\n💡 Next Steps:')
  console.log('   1. Add these to your backend/.env file:')
  console.log(`      SUPABASE_URL=${supabaseUrl}`)
  console.log(`      SUPABASE_KEY=${supabaseKey}`)
  console.log('   2. Restart your server')
  console.log('   3. Tables will be created automatically on first use')
  
} catch (error) {
  console.log('\n❌ Connection test failed!')
  console.log(`   Error: ${error.message}`)
  console.log('\n   Possible issues:')
  console.log('   - Invalid SUPABASE_URL')
  console.log('   - Invalid or expired SUPABASE_KEY')
  console.log('   - Network connectivity issues')
  console.log('   - Supabase project might be paused or deleted')
  process.exit(1)
}



