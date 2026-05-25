const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function optimizeAudio() {
  console.log('🎧 Optimizing Assistant Audio/Transcriber Settings...');

  const updatePayload = {
    transcriber: {
      provider: "deepgram",
      model: "nova-3",
      language: "tr", // Sabit dil ile daha yüksek isabet ve daha az işlem gecikmesi
      endpointing: 500, // Vapi API allows max 500ms
      smartFormat: true
    }
  };

  const updateOptions = {
    hostname: 'api.vapi.ai',
    port: 443,
    path: `/assistant/${ASSISTANT_ID}`,
    method: 'PATCH',
    headers: commonHeaders
  };

  const updateReq = https.request(updateOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('✅ Audio configuration successfully optimized!');
        console.log('New Transcriber Settings applied: Deepgram (nova-3), Lang: TR, Endpointing: 600ms');
      } else {
        console.error('❌ Failed to update audio config:', data);
      }
    });
  });

  updateReq.write(JSON.stringify(updatePayload));
  updateReq.end();
}

optimizeAudio();
