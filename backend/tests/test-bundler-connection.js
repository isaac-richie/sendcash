import dotenv from 'dotenv';
import { createThirdwebClient } from 'thirdweb';
import { baseSepolia } from 'thirdweb/chains';
import { defineChain } from 'thirdweb';

dotenv.config();

const THIRDWEB_CLIENT_ID = process.env.THIRDWEB_CLIENT_ID;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://sepolia.base.org';

console.log('🔍 Testing Thirdweb Bundler Connection...\n');
console.log('Configuration:');
console.log(`  THIRDWEB_CLIENT_ID: ${THIRDWEB_CLIENT_ID ? 'SET (' + THIRDWEB_CLIENT_ID.substring(0, 10) + '...)' : 'NOT SET ❌'}`);
console.log(`  BASE_RPC: ${BASE_RPC}`);
console.log('');

// Test 1: Check THIRDWEB_CLIENT_ID
console.log('📋 Test 1: Checking THIRDWEB_CLIENT_ID...');
if (!THIRDWEB_CLIENT_ID || THIRDWEB_CLIENT_ID === 'YOUR_CLIENT_ID' || THIRDWEB_CLIENT_ID.length < 10) {
  console.log('  ❌ THIRDWEB_CLIENT_ID is invalid or not set');
  console.log('  💡 Get your Client ID from: https://thirdweb.com/dashboard');
} else {
  console.log('  ✅ THIRDWEB_CLIENT_ID is set');
}
console.log('');

// Test 2: Test Thirdweb Client Creation
console.log('📋 Test 2: Testing Thirdweb Client Creation...');
try {
  const client = createThirdwebClient({
    clientId: THIRDWEB_CLIENT_ID,
  });
  console.log('  ✅ Thirdweb client created successfully');
} catch (error) {
  console.log('  ❌ Failed to create Thirdweb client:', error.message);
}
console.log('');

// Test 3: Test Base Sepolia RPC Connection
console.log('📋 Test 3: Testing Base Sepolia RPC Connection...');
try {
  const response = await fetch(BASE_RPC, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'eth_blockNumber',
      params: [],
      id: 1,
    }),
  });
  
  if (response.ok) {
    const data = await response.json();
    console.log('  ✅ Base Sepolia RPC is accessible');
    console.log(`  📊 Current block: ${data.result}`);
  } else {
    console.log(`  ❌ Base Sepolia RPC returned error: ${response.status} ${response.statusText}`);
  }
} catch (error) {
  console.log('  ❌ Failed to connect to Base Sepolia RPC:', error.message);
  console.log('  💡 Check your BASE_RPC_URL in .env');
}
console.log('');

// Test 4: Test Thirdweb Bundler Endpoint (Base Sepolia)
console.log('📋 Test 4: Testing Thirdweb Bundler Endpoint...');
const bundlerUrl = `https://84532.rpc.thirdweb.com/v2/${THIRDWEB_CLIENT_ID}`;
console.log(`  Bundler URL: ${bundlerUrl.substring(0, 50)}...`);

try {
  // Test bundler health endpoint
  const bundlerHealthUrl = `https://84532.rpc.thirdweb.com/health`;
  console.log(`  Testing health endpoint: ${bundlerHealthUrl}`);
  
  const healthResponse = await fetch(bundlerHealthUrl, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (healthResponse.ok) {
    const healthData = await healthResponse.text();
    console.log('  ✅ Bundler health endpoint is accessible');
    console.log(`  Response: ${healthData.substring(0, 100)}`);
  } else {
    console.log(`  ⚠️  Bundler health endpoint returned: ${healthResponse.status}`);
  }
} catch (error) {
  console.log('  ❌ Failed to connect to bundler health endpoint:', error.message);
}
console.log('');

// Test 5: Test Bundler with Client ID
console.log('📋 Test 5: Testing Bundler with Client ID...');
try {
  const testRequest = {
    jsonrpc: '2.0',
    method: 'eth_chainId',
    params: [],
    id: 1,
  };
  
  const bundlerResponse = await fetch(bundlerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': THIRDWEB_CLIENT_ID,
    },
    body: JSON.stringify(testRequest),
  });
  
  if (bundlerResponse.ok) {
    const data = await bundlerResponse.json();
    console.log('  ✅ Bundler is accessible with Client ID');
    console.log(`  Chain ID: ${data.result}`);
  } else {
    const errorText = await bundlerResponse.text();
    console.log(`  ❌ Bundler returned error: ${bundlerResponse.status} ${bundlerResponse.statusText}`);
    console.log(`  Error details: ${errorText.substring(0, 200)}`);
    
    if (bundlerResponse.status === 401 || bundlerResponse.status === 403) {
      console.log('  💡 This suggests an invalid or unauthorized Client ID');
    }
  }
} catch (error) {
  console.log('  ❌ Failed to connect to bundler:', error.message);
  console.log('  💡 Possible causes:');
  console.log('     - Network connectivity issue');
  console.log('     - Firewall blocking the request');
  console.log('     - Invalid THIRDWEB_CLIENT_ID');
  console.log('     - Thirdweb bundler not available for Base Sepolia');
}
console.log('');

// Test 6: Test DNS Resolution
console.log('📋 Test 6: Testing DNS Resolution...');
try {
  const dns = await import('dns');
  const { promisify } = await import('util');
  const lookup = promisify(dns.lookup);
  
  const hostname = '84532.rpc.thirdweb.com';
  const address = await lookup(hostname);
  console.log(`  ✅ DNS resolution successful for ${hostname}`);
  console.log(`  IP Address: ${address.address}`);
} catch (error) {
  console.log(`  ❌ DNS resolution failed: ${error.message}`);
  console.log('  💡 Check your internet connection and DNS settings');
}
console.log('');

// Test 7: Test Alternative Bundler Endpoints
console.log('📋 Test 7: Testing Alternative Bundler Endpoints...');
const alternativeEndpoints = [
  'https://84532.rpc.thirdweb.com',
  'https://bundler.thirdweb.com',
  'https://rpc.thirdweb.com',
];

for (const endpoint of alternativeEndpoints) {
  try {
    const testUrl = `${endpoint}/health`;
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (response.ok) {
      console.log(`  ✅ ${endpoint} is accessible`);
    } else {
      console.log(`  ⚠️  ${endpoint} returned: ${response.status}`);
    }
  } catch (error) {
    console.log(`  ❌ ${endpoint} failed: ${error.message}`);
  }
}
console.log('');

// Summary
console.log('📊 Summary:');
console.log('  If all tests pass, the bundler should work.');
console.log('  If Test 4 or 5 fail, check your THIRDWEB_CLIENT_ID.');
console.log('  If Test 3 fails, check your BASE_RPC_URL.');
console.log('  If Test 6 fails, check your network/DNS.');
console.log('');

