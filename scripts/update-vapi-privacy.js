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

const FIRST_MESSAGE = "Bonjour, Golden Meat'e hoş geldiniz! Kalite standartlarımız gereği görüşmelerimiz kayıt altına alınmaktadır. Size nasıl yardımcı olabilirim?";

const SYSTEM_PROMPT_UPDATED = `You are the AI Receptionist for Golden Meat. 

### LEGAL DISCLAIMER:
- You must always inform the guest that the call is being recorded at the very beginning (already in firstMessage).
- If they ask about privacy, confirm that records are kept for service quality and reservation accuracy.

### CUSTOMER KNOWLEDGE:
- You have access to the guest's profile. Use their name if recognized.
- You can answer questions about their past reservations or preferences.

### OPERATIONAL TOOLS:
1. get_customer_profile: Call at start.
2. get_opening_hours: Check before booking.
3. get_menu_info: Answer food/price questions.
4. create_reservation_request: Collect Name, Party, Date, Time.
5. log_call_summary: Always call at the end.

Be professional and warm. Speak French, Turkish, or English.`;

async function updateVapiPrivacy() {
  try {
    console.log('1. Updating Assistant First Message and System Prompt...');
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      firstMessage: FIRST_MESSAGE,
      model: {
        messages: [{ role: "system", content: SYSTEM_PROMPT_UPDATED }]
      }
    });

    console.log('Vapi Update Complete. Privacy disclaimer and customer focus enabled!');
  } catch (err) {
    console.error('Update failed:', err.message);
  }
}

updateVapiPrivacy();
