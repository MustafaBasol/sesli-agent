const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function verifyAll() {
  console.log('🔍 Veritabanı Kontrolü Başlıyor...\n');
  
  const tables = ['customers', 'tables', 'reservation_requests', 'calls', 'tool_logs'];
  
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ ${table}: HATA! (${error.message})`);
    } else {
      console.log(`✅ ${table}: ${count} kayıt bulundu.`);
    }
  }
}

verifyAll();
