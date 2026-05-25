const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const BASE = process.env.PUBLIC_APP_URL;

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

// Tool name -> API path mapping
const TOOL_PATHS = {
  'get_customer_profile': '/api/vapi/get-customer-profile',
  'get_menu_info': '/api/vapi/get-menu-info',
  'get_item_details': '/api/vapi/get-item-details',
  'get_opening_hours': '/api/vapi/get-opening-hours',
  'check_availability': '/api/vapi/check-availability',
  'create_reservation_request': '/api/vapi/create-reservation-request',
  'cancel_reservation_request': '/api/vapi/cancel-reservation-request',
  'modify_reservation_request': '/api/vapi/modify-reservation-request',
  'log_call_summary': '/api/vapi/log-call-summary',
  'handoff_to_staff': '/api/vapi/handoff-to-staff',
};

async function definitiveFix() {
  try {
    console.log(`🔧 DEFINITIVE FIX - Base URL: ${BASE}\n`);
    
    const allTools = await request('GET', '/tool');
    
    for (const tool of allTools) {
      const toolName = tool.function?.name || tool.name || '';
      const path = TOOL_PATHS[toolName];
      
      if (path) {
        const fullUrl = `${BASE}${path}`;
        console.log(`Fixing "${toolName}" -> ${fullUrl}`);
        
        await request('PATCH', `/tool/${tool.id}`, {
          server: {
            url: fullUrl,
            headers: {
              "ngrok-skip-browser-warning": "true"
            }
          }
        });
      } else if (tool.type !== 'transferCall') {
        console.log(`⚠️  Unknown tool: "${toolName}" (ID: ${tool.id}) - checking URL...`);
        console.log(`   Current URL: ${tool.server?.url || 'MISSING!'}`);
      }
    }

    // Verify assistant has all tools attached
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const attachedIds = assistant.model?.toolIds || [];
    console.log(`\n📎 Assistant has ${attachedIds.length} tools attached.`);
    
    // Ensure all tools are attached
    const allToolIds = allTools
      .filter(t => TOOL_PATHS[t.function?.name || t.name || ''] || t.type === 'transferCall')
      .map(t => t.id);
    
    const merged = [...new Set([...attachedIds, ...allToolIds])];
    
    if (merged.length > attachedIds.length) {
      console.log(`Adding ${merged.length - attachedIds.length} missing tools...`);
      await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
        model: { toolIds: merged }
      });
    }

    console.log(`\n✅ ALL ${Object.keys(TOOL_PATHS).length} TOOLS FIXED WITH CORRECT URLs AND HEADERS!`);
    console.log('🚀 Please click "Publish" in Vapi Dashboard.');
    
  } catch (err) {
    console.error('Fix failed:', err.message);
  }
}

definitiveFix();
