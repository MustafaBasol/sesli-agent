'use server';

import { createServerSupabase } from '@/lib/supabase-server';

export async function getMenuItems() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('menu_items')
    .select('*')
    .order('name', { ascending: true });
  
  if (error) throw error;
  return data;
}

export async function getCategories() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('menu_categories')
    .select('*')
    .order('display_order', { ascending: true });
  
  if (error) throw error;
  return data;
}

export async function addCategory(name: string) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('menu_categories')
    .insert({ name });
  
  if (error) throw error;
  return { success: true };
}

export async function deleteCategory(id: string) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('menu_categories')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

export async function addMenuItem(item: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('menu_items')
    .insert(item);
  
  if (error) throw error;
  return { success: true };
}

export async function updateMenuItem(id: string, updates: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('menu_items')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}
