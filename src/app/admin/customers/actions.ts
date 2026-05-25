'use server';

import { createServerSupabase } from '@/lib/supabase-server';

export async function getCustomers() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('total_reservations', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function updateCustomer(id: string, updates: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}
