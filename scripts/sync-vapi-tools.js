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

async function syncAllTools() {
  try {
    console.log('🔍 Fetching all available tools in your Vapi library...');
    const allTools = await request('GET', '/tool');
    
    // Bizim için kritik olan araç isimleri
    const criticalToolNames = [
      'get_customer_profile',
      'get_menu_info',
      'get_item_details',
      'get_opening_hours',
      'check_availability',
      'create_reservation_request',
      'cancel_reservation_request',
      'transfer_to_staff',
      'log_call_summary'
    ];

    const toolsToAttach = allTools.filter(t => 
      criticalToolNames.includes(t.function?.name) || 
      criticalToolNames.includes(t.name)
    );

    const toolIds = toolsToAttach.map(t => t.id);

    console.log(`🎯 Found ${toolIds.length} critical tools to attach.`);

    console.log('🛠️ Attaching tools to assistant...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        toolIds: toolIds
      }
    });

    console.log('✅ ALL TOOLS ARE NOW SYNCED AND ENABLED! Please refresh your Vapi dashboard.');
    console.log('🚀 IMPORTANT: If you see a "Publish" button on Vapi dashboard, please click it to make changes live.');

  } catch (err) {
    console.error('Sync failed:', err.message);
  }
}

syncAllTools();
