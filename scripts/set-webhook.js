const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const BASE = process.env.PUBLIC_APP_URL;

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

async function setWebhook() {
  const webhookUrl = `${BASE}/api/vapi/webhook`;
  console.log(`Setting serverUrl to: ${webhookUrl}`);
  
  await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
    serverUrl: webhookUrl,
    serverMessages: ["conversation-update", "tool-calls", "transfer-destination-request", "end-of-call-report", "hang"],
    artifactPlan: {
      recordingEnabled: true,
      recordingFormat: "mp3",
      loggingEnabled: true,
      transcriptPlan: {
        enabled: true,
        assistantName: "Golden Meat",
        userName: "Guest"
      }
    }
  });
  
  const asst = await request('GET', `/assistant/${ASSISTANT_ID}`);
  console.log('Verified serverUrl:', asst.serverUrl);
  console.log('✅ Webhook is now the central handler for ALL tool calls.');
}

setWebhook();
