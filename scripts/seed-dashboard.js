const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY // Use service role for seeding
);

async function seedDashboard() {
  try {
    console.log('🚀 Starting Seeding...');

    const { data: customers, error: custErr } = await supabase.from('customers').select('id, full_name, phone_number');
    if (custErr) throw custErr;
    
    if (!customers || customers.length === 0) {
      console.log('❌ No customers found. Run seed-data.js first.');
      return;
    }

    const reservations = [
      {
        customer_id: customers[0].id,
        customer_name: customers[0].full_name,
        phone_number: customers[0].phone_number,
        party_size: 4,
        reservation_date: new Date().toISOString().split('T')[0],
        reservation_time: '19:00',
        language: 'tr',
        status: 'new'
      }
    ];

    const { error: resErr } = await supabase.from('reservation_requests').insert(reservations);
    if (resErr) throw resErr;
    console.log('✅ Reservation added.');

    const { error: callErr } = await supabase.from('calls').insert([{
      vapi_call_id: `demo-${Date.now()}`,
      customer_name: customers[0].full_name,
      caller_phone: customers[0].phone_number,
      intent: 'reservation_create',
      summary: 'Test summary',
      outcome: 'completed'
    }]);
    if (callErr) throw callErr;
    console.log('✅ Call log added.');

    console.log('✨ Seeding successful!');
  } catch (err) {
    console.error('❌ Error during seeding:', err.message);
  }
}

seedDashboard();
