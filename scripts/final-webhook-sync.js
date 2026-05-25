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

async function finalConfiguration() {
  try {
    console.log(`🔗 Linking Assistant Webhook to: ${PUBLIC_APP_URL}/api/vapi/webhook`);
    
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      serverUrl: `${PUBLIC_APP_URL}/api/vapi/webhook`,
      serverUrlSecret: "golden_meat_secret", // Güvenlik için
    });

    console.log('✅ WEBHOOK SYNCED!');
    console.log('🏁 Everything is set. Please make sure to click "Publish" in Vapi Dashboard.');
  } catch (err) {
    console.error('Final config failed:', err.message);
  }
}

finalConfiguration();
