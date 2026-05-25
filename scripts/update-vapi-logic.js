const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

const toolMapping = {
  create_reservation_request: 'c9dc9952-6940-4ace-a255-fcd453e521da',
  modify_reservation_request: 'a98a7e21-1b41-4089-b6e3-87fdf83440b7',
  cancel_reservation_request: 'a6e847f3-f201-48a5-949f-735b023918a4',
  handoff_to_staff: '35e919da-1198-4c86-9627-018f5754b793',
  log_call_summary: '46b1eacc-77d5-4cf7-8f92-4d95780bef03'
};

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

### TOOL USAGE LOGIC:
1. create_reservation_request: Call this ONLY after you have: Name, Party Size, Date (YYYY-MM-DD), and Time (HH:mm). Confirm details with the guest first.
2. modify_reservation_request: Call when a guest wants to change an existing booking. Collect Name and new Date/Time.
3. cancel_reservation_request: Call when a guest wants to cancel. Collect Name and Reason.
4. handoff_to_staff: Call if the guest is angry, asks for a manager, or has a complex request you cannot handle.
5. log_call_summary: MANDATORY. Call this at the very end of every call before hanging up.

Speak French, Turkish, or English based on the caller. Be professional and warm.`;

async function updateVapi() {
  try {
    console.log('Updating Assistant Prompt...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "system", content: SYSTEM_PROMPT }]
      }
    });

    console.log('Updating Tool Descriptions for better LLM recognition...');
    for (const [name, id] of Object.entries(toolMapping)) {
      await request('PATCH', `/tool/${id}`, {
        name: name, // Fixing the "Unnamed" issue
        function: {
          name: name,
          description: `Use this tool to ${name.replace(/_/g, ' ')}. Essential for Golden Meat workflow.`
        }
      });
      console.log(`- Updated tool: ${name}`);
    }

    console.log('Vapi Update Complete.');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapi();
