const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function fixDateAndPronunciation() {
  console.log('🔄 Fetching current prompt to inject strict year and date rules...');
  
  const getReq = https.request({
    hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'GET', headers: commonHeaders
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const assistant = JSON.parse(data);
      let currentContent = assistant.model.messages[0].content;

      const topRules = `
BUGÜNÜN TARİHİ: 10 Mayıs 2026 (Pazar)

KRİTİK YIL VE TARİH OKUMA KURALI:
1. Kullanıcıya tarih veya yıl söylerken (örneğin 2026) YILLARI ASLA RAKAMLA YAZMA. Her zaman harflerle, Türkçe okunuşuyla yaz! (Örn: "2026" DEĞİL, "iki bin yirmi altı" olarak yaz). Sayıları rakamla yazarsan ses motoru onları İngilizce okur, bu yüzden kesinlikle kelimelerle yaz.
2. Bugünün yılı her zaman İKİ BİN YİRMİ ALTI'dır. Geçmiş yıllardan bahsetme.

KRİTİK TARİH FORMATI KURALI:
Araçları (check_availability vb.) çağırırken sisteme "YYYY-MM-DD" formatında RAKAMLA tarih gönder (Örn: 2026-05-10). Ancak müşteriye cevap verirken her zaman yazıyla söyle (Örn: On Mayıs iki bin yirmi altı). Ayı ve günü asla birbirine karıştırma.

KRİTİK İSİM VE MENÜ KURALLARI:
1. Müşteri adını söylediğinde (Örn: Nurseda), anlamadığın durumlarda kendi kendine isim uydurma. "İsminizi tam anlayamadım, tekrar eder misiniz?" de.
2. Menüden bahsederken FİYATLARI SÖYLEME. Sadece ürünlerin isimlerini say. Ancak müşteri "Fiyatı nedir?" diye sorarsa fiyatı söyle.
3. Fiyat söylemen gerekirse '€' sembolünü 'Euro' olarak oku. (Örn: "Sekiz buçuk Euro").
4. Restoranın adı "Golden Meat"tir. Türkçe okunuşunu kullan.

`;

      // Clean up previous injected blocks to avoid duplication
      currentContent = currentContent.replace(/KRİTİK TARİH FORMATI KURALI:[\s\S]*?(?=Sen Golden)/, '');
      currentContent = currentContent.replace(/KRİTİK İSİM VE MENÜ KURALLARI:[\s\S]*?(?=Sen Golden)/, '');
      currentContent = currentContent.replace(/BUGÜNÜN TARİHİ:[\s\S]*?(?=Sen Golden)/, '');
      currentContent = currentContent.replace(/KRİTİK TELEFON NUMARASI KURALI:[\s\S]*?(?=Sen Golden)/, '');
      
      // Since regex cleanup might be tricky, let's just make sure we insert right before "Sen Golden"
      if (currentContent.includes('Sen Golden')) {
          currentContent = currentContent.substring(currentContent.indexOf('Sen Golden'));
      }

      currentContent = topRules + currentContent;
      assistant.model.messages[0].content = currentContent;

      const promptUpdateReq = https.request({
        hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'PATCH', headers: commonHeaders
      }, (uRes) => {
        let uData = '';
        uRes.on('data', d => uData += d);
        uRes.on('end', () => {
          if (uRes.statusCode === 200) {
            console.log('✅ Assistant successfully updated with strict Date and Year Pronunciation rules!');
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

fixDateAndPronunciation();
