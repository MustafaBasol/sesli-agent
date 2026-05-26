import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getCurrentDateInfo } from '@/lib/current-date';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    rawBody = await req.json();
  } catch {}
  try {
    const supabase = createServerSupabase();

    // 1. Fetch Weekly Hours
    const { data: settings } = await supabase.from('restaurant_settings').select('*');
    
    // 2. Fetch Active Blackout Dates
    const { data: blackouts } = await supabase
      .from('blackout_dates')
      .select('date, reason')
      .gte('date', getCurrentDateInfo().today_iso);

    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const hoursFormatted = settings?.map(s => 
      `${DAYS[s.day_of_week]}: ${s.is_closed ? 'Closed' : s.open_time.slice(0,5) + ' - ' + s.close_time.slice(0,5)}`
    ).join('\n');

    const blackoutsFormatted = blackouts?.length ? 
      blackouts.map(b => `${b.date} (${b.reason})`).join(', ') : 'None';

    return createVapiToolResponse(rawBody, {
      opening_hours: hoursFormatted,
      holiday_closures: blackoutsFormatted,
      instruction: "If the requested reservation date is in holiday_closures, or outside opening_hours, inform the guest we are closed."
    });

  } catch (error: any) {
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
