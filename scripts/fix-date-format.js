const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function fixDateFormat() {
  console.log('🔄 Fetching current prompt to inject strict ISO Date Format rule...');
  
  const getReq = https.request({
    hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'GET', headers: commonHeaders
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const assistant = JSON.parse(data);
      let currentContent = assistant.model.messages[0].content;

      const dateRule = `
KRİTİK TARİH FORMATI KURALI:
Araçları (check_availability, create_reservation vb.) çağırırken "date" veya "reservation_date" parametrelerine DAİMA "YYYY-MM-DD" (Yıl-Ay-Gün) formatında tarih gönder. 
Ay her zaman ortada, gün her zaman sonda olmalıdır.
Örneğin: 10 Mayıs 2026 için "2026-05-10" gönderilmelidir. "2026-10-05" yazarsan bu 5 Ekim anlamına gelir ve sistem çöker. Asla ay ve günü karıştırma.

`;

      // Prepend rules below the Date rule if it exists
      if (currentContent.includes('BUGÜNÜN TARİHİ')) {
        currentContent = currentContent.replace(/(BUGÜNÜN TARİHİ:.*\n)/, '$1' + dateRule);
      } else {
        currentContent = dateRule + currentContent;
      }

      assistant.model.messages[0].content = currentContent;

      const promptUpdateReq = https.request({
        hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'PATCH', headers: commonHeaders
      }, (uRes) => {
        let uData = '';
        uRes.on('data', d => uData += d);
        uRes.on('end', () => {
          if (uRes.statusCode === 200) {
            console.log('✅ Assistant successfully updated with strict Date Format rules!');
          } else {
            console.error('❌ Failed:', uData);
          }
        });
      });
      
      promptUpdateReq.write(JSON.stringify({ model: assistant.model }));
      promptUpdateReq.end();
    });
  });
  getReq.end();
}

fixDateFormat();
