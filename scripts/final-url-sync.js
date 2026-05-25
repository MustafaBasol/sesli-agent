const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL;

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = { hostname: 'api.vapi.ai', port: 443, path, method, headers: commonHeaders };
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

async function updateRemainingTools() {
  try {
    console.log(`🌍 Syncing remaining tools with URL: ${PUBLIC_APP_URL}`);
    
    const allTools = await request('GET', '/tool');
    const remainingTools = [
      { name: 'cancel_reservation_request', path: '/api/vapi/cancel-reservation-request' },
      { name: 'modify_reservation_request', path: '/api/vapi/modify-reservation-request' },
      { name: 'get_opening_hours', path: '/api/vapi/get-opening-hours' }
    ];

    for (const tool of remainingTools) {
      const existing = allTools.find(t => (t.function?.name === tool.name || t.name === tool.name));
      if (existing) {
        console.log(`Updating ${tool.name}...`);
        await request('PATCH', `/tool/${existing.id}`, {
          server: { url: `${PUBLIC_APP_URL}${tool.path}` }
        });
      }
    }

    // Also update assistant's server URL if set
    console.log('Updating Assistant main configuration...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      serverUrl: `${PUBLIC_APP_URL}/api/vapi/webhook`
    });

    console.log('✅ ALL SYSTEMS POINTING TO NEW NGROK ADRESS!');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateRemainingTools();
