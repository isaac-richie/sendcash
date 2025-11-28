import dotenv from 'dotenv';
import { createThirdwebClient } from 'thirdweb';
import { baseSepolia } from 'thirdweb/chains';
import { defineChain } from 'thirdweb';

dotenv.config();

const THIRDWEB_CLIENT_ID = process.env.THIRDWEB_CLIENT_ID;
const BASE_RPC = process.env.BASE_RPC_URL || 'https://sepolia.base.org';

// Create custom chain (same as in thirdwebWallet.js)
const customBaseSepolia = defineChain({
  id: baseSepolia.id,
  name: baseSepolia.name,
  nativeCurrency: baseSepolia.nativeCurrency,
  rpc: BASE_RPC,
  blockExplorers: baseSepolia.blockExplorers,
  testnet: baseSepolia.testnet,
});

console.log('🔍 Testing Exact Paymaster URL Format...\n');

// Test 1: Check what URL getDefaultBundlerUrl would generate
console.log('📋 Test 1: Expected Bundler URL Format...');
// Based on constants.js: `https://${chain.id}.${domain}/v2`
// For Base Sepolia (84532), it should be: https://84532.rpc.thirdweb.com/v2
const expectedUrl = `https://84532.rpc.thirdweb.com/v2`;
console.log(`  Expected URL: ${expectedUrl}`);
console.log('');

// Test 2: Test the exact paymaster endpoint
console.log('📋 Test 2: Testing Paymaster Endpoint (pm_sponsorUserOperation)...');
const paymasterUrl = expectedUrl;

// Create a dummy UserOperation for testing
const dummyUserOp = {
  sender: '0x0000000000000000000000000000000000000000',
  nonce: '0x0',
  initCode: '0x',
  callData: '0x',
  callGasLimit: '0x0',
  verificationGasLimit: '0x0',
  preVerificationGas: '0x0',
  maxFeePerGas: '0x0',
  maxPriorityFeePerGas: '0x0',
  paymasterAndData: '0x',
  signature: '0x',
};

const paymasterRequest = {
  id: 1,
  jsonrpc: '2.0',
  method: 'pm_sponsorUserOperation',
  params: [dummyUserOp, '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'], // EntryPoint v0.6
};

console.log(`  URL: ${paymasterUrl}`);
console.log(`  Method: ${paymasterRequest.method}`);
console.log(`  Client ID: ${THIRDWEB_CLIENT_ID ? THIRDWEB_CLIENT_ID.substring(0, 10) + '...' : 'NOT SET'}`);
console.log('');

try {
  // Test with Client ID in URL (like our test script)
  const urlWithClientId = `${paymasterUrl}/${THIRDWEB_CLIENT_ID}`;
  console.log(`  Testing URL with Client ID: ${urlWithClientId.substring(0, 80)}...`);
  
  const response1 = await fetch(urlWithClientId, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymasterRequest),
  });
  
  if (response1.ok) {
    const data = await response1.json();
    console.log('  ✅ Paymaster endpoint accessible with Client ID in URL');
    console.log(`  Response: ${JSON.stringify(data).substring(0, 200)}`);
  } else {
    const errorText = await response1.text();
    console.log(`  ⚠️  Paymaster returned: ${response1.status} ${response1.statusText}`);
    console.log(`  Error: ${errorText.substring(0, 200)}`);
  }
} catch (error) {
  console.log(`  ❌ Failed: ${error.message}`);
}
console.log('');

// Test 3: Test without Client ID in URL (how Thirdweb might do it)
console.log('📋 Test 3: Testing Paymaster Endpoint (without Client ID in URL)...');
try {
  const response2 = await fetch(paymasterUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-client-id': THIRDWEB_CLIENT_ID, // Client ID in header
    },
    body: JSON.stringify(paymasterRequest),
  });
  
  if (response2.ok) {
    const data = await response2.json();
    console.log('  ✅ Paymaster endpoint accessible with Client ID in header');
    console.log(`  Response: ${JSON.stringify(data).substring(0, 200)}`);
  } else {
    const errorText = await response2.text();
    console.log(`  ⚠️  Paymaster returned: ${response2.status} ${response2.statusText}`);
    console.log(`  Error: ${errorText.substring(0, 200)}`);
    
    if (response2.status === 401 || response2.status === 403) {
      console.log('  💡 This suggests Client ID authentication issue');
    }
  }
} catch (error) {
  console.log(`  ❌ Failed: ${error.message}`);
  console.log('  💡 This is likely the "fetch failed" error you\'re seeing');
  console.log('  💡 Possible causes:');
  console.log('     - Network timeout');
  console.log('     - DNS resolution failure');
  console.log('     - Firewall blocking');
  console.log('     - Thirdweb service temporarily unavailable');
}
console.log('');

// Test 4: Test with Thirdweb client fetch (how Thirdweb actually does it)
console.log('📋 Test 4: Testing with Thirdweb Client Fetch...');
try {
  const client = createThirdwebClient({
    clientId: THIRDWEB_CLIENT_ID,
  });
  
  // Get the fetch function that Thirdweb uses
  const { getClientFetch } = await import('thirdweb/utils/fetch.js');
  const fetchWithHeaders = getClientFetch(client);
  
  const response3 = await fetchWithHeaders(paymasterUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(paymasterRequest),
  });
  
  if (response3.ok) {
    const data = await response3.json();
    console.log('  ✅ Paymaster accessible via Thirdweb client fetch');
    console.log(`  Response: ${JSON.stringify(data).substring(0, 200)}`);
  } else {
    const errorText = await response3.text();
    console.log(`  ⚠️  Paymaster returned: ${response3.status} ${response3.statusText}`);
    console.log(`  Error: ${errorText.substring(0, 200)}`);
  }
} catch (error) {
  console.log(`  ❌ Failed: ${error.message}`);
  console.log('  💡 This is the exact error you\'re seeing in production');
  console.log(`  💡 Error type: ${error.constructor.name}`);
  if (error.cause) {
    console.log(`  💡 Error cause: ${error.cause.message || error.cause}`);
  }
}
console.log('');

// Test 5: Test timeout scenarios
console.log('📋 Test 5: Testing Timeout Scenarios...');
const timeoutTests = [
  { timeout: 5000, name: '5 second timeout' },
  { timeout: 10000, name: '10 second timeout' },
  { timeout: 30000, name: '30 second timeout' },
];

for (const test of timeoutTests) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), test.timeout);
    
    const response = await fetch(paymasterUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-client-id': THIRDWEB_CLIENT_ID,
      },
      body: JSON.stringify(paymasterRequest),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log(`  ✅ ${test.name}: Success`);
    } else {
      console.log(`  ⚠️  ${test.name}: ${response.status}`);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`  ❌ ${test.name}: Timeout (request took longer than ${test.timeout}ms)`);
    } else {
      console.log(`  ❌ ${test.name}: ${error.message}`);
    }
  }
}
console.log('');

console.log('📊 Summary:');
console.log('  If Test 4 fails with "fetch failed", it\'s likely a network/timeout issue.');
console.log('  If Test 4 succeeds but production fails, check the UserOperation format.');
console.log('  If Test 5 shows timeouts, the bundler might be slow or overloaded.');
console.log('');

