const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function fixAssistantPrompt() {
  console.log('🔄 Fetching current prompt to inject date and phone rules...');
  
  // 1. Get current prompt
  const getReq = https.request({
    hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'GET', headers: commonHeaders
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const assistant = JSON.parse(data);
      let currentContent = assistant.model.messages[0].content;

      // 2. Inject Date and Phone rules at the very top
      const todayRules = `BUGÜNÜN TARİHİ: 10 Mayıs 2026

KRİTİK TELEFON NUMARASI KURALI:
Kullanıcı telefon numarasını söylerken (örneğin "sıfır yedi elli üç...") duyduğun RAKAMLARI EKSİKSİZ VE YORUMLAMADAN aralarında boşluk bırakarak yaz. ASLA numarayı kendi kendine 05xx gibi standart bir formata uydurmaya çalışma. Duyduğun her sayıyı (0, 7, 5, 3, 8, 4...) birebir araca geçir.

KRİTİK İŞ AKIŞI:
Konuşma başladığında veya müşteri numarasını verdiğinde ilk iş olarak get_customer_profile aracını çağır. Eğer müşteri kayıtlı değilse, konuşma akışını bozmadan kayıt edilmesi sağlanacaktır.

`;

      // Remove any old date mentions if exist
      currentContent = currentContent.replace(/BUGÜNÜN TARİHİ:.*\n/g, '');
      currentContent = currentContent.replace(/KRİTİK TELEFON.*\n(?:.*\n)*/g, '');

      const newContent = todayRules + currentContent;
      assistant.model.messages[0].content = newContent;

      // 3. Update prompt with full model object
      const updateReq = https.request({
        hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'PATCH', headers: commonHeaders
      }, (uRes) => {
        let uData = '';
        uRes.on('data', d => uData += d);
        uRes.on('end', () => {
          if (uRes.statusCode === 200) {
            console.log('✅ Assistant prompt successfully fixed with Date and Phone rules!');
          } else {
            console.error('❌ Failed:', uData);
          }
        });
      });
      
      updateReq.write(JSON.stringify({ model: assistant.model }));
      updateReq.end();
    });
  });
  getReq.end();
}

fixAssistantPrompt();
