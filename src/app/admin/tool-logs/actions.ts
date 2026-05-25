'use server';

import { createServerSupabase } from '@/lib/supabase-server';
import { requireAdminSession } from '@/lib/security/admin-session';

export async function getToolLogs() {
  await requireAdminSession();

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from('tool_logs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}
