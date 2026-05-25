'use server';

import { createServerSupabase } from '@/lib/supabase-server';

export async function getMonthlyReservations(year: number, month: number) {
  const supabase = createServerSupabase();
  const startOfMonth = new Date(year, month, 1).toISOString();
  const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

  console.log(`[CALENDAR] Fetching for range: ${startOfMonth.split('T')[0]} to ${endOfMonth.split('T')[0]}`);

  const { data, error } = await supabase
    .from('reservation_requests')
    .select('*, tables(*)')
    .gte('reservation_date', startOfMonth.split('T')[0])
    .lte('reservation_date', endOfMonth.split('T')[0]);
  
  if (error) {
    console.error(`[CALENDAR ERROR]`, error);
    throw error;
  }
  
  console.log(`[CALENDAR] Found ${data?.length || 0} reservations.`);
  if (data && data.length > 0) {
    console.log(`[CALENDAR SAMPLE] First reservation date: ${data[0].reservation_date}`);
  }
  return data;
}
