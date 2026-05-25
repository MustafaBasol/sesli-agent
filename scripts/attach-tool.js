const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const TOOL_ID = 'cbf9de4a-f6fa-45fc-a850-afab9136d31a'; // Az önce oluşturulan ID

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function forceUpdateAssistant() {
  console.log('🔗 Attaching tool to assistant and updating prompt...');
  
  // Get current assistant
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
      
      // Get tool IDs regardless of structure
      let currentTools = assistant.model?.tools || assistant.tools || [];
      let toolIds = currentTools.map(t => typeof t === 'string' ? t : (t.id || t.toolId));
      
      if (!toolIds.includes(TOOL_ID)) toolIds.push(TOOL_ID);

      const updatePayload = {
        model: {
          tools: toolIds.map(id => ({ type: 'function', id: id })),
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
        let uData = '';
        uRes.on('data', (c) => uData += c);
        uRes.on('end', () => {
          console.log('✅ Assistant successfully updated with permanent registration logic!');
        });
      });
      updateReq.write(JSON.stringify(updatePayload));
      updateReq.end();
    });
  });
  getReq.end();
}

forceUpdateAssistant();
