const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // En yetkili anahtarı kullanıyoruz
);

async function forceSeed() {
  console.log('🚀 Zorlamalı Veri Yükleme Başlıyor...');

  const tables = [
    { table_number: 'W-01', capacity: 2, location: 'Window Side' },
    { table_number: 'W-02', capacity: 2, location: 'Window Side' },
    { table_number: 'T-01', capacity: 4, location: 'Terrace' },
    { table_number: 'M-01', capacity: 4, location: 'Main Hall' },
    { table_number: 'V-01', capacity: 8, location: 'VIP Room' }
  ];

  const customers = [
    { phone_number: '+905550001122', full_name: 'Ahmet Yılmaz', total_reservations: 10, notes: 'VIP' },
    { phone_number: '+33612345678', full_name: 'Jean Dupont', total_reservations: 5, notes: 'Regular' }
  ];

  const { error: tErr } = await supabase.from('tables').upsert(tables, { onConflict: 'table_number' });
  if (tErr) console.error('Masa hatası:', tErr.message);
  else console.log('✅ Masalar eklendi.');

  const { error: cErr } = await supabase.from('customers').upsert(customers, { onConflict: 'phone_number' });
  if (cErr) console.error('Müşteri hatası:', cErr.message);
  else console.log('✅ Müşteriler eklendi.');
}

forceSeed();
