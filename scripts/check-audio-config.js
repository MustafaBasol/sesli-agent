const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const options = {
  hostname: 'api.vapi.ai',
  port: 443,
  path: `/assistant/${ASSISTANT_ID}`,
  method: 'GET',
  headers: { 'Authorization': `Bearer ${VAPI_TOKEN}` }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (d) => data += d);
  res.on('end', () => {
    const assistant = JSON.parse(data);
    console.log("Current Audio Configuration:");
    console.log("Transcriber:", JSON.stringify(assistant.transcriber, null, 2));
    console.log("Voice:", JSON.stringify(assistant.voice, null, 2));
    console.log("Interruption configuration:", assistant.clientMessages?.includes("interruption") ? "Enabled" : "Depends on transcriber");
    console.log("VAD/Endpointing info may be embedded in transcriber settings.");
  });
});

req.on('error', (e) => console.error(e));
req.end();
