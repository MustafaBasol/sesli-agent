const http = require('http');

async function testAPI(path, body) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.write(JSON.stringify(body));
    req.end();
  });
}

async function runTests() {
  console.log('🧪 Starting System Functionality Tests...\n');

  // Test 1: Unified Availability - Max Party Size
  console.log('Test 1: Checking Max Party Size (Asking for 25 people)...');
  const res1 = await testAPI('/api/vapi/check-availability', { 
    date: '2026-05-20', time: '19:00', party_size: 25 
  });
  console.log('Result:', res1.available === false && res1.reason === 'Party Too Large' ? '✅ PASS' : '❌ FAIL', `(${res1.message})\n`);

  // Test 2: Unified Availability - Outside Hours
  console.log('Test 2: Checking Late Night (Asking for 03:00 AM)...');
  const res2 = await testAPI('/api/vapi/check-availability', { 
    date: '2026-05-20', time: '03:00', party_size: 4 
  });
  console.log('Result:', res2.available === false && res2.reason === 'Outside Hours' ? '✅ PASS' : '❌ FAIL', `(${res2.message})\n`);

  // Test 3: Menu Item Details
  console.log('Test 3: Checking Menu Detail for "Baklava"...');
  const res3 = await testAPI('/api/vapi/get-item-details', { item_name: 'Baklava' });
  console.log('Result:', res3.description ? '✅ PASS' : '❌ FAIL', `(Description: ${res3.description?.slice(0, 50)}...)\n`);

  // Test 4: Holiday Closure (Assumes a holiday exists or tests the check logic)
  console.log('Test 4: Checking Availability API Structure...');
  const res4 = await testAPI('/api/vapi/check-availability', { 
    date: '2026-05-15', time: '19:00', party_size: 2 
  });
  console.log('Result:', res4.hasOwnProperty('available') ? '✅ PASS' : '❌ FAIL', '\n');

  console.log('🏁 All Automated Tests Completed.');
}

runTests();
