/**
 * Script to deploy Golden Meat configuration to an existing Vapi assistant.
 */
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const PHONE_ID = 'ae8424f4-e697-48a7-8a29-33f314d2d7ca';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

if (!VAPI_TOKEN) {
  console.error('Error: VAPI_TOKEN is not set');
  process.exit(1);
}

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path,
      method,
      headers: commonHeaders
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`API Error ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const toolDefinitions = [
  {
    type: "function",
    function: {
      name: "create_reservation_request",
      description: "Create a new reservation request at Golden Meat after confirming details with the caller.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          phone_number: { type: "string" },
          party_size: { type: "integer" },
          reservation_date: { type: "string", description: "YYYY-MM-DD" },
          reservation_time: { type: "string", description: "HH:mm" },
          language: { type: "string", description: "fr, tr, or en" },
          special_request: { type: "string" },
          call_id: { type: "string" }
        },
        required: ["customer_name", "phone_number", "party_size", "reservation_date", "reservation_time", "language"]
      }
    },
    server: { url: `${PUBLIC_APP_URL}/api/vapi/create-reservation-request` }
  },
  {
    type: "function",
    function: {
      name: "modify_reservation_request",
      description: "Modify an existing reservation request at Golden Meat.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          phone_number: { type: "string" },
          new_reservation_date: { type: "string", description: "YYYY-MM-DD" },
          new_reservation_time: { type: "string", description: "HH:mm" },
          language: { type: "string" },
          call_id: { type: "string" }
        },
        required: ["customer_name", "phone_number", "new_reservation_date", "new_reservation_time", "language"]
      }
    },
    server: { url: `${PUBLIC_APP_URL}/api/vapi/modify-reservation-request` }
  },
  {
    type: "function",
    function: {
      name: "cancel_reservation_request",
      description: "Cancel an existing reservation request at Golden Meat.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string" },
          phone_number: { type: "string" },
          language: { type: "string" },
          reason: { type: "string" },
          call_id: { type: "string" }
        },
        required: ["customer_name", "phone_number", "language"]
      }
    },
    server: { url: `${PUBLIC_APP_URL}/api/vapi/cancel-reservation-request` }
  },
  {
    type: "function",
    function: {
      name: "handoff_to_staff",
      description: "Request human assistance for urgent or complex issues.",
      parameters: {
        type: "object",
        properties: {
          phone_number: { type: "string" },
          language: { type: "string" },
          reason: { type: "string" },
          conversation_summary: { type: "string" },
          urgency: { type: "string" },
          call_id: { type: "string" }
        },
        required: ["phone_number", "language", "reason", "conversation_summary"]
      }
    },
    server: { url: `${PUBLIC_APP_URL}/api/vapi/handoff-to-staff` }
  },
  {
    type: "function",
    function: {
      name: "log_call_summary",
      description: "Log call summary and outcome at the end of the call.",
      parameters: {
        type: "object",
        properties: {
          call_id: { type: "string" },
          customer_name: { type: "string" },
          language: { type: "string" },
          intent: { type: "string" },
          summary: { type: "string" },
          outcome: { type: "string" }
        },
        required: ["language", "intent", "summary", "outcome"]
      }
    },
    server: { url: `${PUBLIC_APP_URL}/api/vapi/log-call-summary` }
  }
];

async function deploy() {
  try {
    console.log('1. Fetching current assistant...');
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const existingToolIds = assistant.model.toolIds || [];
    
    console.log('2. Creating tools...');
    const newToolIds = [];
    for (const tool of toolDefinitions) {
      const createdTool = await request('POST', '/tool', tool);
      console.log(`- Created tool: ${tool.name} (ID: ${createdTool.id})`);
      newToolIds.push(createdTool.id);
    }

    console.log('3. Updating assistant...');
    const updatedAssistant = await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      name: "Golden Meat Receptionist",
      firstMessage: "Bonjour, Golden Meat, comment puis-je vous aider ?",
      model: {
        ...assistant.model,
        messages: [
          {
            role: "system",
            content: "You are the phone assistant for Golden Meat restaurant.\n\nYou can speak French, Turkish, and English.\nDetect the caller's language naturally and continue in that language.\nIf the caller switches language, follow the caller's language.\n\nYour job is to answer incoming calls politely, understand the caller's request, collect the necessary information, and use the available tools when needed.\n\nMain tasks:\n1. Create a reservation request.\n2. Modify an existing reservation request.\n3. Cancel a reservation request.\n4. Create a staff handoff request when the caller wants human assistance.\n5. Save a useful call summary.\n\nImportant rules:\n- Be warm, calm, professional, and concise.\n- Ask one question at a time.\n- Do not confirm a reservation as final unless the tool response clearly says it is confirmed.\n- If availability is not checked, say that the request has been received and the restaurant team will confirm it.\n- Always collect the caller's name, phone number, number of guests, date, and time before creating a reservation request.\n- Confirm the details with the caller before calling the reservation tool.\n- Convert relative dates like \"tonight\", \"tomorrow\", or \"next Friday\" into a clear date (YYYY-MM-DD) before calling tools.\n- Never mention internal tools, webhooks, APIs, Supabase, or n8n to the caller."
          }
        ],
        toolIds: [...existingToolIds, ...newToolIds]
      }
    });
    console.log(`Assistant updated (ID: ${updatedAssistant.id})`);

    console.log('4. Assigning phone number...');
    await request('PATCH', `/phone-number/${PHONE_ID}`, {
      assistantId: ASSISTANT_ID
    });
    console.log(`Phone number assigned (ID: ${PHONE_ID})`);

    console.log('\n--- Deployment Complete ---');
    console.log(`Assistant ID: ${ASSISTANT_ID}`);
    console.log(`Tool IDs: ${newToolIds.join(', ')}`);
    console.log(`Phone Number: +33972119020 attached.`);
    console.log(`Webhook Base: ${PUBLIC_APP_URL}/api/vapi/`);

  } catch (error) {
    console.error('Deployment Failed:', error.message);
  }
}

deploy();
