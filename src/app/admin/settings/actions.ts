'use server';

import { createServerSupabase } from '@/lib/supabase-server';

export async function getSettings() {
  const supabase = createServerSupabase();
  const { data: weekly } = await supabase
    .from('restaurant_settings')
    .select('*')
    .order('day_of_week', { ascending: true });
  
  const { data: rules } = await supabase
    .from('restaurant_rules')
    .select('*');

  return { weekly: weekly || [], rules: rules || [] };
}

export async function updateDaySettings(id: string, updates: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('restaurant_settings')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

export async function updateRule(key: string, value: string) {
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('restaurant_rules')
    .update({ value, updated_at: new Date().toISOString() })
    .eq('key', key);
  
  if (error) throw error;
  return { success: true };
}

export async function getBlackoutDates() {
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('blackout_dates')
    .select('*');
  
  if (error) throw error;
  return data;
}

export async function toggleBlackoutDate(date: string, reason?: string) {
  const supabase = createServerSupabase();
  const { data: existing } = await supabase.from('blackout_dates').select('*').eq('date', date).single();

  if (existing) {
    await supabase.from('blackout_dates').delete().eq('date', date);
  } else {
    await supabase.from('blackout_dates').insert({ date, reason });
  }
  return { success: true };
}
