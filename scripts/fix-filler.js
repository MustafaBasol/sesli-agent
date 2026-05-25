const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function fixFillerWords() {
  console.log('🔄 Fetching current tools to overwrite default filler words...');
  
  // Vapi uses "toolIds". We need to fetch all tools, find ours, and patch them with 'messages'.
  const getReq = https.request({
    hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'GET', headers: commonHeaders
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', async () => {
      const assistant = JSON.parse(data);
      const toolIds = assistant.model.toolIds || [];
      
      console.log('Tool IDs attached:', toolIds);

      // Loop through all tools and patch their "messages" array
      for (const tId of toolIds) {
        await new Promise((resolve) => {
           const patchReq = https.request({
             hostname: 'api.vapi.ai', port: 443, path: `/tool/${tId}`, method: 'PATCH', headers: commonHeaders
           }, (pr) => {
             let pData = '';
             pr.on('data', c => pData += c);
             pr.on('end', () => {
                if(pr.statusCode === 200) console.log(`✅ Tool ${tId} filler word updated.`);
                else console.log(`❌ Tool ${tId} failed:`, pData);
                resolve();
             });
           });
           
           // Inject natural Turkish filler words for when the tool starts loading
           patchReq.write(JSON.stringify({
             messages: [
               {
                 type: "request-start",
                 content: "Lütfen hattan ayrılmayın, hemen kontrol ediyorum...",
                 conditions: []
               }
             ]
           }));
           patchReq.end();
        });
      }
      
      console.log('🎉 All default robot fillers replaced with natural Turkish!');
    });
  });
  getReq.end();
}

fixFillerWords();
