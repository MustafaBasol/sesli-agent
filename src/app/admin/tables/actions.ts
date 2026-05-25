'use server';

import { createServerSupabase } from '@/lib/supabase-server';

export async function getTables() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('tables')
    .select('*')
    .order('table_number', { ascending: true });
  
  if (error) throw error;
  return data;
}

export async function addTable(table: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tables')
    .insert(table);
  
  if (error) throw error;
  return { success: true };
}

export async function updateTable(id: string, updates: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('tables')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}
