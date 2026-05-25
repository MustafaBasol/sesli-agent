const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const WEBHOOK_URL = 'https://nonvibrating-ying-inhomogeneously.ngrok-free.dev/api/vapi/webhook';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function syncNewTool() {
  console.log('🚀 Syncing new "create_customer_profile" tool to Vapi...');
  
  const toolPayload = {
    type: 'function',
    function: {
      name: 'create_customer_profile',
      description: 'Creates or updates a permanent customer profile in the restaurant database.',
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string', description: 'The full name of the customer.' },
          phone_number: { type: 'string', description: 'The phone number of the customer.' }
        },
        required: ['full_name', 'phone_number']
      }
    },
    server: {
      url: WEBHOOK_URL,
      timeoutSeconds: 20,
      headers: { 'ngrok-skip-browser-warning': 'true' }
    }
  };

  const createToolOptions = {
    hostname: 'api.vapi.ai',
    port: 443,
    path: '/tool',
    method: 'POST',
    headers: commonHeaders
  };

  const req = https.request(createToolOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      const tool = JSON.parse(data);
      console.log(`✅ Tool created with ID: ${tool.id}`);
      
      // Now attach to assistant
      attachToAssistant(tool.id);
    });
  });

  req.write(JSON.stringify(toolPayload));
  req.end();
}

async function attachToAssistant(toolId) {
  console.log(`🔗 Attaching tool ${toolId} to assistant...`);
  
  // First get current assistant to preserve existing tools
  const getOptions = {
    hostname: 'api.vapi.ai',
    port: 443,
    path: `/assistant/${ASSISTANT_ID}`,
    method: 'GET',
    headers: commonHeaders
  };

  const getReq = https.request(getOptions, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      const assistant = JSON.parse(data);
      const toolIds = assistant.model.tools.map(t => t.id || t);
      if (!toolIds.includes(toolId)) toolIds.push(toolId);

      const updatePayload = {
        model: {
          tools: toolIds,
          messages: [{
            role: 'system',
            content: `Sen Golden Meat restoranının profesyonel AI Concierge asistanısın. 

BUGÜNÜN TARİHİ: 10 Mayıs 2026

KRİTİK TALİMATLAR:
1. MÜŞTERİ KAYDI: Eğer bir müşteri "beni kaydet" derse veya ilk kez arıyorsa "create_customer_profile" aracını kullanarak onu sisteme kaydet. Sadece rezervasyon yapmak yetmez, profili de oluşturmalısın.
2. REZERVASYON: Rezervasyon yaparken "create_reservation_request" aracını kullan. 
3. DÜZELTME: Müşteri bir şeyi değiştirmek isterse "modify_reservation_request" aracını kullan.
4. KONTROL: Müşteriyi tanımıyorsan "get_customer_profile" ile kontrol et, yoksa "create_customer_profile" ile hemen kaydet.`
          }]
        }
      };

      const updateOptions = {
        hostname: 'api.vapi.ai',
        port: 443,
        path: `/assistant/${ASSISTANT_ID}`,
        method: 'PATCH',
        headers: commonHeaders
      };

      const updateReq = https.request(updateOptions, (uRes) => {
        console.log('✅ Assistant updated with new tool and registration logic!');
      });
      updateReq.write(JSON.stringify(updatePayload));
      updateReq.end();
    });
  });
  getReq.end();
}

syncNewTool();
