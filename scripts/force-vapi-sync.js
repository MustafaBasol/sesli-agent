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

async function forceFinalSync() {
  try {
    console.log('🔄 Fetching entire tool library...');
    const allTools = await request('GET', '/tool');
    
    // Asistanın çalışması için gerekli olan TAM liste
    const targetTools = [
      'get_customer_profile',
      'get_menu_info',
      'get_item_details',
      'get_opening_hours',
      'check_availability',
      'create_reservation_request',
      'cancel_reservation_request',
      'modify_reservation_request',
      'transfer_to_staff',
      'log_call_summary'
    ];

    const selectedIds = [];
    targetTools.forEach(name => {
      // İsme göre en güncel aracı bul (genelde son eklenen)
      const matches = allTools.filter(t => (t.function?.name === name || t.name === name));
      if (matches.length > 0) {
        // En son oluşturulanı seç (genellikle ID bazlı sıralı olur)
        const bestMatch = matches[matches.length - 1];
        selectedIds.push(bestMatch.id);
        console.log(`📍 Matched: ${name} -> ID: ${bestMatch.id}`);
      } else {
        console.warn(`⚠️ Warning: Tool "${name}" not found in library!`);
      }
    });

    console.log(`\n🎯 Attaching ${selectedIds.length} tools to the assistant...`);
    
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        toolIds: [...new Set(selectedIds)]
      }
    });

    console.log('✅ FORCED SYNC COMPLETE! Please refresh Vapi dashboard.');

  } catch (err) {
    console.error('Final sync failed:', err.message);
  }
}

forceFinalSync();
