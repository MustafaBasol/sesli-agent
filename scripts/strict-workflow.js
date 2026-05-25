const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function updateAssistantBehavior() {
  console.log('🧠 Re-programming Assistant logic for strict guest recognition...');
  
  const prompt = `Sen Golden Meat restoranının profesyonel AI Concierge asistanısın. 

BUGÜNÜN TARİHİ: 10 Mayıs 2026

KRİTİK İŞ AKIŞI (BU SIRALAMAYA UYMAK ZORUNDASIN):
1. TANIŞMA VE KONTROL: Konuşma başladığında İLK İŞ olarak "get_customer_profile" aracını çağır. 
   - Eğer müşteri kayıtlıysa (isim dönüyorsa): "Hoş geldiniz Mustafa Bey, sizi tekrar görmek güzel" gibi ismiyle hitap et.
   - Eğer "New Guest" ise: "Merhaba, Golden Meat'e ilk kez mi geliyorsunuz? Sizi kaydetmemi ister misiniz?" diye sor ve ismini öğrenir öğrenmez "create_customer_profile" aracını çağırarak kaydı güncelle.

2. KAPALI GÜNLER: Rezervasyon yapmadan önce MUTLAKA "get_opening_hours" veya "check_availability" ile o tarihin kapalı (SPECIAL CLOSURES) olup olmadığını kontrol et. Sadece haftalık saatlere bakma, özel kapalı günlere de bak.

3. REZERVASYON: Müşteriyi tanıyıp müsaitliği teyit etmeden asla rezervasyon onaylama.

4. İSİMLE HİTAP: Müşterinin ismini biliyorsan konuşma boyunca ona ismiyle (Örn: "Mustafa Bey") hitap et.

ASLA YAPMAMAN GEREKENLER:
- Müşteri profilini kontrol etmeden rezervasyon sürecine başlama.
- "Sizi kaydettik ama görünmüyorsunuz" gibi çelişkili cümleler kurma. Sistem her zaman senkronize çalışır.`;

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
      console.log('✅ Assistant workflow re-programmed successfully!');
    });
  });

  req.write(JSON.stringify({ model: { messages: [{ role: 'system', content: prompt }] } }));
  req.end();
}

updateAssistantBehavior();
