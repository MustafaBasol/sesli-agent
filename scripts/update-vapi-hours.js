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

### OPENING HOURS & CLOSURES:
- Before confirming ANY reservation, you MUST call "get_opening_hours" to check if the restaurant is open on that date and time.
- If the guest asks about opening hours, call "get_opening_hours".
- If the restaurant is closed on a specific date (holiday) or outside operating hours, inform the guest and do NOT create a reservation.

### OPERATIONAL TOOLS:
1. get_customer_profile: Call at start of call.
2. get_opening_hours: Call to check schedule and holidays.
3. get_menu_info: Call for food/price questions.
4. create_reservation_request: Call ONLY if date/time is valid and within hours.
5. log_call_summary: Call at the very end.

Be professional and warm. Speak French, Turkish, or English.`;

async function updateVapi() {
  try {
    console.log('1. Creating get_opening_hours tool...');
    const toolRes = await request('POST', '/tool', {
      type: "function",
      function: {
        name: "get_opening_hours",
        description: "Fetch the restaurant's weekly opening hours and any special holiday closures.",
        parameters: { type: "object", properties: {} }
      },
      server: { url: `${PUBLIC_APP_URL}/api/vapi/get-opening-hours` }
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

    console.log('Vapi Update Complete. Assistant is now schedule-aware!');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapi();
