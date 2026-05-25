const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const menuItems = [
  // Soups
  { name: 'Soupe aux lentilles', category: 'Soups', price: 7.00, currency: 'EUR', description: 'Mercredi special' },
  { name: 'Soupe d\'agneau / Kelle Paça', category: 'Soups', price: 12.90, currency: 'EUR' },
  
  // Cold Starters
  { name: 'Humus', category: 'Cold Starters', price: 6.50, currency: 'EUR' },
  { name: 'Pembe Sultan', category: 'Cold Starters', price: 6.50, currency: 'EUR' },
  { name: 'Acili Ezme', category: 'Cold Starters', price: 6.50, currency: 'EUR' },
  { name: 'Şakşuka', category: 'Cold Starters', price: 6.50, currency: 'EUR' },
  { name: 'Cacik', category: 'Cold Starters', price: 6.50, currency: 'EUR' },
  { name: 'Carotte Tarator', category: 'Cold Starters', price: 6.50, currency: 'EUR' },
  { name: 'Çoban Salata', category: 'Cold Starters', price: 9.90, currency: 'EUR' },
  { name: 'Golden Special Salade', category: 'Cold Starters', price: 12.90, currency: 'EUR' },
  { name: 'Golden Special avec Quinoa', category: 'Cold Starters', price: 14.90, currency: 'EUR' },

  // Grilled Meats
  { name: 'Côtelette d\'agneau', category: 'Grilled Meats', price: 24.90, currency: 'EUR' },
  { name: 'Brochette d\'agneau', category: 'Grilled Meats', price: 19.90, currency: 'EUR' },
  { name: 'Bonfile', category: 'Grilled Meats', price: 28.90, currency: 'EUR' },
  { name: 'Bonfile Café de Paris', category: 'Grilled Meats', price: 28.90, currency: 'EUR' },
  { name: 'Cheddar Bonfile', category: 'Grilled Meats', price: 29.90, currency: 'EUR' },
  { name: 'Entrecôte', category: 'Grilled Meats', price: 28.90, currency: 'EUR' },
  { name: 'Lokum', category: 'Grilled Meats', price: 28.90, currency: 'EUR' },
  { name: 'Viande Sauté pour une personne', category: 'Grilled Meats', price: 24.90, currency: 'EUR' },
  { name: 'Agneau Kelebek', category: 'Grilled Meats', price: 25.90, currency: 'EUR' },
  { name: 'Kasap Köfte', category: 'Grilled Meats', price: 16.90, currency: 'EUR' },

  // Kebabs
  { name: 'Adana Kebab', category: 'Kebabs', price: 22.90, currency: 'EUR' },
  { name: 'Beyti Kebab', category: 'Kebabs', price: 22.90, currency: 'EUR' },
  { name: 'Ali Nazik Kebab', category: 'Kebabs', price: 21.90, currency: 'EUR' },
  { name: 'Adana Iskender', category: 'Kebabs', price: 25.90, currency: 'EUR' },

  // Chicken
  { name: 'Poulet Fileto', category: 'Chicken', price: 17.90, currency: 'EUR' },
  { name: 'Poulet avec Café de Paris', category: 'Chicken', price: 18.90, currency: 'EUR' },
  { name: 'Brochette de Poulet', category: 'Chicken', price: 18.90, currency: 'EUR' },
  { name: 'Fajita Poulet', category: 'Chicken', price: 19.90, currency: 'EUR' },

  // Pides
  { name: 'Mevlana Pide', category: 'Pides', price: 12.90, currency: 'EUR' },
  { name: 'Pide Mixte', category: 'Pides', price: 14.90, currency: 'EUR' },
  { name: 'Kaşarlı Pide', category: 'Pides', price: 10.90, currency: 'EUR' },

  // Desserts
  { name: 'Triangle Baklava aux Pistaches', category: 'Desserts', price: 7.00, currency: 'EUR' },
  { name: 'Baklava aux Pistache', category: 'Desserts', price: 7.00, currency: 'EUR' },
  { name: 'Künefe', category: 'Desserts', price: 8.90, currency: 'EUR' },
  { name: 'Katmer', category: 'Desserts', price: 8.00, currency: 'EUR' },

  // Drinks
  { name: 'Thé Turc Fraîchement Infusé', category: 'Hot Drinks', price: 1.00, currency: 'EUR' },
  { name: 'Café Turc Traditionnel', category: 'Hot Drinks', price: 3.00, currency: 'EUR' },
  { name: 'Coca Cola (330 ml)', category: 'Soft Drinks', price: 3.50, currency: 'EUR' },
  { name: 'Ayran Nature', category: 'Soft Drinks', price: 2.90, currency: 'EUR' },
  { name: 'Hibiscus Ice Tea', category: 'Mocktails', price: 8.90, currency: 'EUR' },
  { name: 'Mojito Classic', category: 'Mojitos', price: 6.90, currency: 'EUR' }
];

async function seed() {
  console.log('🍽️ Seeding Full Menu (Selected Items)...');
  
  // Clean existing menu first to avoid duplicates in demo
  await supabase.from('menu_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  const { error } = await supabase.from('menu_items').insert(menuItems);
  if (error) console.error('Error:', error.message);
  else console.log('✅ Menu seeded successfully!');
}

seed();
