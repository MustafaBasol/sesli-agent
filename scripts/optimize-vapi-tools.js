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

const TOOLS_CONFIG = [
  {
    name: "get_current_date",
    description: "MANDATORY at the start of every call and before interpreting relative dates like today, tonight, tomorrow, bugun, bu aksam, yarin, ce soir, or demain. Returns the current Paris date in ISO format for tools and natural Turkish spoken text for the caller.",
    parameters: {
      type: "object",
      properties: {}
    },
    url: "/api/vapi/get-current-date"
  },
  {
    name: "get_customer_profile",
    description: "Fetches guest profile by phone number to identify returning customers and their preferences.",
    parameters: {
      type: "object",
      properties: { phone_number: { type: "string", description: "Optional caller phone number. If omitted, the server will use Vapi call metadata." } }
    },
    url: "/api/vapi/get-customer-profile"
  },
  {
    name: "get_menu_info",
    description: "Provides a full list of menu items, categories, and prices for general browsing.",
    parameters: { type: "object", properties: {} },
    url: "/api/vapi/get-menu-info"
  },
  {
    name: "get_item_details",
    description: "Gets detailed information (ingredients, allergens, full description) for a specific dish.",
    parameters: {
      type: "object",
      properties: { item_name: { type: "string", description: "The specific name of the dish." } },
      required: ["item_name"]
    },
    url: "/api/vapi/get-item-details"
  },
  {
    name: "check_availability",
    description: "MANDATORY: Checks if a table is available before booking. Checks hours, holidays, and table capacity.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Reservation date (YYYY-MM-DD)" },
        time: { type: "string", description: "Reservation time (HH:MM)" },
        party_size: { type: "number", description: "Number of guests" }
      },
      required: ["date", "time", "party_size"]
    },
    url: "/api/vapi/check-availability"
  },
  {
    name: "create_reservation_request",
    description: "Creates a new reservation. ONLY call after check_availability returns available:true.",
    parameters: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        phone_number: { type: "string" },
        reservation_date: { type: "string" },
        reservation_time: { type: "string" },
        party_size: { type: "number" },
        assigned_table_id: { type: "string", description: "The table ID provided by check_availability." }
      },
      required: ["customer_name", "phone_number", "reservation_date", "reservation_time", "party_size"]
    },
    url: "/api/vapi/create-reservation-request"
  },
  {
    name: "log_call_summary",
    description: "Saves a summary of the call and the final outcome to the CRM.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string" },
        intent: { type: "string" },
        outcome: { type: "string" }
      },
      required: ["summary", "intent", "outcome"]
    },
    url: "/api/vapi/log-call-summary"
  }
];

async function updateAllToolsFinetuned() {
  try {
    console.log('🚀 Starting Deep Optimization of Tools...');
    
    const allExistingTools = await request('GET', '/tool');

    for (const config of TOOLS_CONFIG) {
      const existing = allExistingTools.find(t => (t.function?.name === config.name || t.name === config.name));
      
      const toolPayload = {
        type: "function",
        function: {
          name: config.name,
          description: config.description,
          parameters: config.parameters
        },
        server: { url: `${PUBLIC_APP_URL}${config.url}` }
      };

      if (existing) {
        console.log(`Updating ${config.name}...`);
        const { type, ...patchPayload } = toolPayload;
        await request('PATCH', `/tool/${existing.id}`, patchPayload);
      } else {
        console.log(`Creating ${config.name}...`);
        await request('POST', '/tool', toolPayload);
      }
    }

    console.log('✅ ALL TOOLS ARE OPTIMIZED AND SYNCED!');
  } catch (err) {
    console.error('Optimization failed:', err.message);
  }
}

updateAllToolsFinetuned();
