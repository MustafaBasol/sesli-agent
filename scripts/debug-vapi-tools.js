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

async function debugTools() {
  try {
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const toolIds = assistant.model.toolIds || [];
    
    console.log(`🤖 Assistant ID: ${ASSISTANT_ID}`);
    console.log(`🛠️ Attached Tool IDs (${toolIds.length}):`, toolIds);

    const allTools = await request('GET', '/tool');
    const attachedTools = allTools.filter(t => toolIds.includes(t.id));

    console.log('\n✅ ACTUALLY ATTACHED TOOLS:');
    attachedTools.forEach(t => {
      console.log(`- ${t.function?.name || t.name} (ID: ${t.id})`);
    });

  } catch (err) {
    console.error('Debug failed:', err.message);
  }
}

debugTools();
