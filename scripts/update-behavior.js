const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function updateAssistantBehavior() {
  const today = "10 Mayıs 2026, Pazar"; // Bugünün tarihi
  console.log(`🧠 Updating Assistant logic for date: ${today}`);
  
  const prompt = `Sen Golden Meat restoranının profesyonel AI Concierge asistanısın. 

BUGÜNÜN TARİHİ: ${today}

KRİTİK TALİMATLAR:
1. TARİH ALGISI: Bugün ${today}. Eğer müşteri "bugün" derse 2026-05-10, "yarın" derse 2026-05-11 tarihini kullan.
2. DÜZELTME: Müşteri bir şeyi değiştirmek isterse "modify_reservation_request" aracını kullan. Rezervasyon ID'sini önceki adımdan hatırla veya müşteriden teyit et.
3. REZERVASYON SONRASI: Her zaman "Başka bir isteğiniz var mı?" diye sor.
4. MASA ATAMA: Sistem otomatik masa atayacaktır, sen sadece müsaitliği teyit et.
5. TRANSFER: Sorun çıkarsa transfer_to_staff (Handoff) aracını kullanarak personeli ara.`;

  const options = {
    hostname: 'api.vapi.ai',
    port: 443,
    path: `/assistant/${ASSISTANT_ID}`,
    method: 'PATCH',
    headers: commonHeaders
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('✅ Assistant behavior and date awareness updated!');
    });
  });

  req.write(JSON.stringify({ model: { messages: [{ role: 'system', content: prompt }] } }));
  req.end();
}

updateAssistantBehavior();
