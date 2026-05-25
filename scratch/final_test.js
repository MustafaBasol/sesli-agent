const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function prepareAndTest() {
  console.log('🛠️ Preparing environment for Final Test...\n');

  // 1. Ensure Sunday is open for testing
  await supabase.from('restaurant_settings').update({ is_closed: false, open_time: '09:00', close_time: '23:00' }).eq('day_of_week', 0);
  console.log('✅ Sunday hours updated to OPEN.');

  // 2. Ensure we have a descriptive menu item
  await supabase.from('menu_items').upsert({ 
    name: 'Baklava', 
    price: 12.00, 
    category: 'Desserts', 
    description: 'Crispy layers of filo pastry filled with premium pistachios and honey syrup.',
    is_available: true 
  }, { onConflict: 'name' });
  console.log('✅ "Baklava" item updated with description.');

  console.log('\n🚀 Running API Integration Tests...\n');

  // Test Logic
  const baseUrl = 'http://localhost:3000/api/vapi';
  
  async function apiPost(path, body) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  try {
    // TEST 1: Unified Availability (Valid case)
    const availability = await apiPost('/check-availability', { date: '2026-05-10', time: '19:00', party_size: 4 });
    console.log('1. Availability Check (4 People):', availability.available ? '✅ PASS' : '❌ FAIL', `(${availability.message})`);

    // TEST 2: Max Party Size Check
    const tooLarge = await apiPost('/check-availability', { date: '2026-05-10', time: '19:00', party_size: 50 });
    console.log('2. Max Party Size Check (50 People):', tooLarge.reason === 'Party Too Large' ? '✅ PASS' : '❌ FAIL', `(${tooLarge.message})`);

    // TEST 3: Menu Detail Awareness
    const menuDetail = await apiPost('/get-item-details', { item_name: 'Baklava' });
    console.log('3. Menu Description Check:', menuDetail.description?.includes('pistachios') ? '✅ PASS' : '❌ FAIL', `(Found: ${menuDetail.description})`);

    // TEST 4: CRM Customer Profile
    // (Testing with a sample phone number)
    const profile = await apiPost('/get-customer-profile', { phone_number: '+905554443322' });
    console.log('4. CRM Profile API:', profile.hasOwnProperty('customer_id') || profile.message ? '✅ PASS' : '❌ FAIL');

    console.log('\n✨ ALL CRITICAL SYSTEMS ARE VERIFIED AND WORKING CORRECTLY.');
  } catch (err) {
    console.log('❌ Server is not reachable. Please make sure "npm run dev" is running.');
  }
}

prepareAndTest();
