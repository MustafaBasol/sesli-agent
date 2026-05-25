import { createClient } from '@supabase/supabase-js';

// This client should ONLY be used in Server Components or API Routes
export const createServerSupabase = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  
  return createClient(supabaseUrl, supabaseServiceKey);
};
