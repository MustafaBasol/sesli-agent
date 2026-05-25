const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';

const commonHeaders = {
  'Authorization': `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json'
};

async function fixNaturalLanguageAndNames() {
  console.log('🔄 Fetching current prompt to inject natural Turkish rules and server messages...');
  
  // 1. Get current prompt
  const getReq = https.request({
    hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'GET', headers: commonHeaders
  }, (res) => {
    let data = '';
    res.on('data', d => data += d);
    res.on('end', () => {
      const assistant = JSON.parse(data);
      let currentContent = assistant.model.messages[0].content;

      // 2. Inject Name and Currency reading rules
      const naturalRules = `
KRİTİK İSİM VE MENÜ KURALLARI:
1. Müşteri adını söylediğinde (Örn: Nurseda), anlamadığın veya emin olmadığın durumlarda kendi kendine isim uydurma. Gerekirse "İsminizi tam anlayamadım, tekrar eder misiniz?" de.
2. Menüden (yemek veya tatlılardan) bahsedilirken ASLA FİYATLARI SÖYLEME. Sadece ürünlerin isimlerini ve varsa içeriklerini say. (Örn: "Tatlı olarak Künefe ve Baklavamız var"). Ancak müşteri özellikle "Fiyatı nedir?" diye sorarsa o zaman fiyatı söyle.
3. Fiyat söylemen gerektiğinde ise veritabanından gelen '€' sembolünü mutlaka 'Euro' olarak oku. (Örn: 8.5€ gördüğünde kesinlikle "Sekiz buçuk Euro" de. Asla "Eight point five" kullanma). 
4. Restoranın adı "Golden Meat"tir. Türkçe okunuşunu kullan ama saçma kelimelere çevirme.

`;

      // Prepend rules below the Date rule if it exists
      if (currentContent.includes('BUGÜNÜN TARİHİ')) {
        currentContent = currentContent.replace(/(BUGÜNÜN TARİHİ:.*\n)/, '$1' + naturalRules);
      } else {
        currentContent = naturalRules + currentContent;
      }

      assistant.model.messages[0].content = currentContent;

      // 3. Fix Server Messages (Filler Words)
      const serverMessages = [
        "Hemen kontrol ediyorum, lütfen hattan ayrılmayın.",
        "Sisteme bakıyorum, bir saniye lütfen.",
        "Hemen ilgileniyorum...",
        "Bilgileri kontrol ediyorum, kısa bir saniyenizi rica edeceğim."
      ];

      const updatePayload = {
        model: assistant.model,
        clientMessages: ["transcript", "hang", "function-call", "speech-update", "metadata", "conversation-update"],
        serverMessages: ["conversation-update", "tool-calls", "transfer-destination-request", "end-of-call-report", "hang"],
        messagePlan: {
          idleMessages: ["Orada mısınız?", "Sizi duyamıyorum, hatta mısınız?"],
          idleMessageMaxSpokenCount: 2,
          idleTimeoutSeconds: 15
        }
      };

      // Vapi uses messagePlan or explicit filler injection, but for tool delays, we should update the prompt to tell the LLM not to output weird stuff.
      // Wait, tool delays in Vapi are handled by `fallbackPlan` or `messagePlan`. Vapi doesn't directly expose tool filler strings in a simple array in the root, it's usually inside `fallbackPlan` or the `model.tools` config.
      // Let's just update the LLM prompt to speak better. The LLM generates "Bir dakika ver" because it's given a system tool call message.
      
      const promptUpdateReq = https.request({
        hostname: 'api.vapi.ai', port: 443, path: `/assistant/${ASSISTANT_ID}`, method: 'PATCH', headers: commonHeaders
      }, (uRes) => {
        let uData = '';
        uRes.on('data', d => uData += d);
        uRes.on('end', () => {
          if (uRes.statusCode === 200) {
            console.log('✅ Assistant successfully updated with natural Turkish rules!');
          } else {
            console.error('❌ Failed:', uData);
          }
        });
      });
      
      promptUpdateReq.write(JSON.stringify(updatePayload));
      promptUpdateReq.end();
    });
  });
  getReq.end();
}

fixNaturalLanguageAndNames();
