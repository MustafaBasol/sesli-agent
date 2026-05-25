'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/security/admin-session';

export async function getDashboardStats() {
  await requireAdminSession();
  const supabase = createServerSupabase();

  const [
    { count: totalCustomers },
    { count: totalTables },
    { data: activeReservations },
    { count: menuItems },
    { data: recentReservations }
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('tables').select('*', { count: 'exact', head: true }),
    supabase.from('reservation_requests').select('*').eq('status', 'confirmed'),
    supabase.from('menu_items').select('*', { count: 'exact', head: true }),
    supabase.from('reservation_requests')
      .select('*, customers(full_name)')
      .order('created_at', { ascending: false })
      .limit(5)
  ]);

  const today = new Date().toISOString().split('T')[0];
  const { count: todayReservations } = await supabase
    .from('reservation_requests')
    .select('*', { count: 'exact', head: true })
    .eq('reservation_date', today);

  return {
    totalCustomers: totalCustomers || 0,
    totalTables: totalTables || 0,
    activeTables: activeReservations?.length || 0,
    todayReservations: todayReservations || 0,
    menuItems: menuItems || 0,
    recentReservations: recentReservations || []
  };
}
