const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const STAFF_PHONE = process.env.RESTAURANT_PHONE_NUMBER || '+905554443322'; // Varsayılan numara

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

async function addTransferTool() {
  try {
    console.log('☎️ Adding Transfer Tool to Vapi...');

    // 1. Create the Transfer Tool
    const toolRes = await request('POST', '/tool', {
      type: "transferCall",
      destinations: [
        {
          type: "number",
          number: STAFF_PHONE,
          message: "Please wait while I connect you to our staff at Golden Meat."
        }
      ],
      function: {
        name: "transfer_to_staff",
        description: "Transfers the call to a live human staff member when the guest asks for human support or when the AI cannot answer complex questions."
      }
    });

    const toolId = toolRes.id;

    // 2. Attach to Assistant and update prompt
    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    const currentPrompt = assistant.model.messages[0].content;
    
    const updatedPrompt = currentPrompt + `
# HANDOFF PROTOCOL
- If the guest says "I want to talk to a person", "Connect me to the kitchen", or has a request you cannot handle, use "transfer_to_staff".
- Before transferring, say: "Certainly, I am connecting you to our team right now. Please stay on the line."
`;

    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      model: {
        ...assistant.model,
        messages: [{ role: "system", content: updatedPrompt }],
        toolIds: [...new Set([...(assistant.model.toolIds || []), toolId])]
      }
    });

    console.log('✅ Transfer functionality is now active!');
  } catch (err) {
    console.error('Failed to add transfer tool:', err.message);
  }
}

addTransferTool();
