'use server';

import { createServerSupabase } from '@/lib/supabase-server';

function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, '') || '';
}

function phonesMatch(customerPhone?: string | null, callerPhone?: string | null) {
  const customerDigits = normalizePhone(customerPhone);
  const callerDigits = normalizePhone(callerPhone);

  if (!customerDigits || !callerDigits) return false;

  const customerSuffix = customerDigits.slice(-9);
  const callerSuffix = callerDigits.slice(-9);

  return customerDigits === callerDigits || customerSuffix === callerSuffix;
}

export async function getCustomerDetail(id: string) {
  const supabase = createServerSupabase();

  // 1. Fetch Customer Profile
  const { data: profile } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .single();

  // 2. Fetch Reservation History (with table info)
  const { data: reservations } = await supabase
    .from('reservation_requests')
    .select('*, tables:assigned_table_id(table_number)')
    .eq('customer_id', id)
    .order('reservation_date', { ascending: false });

  // 3. Fetch Call History
  // Phone numbers can arrive from Vapi in national, E.164, or formatted form.
  // Fetch recent calls and normalize locally so the detail page is not tied to
  // one exact string representation.
  const { data: recentCalls } = await supabase
    .from('calls')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const calls = (recentCalls || []).filter((call) => {
    if (phonesMatch(profile?.phone_number, call.caller_phone)) return true;

    const callName = call.customer_name?.trim().toLocaleLowerCase('tr-TR');
    const profileName = profile?.full_name?.trim().toLocaleLowerCase('tr-TR');
    return !call.caller_phone && callName && profileName && callName === profileName;
  });

  const reservationActivity = (reservations || []).map((reservation) => ({
    id: `reservation-${reservation.id}`,
    created_at: reservation.created_at,
    intent: 'reservation_create',
    summary: `${reservation.customer_name} için ${reservation.party_size} kişilik rezervasyon oluşturuldu: ${reservation.reservation_date} ${reservation.reservation_time}.`,
    outcome: reservation.status || 'confirmed',
    source: 'reservation',
    details: {
      reservation_id: reservation.id,
      reservation_date: reservation.reservation_date,
      reservation_time: reservation.reservation_time,
      party_size: reservation.party_size,
      table_number: reservation.tables?.table_number || null,
      status: reservation.status,
      note: reservation.special_request || reservation.internal_note || null,
    },
  }));

  const visibleCalls = calls.length > 0 ? calls : reservationActivity;

  // 4. Fetch Order History
  const { data: orders } = await supabase
    .from('orders')
    .select('*')
    .eq('customer_id', id)
    .order('created_at', { ascending: false });

  return { profile, reservations, calls: visibleCalls, orders };
}

export async function addOrderToReservation(order: any) {
  const supabase = createServerSupabase();
  const { error } = await supabase.from('orders').insert(order);
  if (error) throw error;
  return { success: true };
}
