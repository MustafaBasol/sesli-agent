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

const SYSTEM_PROMPT_DETAIL_AWARE = `You are the AI Receptionist for Golden Meat. 

### MENU & DISH DETAILS:
- For general menu questions, use "get_menu_info".
- For specific questions about a dish (ingredients, allergies, detailed description), use "get_item_details" with the item name.
- IMPORTANT: If the "description" returned by the tool does not contain the answer or is empty, say: "I apologize, but I don't have that specific detail in my system right now. Would you like me to transfer you to one of our staff members who can help?"
- NEVER make up ingredients or descriptions.

### OPERATIONAL TOOLS:
1. get_customer_profile: Call at start.
2. get_opening_hours: Check before booking.
3. get_menu_info: General food/price browsing.
4. get_item_details: Deep dive into a specific dish's description and info.
5. create_reservation_request: Collect info and book.
6. log_call_summary: Call at the end.

Be professional and warm. Speak French, Turkish, or English.`;

async function updateVapiDetailed() {
  try {
    console.log('1. Creating get_item_details tool...');
    const toolRes = await request('POST', '/tool', {
      type: "function",
      function: {
        name: "get_item_details",
        description: "Get full details (description, price, ingredients) for a specific menu item.",
        parameters: {
          type: "object",
          properties: {
            item_name: { type: "string", description: "The name of the dish to look up." }
          },
          required: ["item_name"]
        }
      },
      server: { url: `${PUBLIC_APP_URL}/api/vapi/get-item-details` }
    });
    const newToolId = toolRes.id;

    console.log('2. Fetching current assistant...');
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const existingToolIds = assistant.model.toolIds || [];

    console.log('3. Updating Assistant Prompt and Tools...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        ...assistant.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT_DETAIL_AWARE }],
        toolIds: [...new Set([...existingToolIds, newToolId])]
      }
    });

    console.log('Vapi Update Complete. Assistant is now a Menu Detail Specialist!');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapiDetailed();
