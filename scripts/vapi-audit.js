const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

function request(method, path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai', port: 443, path, method,
      headers: { 'Authorization': `Bearer ${VAPI_TOKEN}`, 'Content-Type': 'application/json' }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });
}

async function fullAudit() {
  console.log('=== VAPI FULL AUDIT ===\n');

  // 1. Get assistant
  const asst = await request('GET', `/assistant/${ASSISTANT_ID}`);
  console.log('Assistant Name:', asst.name);
  console.log('Server URL:', asst.serverUrl || 'NOT SET');
  console.log('Model:', asst.model?.model);
  console.log('Tool IDs:', JSON.stringify(asst.model?.toolIds || []));
  console.log('');

  // 2. Get all tools and show their details
  const tools = await request('GET', '/tool');
  const attachedIds = asst.model?.toolIds || [];

  console.log(`Total tools in library: ${tools.length}`);
  console.log(`Attached to assistant: ${attachedIds.length}\n`);

  for (const tool of tools) {
    const name = tool.function?.name || tool.name || 'unnamed';
    const attached = attachedIds.includes(tool.id) ? '✅' : '❌';
    const url = tool.server?.url || 'NO URL!';
    const headers = tool.server?.headers ? JSON.stringify(tool.server.headers) : 'NO HEADERS';
    const type = tool.type;

    console.log(`${attached} ${name}`);
    console.log(`   Type: ${type}`);
    console.log(`   ID: ${tool.id}`);
    console.log(`   URL: ${url}`);
    console.log(`   Headers: ${headers}`);
    console.log('');
  }
}

fullAudit();
