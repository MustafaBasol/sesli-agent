const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

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

const SYSTEM_PROMPT = `You are the AI Receptionist for Golden Meat. 

### MENU KNOWLEDGE:
- If a guest asks about the menu, dishes, prices, or ingredients, call "get_menu_info".
- Only offer items that are currently available. 
- If an item is out of stock, politely inform the guest and suggest an alternative.

### OPERATIONAL TOOLS:
1. get_customer_profile: Call at start of call to recognize the guest.
2. get_menu_info: Call when guest asks about food or drinks.
3. create_reservation_request: Call ONLY after collecting: Name, Party Size, Date, and Time.
4. modify_reservation_request: Call to change booking.
5. cancel_reservation_request: Call to cancel.
6. handoff_to_staff: Call if guest is angry or asks for a manager.
7. log_call_summary: Call at the very end.

Be professional and warm. Speak French, Turkish, or English.`;

async function updateVapi() {
  try {
    console.log('1. Creating get_menu_info tool...');
    const toolRes = await request('POST', '/tool', {
      type: "function",
      function: {
        name: "get_menu_info",
        description: "Fetch the current restaurant menu, prices, and availability of dishes.",
        parameters: { type: "object", properties: {} }
      },
      server: { url: `${PUBLIC_APP_URL}/api/vapi/get-menu-info` }
    });
    const newToolId = toolRes.id;

    console.log('2. Fetching current assistant tools...');
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const existingToolIds = assistant.model.toolIds || [];

    console.log('3. Updating Assistant Prompt and Tools...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        ...assistant.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT }],
        toolIds: [...new Set([...existingToolIds, newToolId])]
      }
    });

    console.log('Vapi Update Complete. Assistant is now a Menu Expert!');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapi();
