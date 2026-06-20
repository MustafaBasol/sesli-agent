'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/security/admin-session';

export async function getCustomers() {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('total_reservations', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function updateCustomer(id: string, updates: any) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}
