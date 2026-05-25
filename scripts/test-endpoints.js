/**
 * Test script to simulate Vapi tool calls to local endpoints.
 * Usage: node scripts/test-endpoints.js [endpoint_name]
 * Example: node scripts/test-endpoints.js create-reservation
 */

const http = require('http');

const PORT = 3000;
const HOST = 'localhost';

const samplePayloads = {
  'create-reservation': {
    customer_name: 'Mustafa Test',
    phone_number: '+905551234567',
    party_size: 4,
    reservation_date: '2024-05-15',
    reservation_time: '20:00',
    language: 'tr',
    special_request: 'Window side table please',
    call_id: 'test-call-123'
  },
  'modify-reservation': {
    customer_name: 'Mustafa Test',
    phone_number: '+905551234567',
    new_reservation_date: '2024-05-16',
    new_reservation_time: '21:00',
    language: 'en',
    call_id: 'test-call-123'
  },
  'cancel-reservation': {
    customer_name: 'Mustafa Test',
    phone_number: '+905551234567',
    language: 'fr',
    reason: 'Change of plans',
    call_id: 'test-call-123'
  },
  'handoff': {
    phone_number: '+905551234567',
    language: 'tr',
    reason: 'Customer is angry about the wait time',
    conversation_summary: 'Customer called to complain about a previous reservation.',
    urgency: 'high',
    call_id: 'test-call-123'
  },
  'log-summary': {
    call_id: 'test-call-123',
    caller_phone: '+905551234567',
    customer_name: 'Mustafa Test',
    language: 'tr',
    intent: 'reservation_create',
    summary: 'Customer successfully made a reservation for 4 people.',
    outcome: 'completed'
  }
};

async function testEndpoint(name) {
  const payload = samplePayloads[name];
  if (!payload) {
    console.log(`Unknown endpoint: ${name}. Available: ${Object.keys(samplePayloads).join(', ')}`);
    return;
  }

  const endpointMap = {
    'create-reservation': '/api/vapi/create-reservation-request',
    'modify-reservation': '/api/vapi/modify-reservation-request',
    'cancel-reservation': '/api/vapi/cancel-reservation-request',
    'handoff': '/api/vapi/handoff-to-staff',
    'log-summary': '/api/vapi/log-call-summary'
  };

  const path = endpointMap[name];
  
  // Test 1: Direct Payload
  console.log(`\n--- Testing ${name} (Direct Payload) ---`);
  await sendRequest(path, payload);

  // Test 2: Nested Vapi Payload
  console.log(`\n--- Testing ${name} (Nested Vapi Payload) ---`);
  const nestedPayload = {
    message: {
      type: 'tool-calls',
      call: { id: payload.call_id },
      toolCalls: [
        {
          function: {
            name: name.replace('-', '_'),
            arguments: payload
          }
        }
      ]
    }
  };
  await sendRequest(path, nestedPayload);
}

function sendRequest(path, data) {
  return new Promise((resolve) => {
    const postData = JSON.stringify(data);
    const options = {
      hostname: HOST,
      port: PORT,
      path: path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${body}`);
        resolve();
      });
    });

    req.on('error', (e) => {
      console.error(`Problem with request: ${e.message}`);
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

const arg = process.argv[2];
if (arg) {
  testEndpoint(arg);
} else {
  console.log('Testing all endpoints...');
  (async () => {
    for (const name of Object.keys(samplePayloads)) {
      await testEndpoint(name);
    }
  })();
}
