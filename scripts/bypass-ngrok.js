const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

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

async function bypassNgrokWarning() {
  try {
    console.log('🛡️ Adding Ngrok Bypass Headers to all tools...');
    
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const toolIds = assistant.model.toolIds || [];

    for (const id of toolIds) {
      console.log(`Updating tool ${id}...`);
      await request('PATCH', `/tool/${id}`, {
        server: {
          url: undefined, // Mevcut URL kalsın
          headers: {
            "ngrok-skip-browser-warning": "true"
          }
        }
      });
    }

    console.log('✅ ALL TOOLS UPDATED WITH BYPASS HEADERS!');
    console.log('🚀 IMPORTANT: Refresh Vapi Dashboard and click "Publish" one last time.');

  } catch (err) {
    console.error('Bypass update failed:', err.message);
  }
}

bypassNgrokWarning();
