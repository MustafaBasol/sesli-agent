const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function ultimateFix() {
  console.log('🚀 Applying Ultimate Turkish Language & Date Fix...');
  
  const getReq = https.request({
    hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'GET', headers: commonHeaders
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const assistant = JSON.parse(data);
      let content = assistant.model.messages[0].content;

      // 1. Önce tüm eski KRİTİK... ve BUGÜNÜN TARİHİ... kısımlarını temizleyelim
      content = content.replace(/^(?:KRİTİK|BUGÜNÜN)[\s\S]*?(?=#|Sen Golden|Sen profesyonel)/i, '');

      // 2. Yeni, tertemiz ve sert kuralları ekleyelim
      const freshRules = `BUGÜNÜN TARİHİ: 10 Mayıs 2026 (Pazar)

# TÜRKÇE KONUŞMA VE OKUMA KURALLARI (HAYATİ ÖNEMDE)
1. ASLA RAKAM KULLANMA: Konuşurken (fiyatlar, tarihler, saatler, ondalıklı sayılar dahil) hiçbir şeyi rakamla (0-9) yazma. DAİMA harflerle yaz. 
   - Örnek: "9.9" yerine "dokuz nokta dokuz" yaz.
   - Örnek: "2026" yerine "iki bin yirmi altı" yaz.
   - Örnek: "19:00" yerine "saat on dokuz" yaz.
   Eğer rakam kullanırsan ses motoru bunları İngilizce okur, bu yüzden her şeyi kelimelerle yazmalısın.

2. TARİH BİLGİSİ: Bugün On Mayıs İki Bin Yirmi Altı'dır. Asla 2023 veya 2024 deme.

3. MENÜ VE FİYAT: Müşteri sormadıkça fiyat söyleme. Söylediğinde ise '€' yerine "Euro" kelimesini kullan.

4. ÖZEL İSİMLER: Müşteri adını (Örn: Nurseda) net duyana kadar uydurma, gerekirse tekrar sor.

---
`;

      assistant.model.messages[0].content = freshRules + content.trim();

      const updateReq = https.request({
        hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'PATCH', headers: commonHeaders
      }, (uRes) => {
        let uData = '';
        uRes.on('data', d => uData += d);
        uRes.on('end', () => {
          if (uRes.statusCode === 200) {
            console.log('✅ Assistant successfully updated with Ultimate Turkish Rules!');
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

ultimateFix();
