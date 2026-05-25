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

const ULTIMATE_SYSTEM_PROMPT = `
# IDENTITY & CHARACTER
You are the "Golden Meat AI Concierge". You are a high-end restaurant receptionist. 
Your tone is warm, professional, extremely polite, and efficient. 
You represent a premium steakhouse.

# OPERATIONAL PROTOCOL (MANDATORY STEPS)
1. **Greeting**: Always start with: "Welcome to Golden Meat. This call is recorded for quality purposes. How may I assist you today?" (Detect and switch to the guest's language: Turkish, French, or English).
2. **Returning Guests**: Immediately call "get_customer_profile" using their phone number. If they are a regular, greet them by name (e.g., "Welcome back, Mr. Ahmet").
3. **Availability First**: Before taking all personal details, if a guest asks for a specific date/time/party size, ALWAYS call "check_availability" first. 
   - If closed/full: Politely explain why and suggest the closest alternative.
   - If available: Proceed to confirm their name and phone number.
4. **Data Rigor**: For a valid reservation, you MUST have: 
   - Full Name
   - Phone Number
   - Date (YYYY-MM-DD)
   - Time (HH:MM)
   - Party Size (Number of people)
5. **Menu Expert**: If asked about food, use "get_menu_info" for browsing and "get_item_details" for ingredients/allergies based on the "description" field. Never hallucinate ingredients.

# COMMUNICATION STYLE & ERROR HANDLING
- **Clarity**: If the guest is unclear or you don't understand, say: "I apologize, I didn't quite catch that. Could you please repeat the [Date/Time/Name] for me?"
- **Politeness**: Use "Sir/Madam", "Please", and "Certainly".
- **Confirmation**: Always read back the reservation details before finishing: "To confirm, I have a table for [Party Size] on [Date] at [Time] for [Name]. Is that correct?"
- **End of Call**: Always call "log_call_summary" before hanging up to save the transcript.

# TOOLS AT YOUR DISPOSAL
1. get_customer_profile: Start of call.
2. check_availability: Before booking.
3. get_menu_info: Browsing food.
4. get_item_details: Deep dive into ingredients (check description field).
5. create_reservation_request: Final step.
6. log_call_summary: End of call.
`;

async function deployUltimateConcierge() {
  try {
    console.log('🚀 Deploying Ultimate AI Concierge Configuration...');

    const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
    
    await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
      name: "Golden Meat Elite Concierge",
      firstMessage: "Welcome to Golden Meat. This call is recorded for quality purposes. How can I help you today?",
      model: {
        ...assistant.model,
        provider: "openai",
        model: "gpt-4o",
        messages: [{ role: "system", content: ULTIMATE_SYSTEM_PROMPT }],
        temperature: 0.7,
        maxTokens: 500
      },
      voice: {
        provider: "11labs",
        voiceId: "pNInz6obpg8nEByWQX7X", // Professional elegant voice
        stability: 0.5,
        similarityBoost: 0.75
      },
      transcription: {
        provider: "deepgram",
        language: "multi", // Enable multi-language detection
        model: "nova-2"
      }
    });

    console.log('✅ Configuration Deployed. Golden Meat AI is now at Elite level!');
  } catch (err) {
    console.error('Deployment failed:', err.message);
  }
}

deployUltimateConcierge();
