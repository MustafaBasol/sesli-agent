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

const SYSTEM_PROMPT_UNIFIED = `You are the AI Receptionist for Golden Meat. 

### RESERVATION LOGIC (MANDATORY):
1. Before creating a reservation, you MUST call "check_availability" with the Date, Time, and Party Size.
2. If "check_availability" returns "available: false":
   - If the reason is "Closed", "Outside Hours", or "Holiday", inform the guest and do NOT book.
   - If the reason is "Fully Booked", offer different times or dates.
   - If the reason is "Party Too Large", explain the restaurant's policy for large groups.
3. If "available: true":
   - Proceed with "create_reservation_request".
   - If "needs_approval: true", tell the guest that for this group size, the team will confirm it manually via call or SMS.

### OPERATIONAL TOOLS:
1. get_customer_profile: Call at start.
2. check_availability: MANDATORY check before any booking.
3. get_menu_info: For food questions.
4. create_reservation_request: ONLY after a successful check_availability.
5. log_call_summary: Call at the end.

Be professional and warm. Speak French, Turkish, or English.`;

async function updateVapiUnified() {
  try {
    console.log('1. Creating check_availability tool...');
    const toolRes = await request('POST', '/tool', {
      type: "function",
      function: {
        name: "check_availability",
        description: "Check if a reservation is possible based on restaurant hours, holiday closures, and table availability.",
        parameters: {
          type: "object",
          properties: {
            date: { type: "string", description: "Format: YYYY-MM-DD" },
            time: { type: "string", description: "Format: HH:MM" },
            party_size: { type: "number" }
          },
          required: ["date", "time", "party_size"]
        }
      },
      server: { url: `${PUBLIC_APP_URL}/api/vapi/check-availability` }
    });
    const newToolId = toolRes.id;

    console.log('2. Fetching assistant...');
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    
    console.log('3. Updating Assistant Logic...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        ...assistant.model,
        messages: [{ role: "system", content: SYSTEM_PROMPT_UNIFIED }],
        toolIds: [...new Set([...(assistant.model.toolIds || []), newToolId])]
      }
    });

    console.log('Vapi Update Complete. Unified Logic is now LIVE!');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapiUnified();
