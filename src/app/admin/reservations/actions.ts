'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/security/admin-session';

export async function getReservations() {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('reservation_requests')
    .select('*, tables:assigned_table_id(table_number)')
    .order('reservation_date', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function deleteReservation(id: string) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { error } = await supabase
    .from('reservation_requests')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

export async function updateReservation(id: string, updates: any) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  
  if (updates.customer_name || updates.phone_number) {
    const { data: res } = await supabase.from('reservation_requests').select('customer_id').eq('id', id).single();
    if (res?.customer_id) {
      await supabase.from('customers').update({
        full_name: updates.customer_name,
        phone_number: updates.phone_number
      }).eq('id', res.customer_id);
    }
  }

  const { error } = await supabase
    .from('reservation_requests')
    .update(updates)
    .eq('id', id);
  
  if (error) throw error;
  return { success: true };
}

export async function getAvailableTables(date: string, time: string) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { data: allTables } = await supabase.from('tables').select('*').eq('is_active', true);
  const { data: booked } = await supabase.from('reservation_requests').select('assigned_table_id').eq('reservation_date', date).not('assigned_table_id', 'is', null);
  const bookedTableIds = booked?.map(r => r.assigned_table_id) || [];
  return allTables?.filter(table => !bookedTableIds.includes(table.id)) || [];
}

export async function createManualReservation(reservation: any) {
  await requireAdminSession();
  const supabase = createServerSupabase();
  const { data: customer } = await supabase.from('customers').upsert({ phone_number: reservation.phone_number, full_name: reservation.customer_name }, { onConflict: 'phone_number' }).select().single();
  const { error } = await supabase.from('reservation_requests').insert({ ...reservation, customer_id: customer?.id, status: reservation.assigned_table_id ? 'confirmed' : 'new' });
  if (error) throw error;
  return { success: true };
}
