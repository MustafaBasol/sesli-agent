'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/security/admin-session';

export async function getTables() {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .order('table_number', { ascending: true });
  
  if (error) throw error;
  return data;
}

export async function addTable(table: any) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tables')
    .insert(table);
  
  if (error) throw error;
  return { success: true };
}

export async function updateTable(id: string, updates: any) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}
