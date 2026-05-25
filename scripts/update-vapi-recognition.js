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

const SYSTEM_PROMPT = `You are the AI Receptionist for Golden Meat, a high-end restaurant. 

### CRITICAL: CUSTOMER RECOGNITION
- At the VERY BEGINNING of the call, call "get_customer_profile" using the caller's phone number.
- If the customer is known (is_known: true), greet them by their name (full_name) and acknowledge their loyalty.
- Check "notes" for preferences (e.g., if they like window seats, mention it).

### TOOL USAGE LOGIC:
1. get_customer_profile: Call immediately at start of call to recognize the guest.
2. create_reservation_request: Call ONLY after you have: Name, Party Size, Date, and Time.
3. modify_reservation_request: Call to change an existing booking.
4. cancel_reservation_request: Call to cancel.
5. handoff_to_staff: Call if guest is angry or asks for a manager.
6. log_call_summary: Call at the end of every call.

Be professional, warm, and speak French, Turkish, or English.`;

async function updateVapi() {
  try {
    console.log('1. Creating get_customer_profile tool...');
    const toolRes = await request('POST', '/tool', {
      type: "function",
      function: {
        name: "get_customer_profile",
        description: "Identify the customer by phone number and get their profile/preferences.",
        parameters: {
          type: "object",
          properties: {
            phone_number: { type: "string", description: "The caller's phone number." }
          },
          required: ["phone_number"]
        }
      },
      server: { url: `${PUBLIC_APP_URL}/api/vapi/get-customer-profile` }
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

    console.log('Vapi Update Complete. Assistant now recognizes customers.');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapi();
