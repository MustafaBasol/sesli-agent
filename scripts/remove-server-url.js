const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai', port: 443, path, method,
      headers: { 'Authorization': `Bearer ${VAPI_TOKEN}`, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data ? JSON.parse(data) : {}));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function removeServerUrl() {
  console.log('🔧 Removing serverUrl from assistant...');
  
  await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
    serverUrl: null
  });

  // Verify
  const asst = await request('GET', `/assistant/${ASSISTANT_ID}`);
  console.log('Server URL after fix:', asst.serverUrl || 'REMOVED ✅');
  console.log('\n🚀 Each tool will now use its OWN individual URL.');
  console.log('Please Publish in Vapi Dashboard and test again!');
}

removeServerUrl();
