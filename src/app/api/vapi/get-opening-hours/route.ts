import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getCurrentDateInfo } from '@/lib/current-date';

export async function POST(req: Request) {
  try {
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

    return NextResponse.json({
      opening_hours: hoursFormatted,
      holiday_closures: blackoutsFormatted,
      instruction: "If the requested reservation date is in holiday_closures, or outside opening_hours, inform the guest we are closed."
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
