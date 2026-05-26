import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getCurrentDateInfo } from '@/lib/current-date';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    const supabase = createServerSupabase();
    rawBody = await req.json();
    const { date, time, party_size } = rawBody;
    const currentYear = Number(getCurrentDateInfo().today_iso.slice(0, 4));
    const dateParts = String(date || '').split('-');
    let checkDate = String(date || '');

    if (dateParts.length === 3 && Number(dateParts[0]) < currentYear) {
      checkDate = `${currentYear}-${dateParts[1]}-${dateParts[2]}`;
    }

    const dayOfWeek = new Date(`${checkDate}T12:00:00Z`).getUTCDay();

    // 1. Fetch all settings and rules in parallel
    const [
      { data: settings },
      { data: rules },
      { data: blackouts },
      { data: allTables },
      { data: existingBookings }
    ] = await Promise.all([
      supabase.from('restaurant_settings').select('*').eq('day_of_week', dayOfWeek).single(),
      supabase.from('restaurant_rules').select('*'),
      supabase.from('blackout_dates').select('*').eq('date', checkDate).single(),
      supabase.from('tables').select('*').eq('is_active', true),
      supabase.from('reservation_requests').select('assigned_table_id').eq('reservation_date', checkDate).eq('reservation_time', time)
    ]);

    // --- RULE CHECKS ---

    // A. Holiday Check
    if (blackouts) {
      return createVapiToolResponse(rawBody, { 
        available: false, 
        reason: "Holiday/Closure", 
        message: `I'm sorry, we are closed on this date: ${blackouts.reason || 'Special Holiday'}.` 
      });
    }

    // B. Day & Hours Check
    if (!settings || settings.is_closed) {
      return createVapiToolResponse(rawBody, { available: false, reason: "Closed", message: "We are closed on this day of the week." });
    }

    const openTime = settings.open_time;
    const closeTime = settings.close_time;
    if (time < openTime || time > closeTime) {
      return createVapiToolResponse(rawBody, { 
        available: false, 
        reason: "Outside Hours", 
        message: `We are only open between ${openTime.slice(0,5)} and ${closeTime.slice(0,5)}.` 
      });
    }

    // C. Max Party Size Check
    const maxPartySize = parseInt(rules?.find(r => r.key === 'max_party_size')?.value || '10');
    if (party_size > maxPartySize) {
      return createVapiToolResponse(rawBody, { 
        available: false, 
        reason: "Party Too Large", 
        message: `Our maximum table size is ${maxPartySize} people. For larger groups, please contact us directly.` 
      });
    }

    // --- CALENDAR / TABLE CHECKS ---

    const bookedTableIds = existingBookings?.map(b => b.assigned_table_id) || [];
    const availableTables = allTables?.filter(t => !bookedTableIds.includes(t.id) && t.capacity >= party_size);

    if (!availableTables || availableTables.length === 0) {
      return createVapiToolResponse(rawBody, { 
        available: false, 
        reason: "Fully Booked", 
        message: "We are fully booked at this time. Would you like to try another time or a different date?",
        suggest_alternatives: true
      });
    }

    // D. Manual Approval Threshold
    const manualThreshold = parseInt(rules?.find(r => r.key === 'manual_approval_threshold')?.value || '8');
    const needsApproval = party_size >= manualThreshold;

    return createVapiToolResponse(rawBody, {
      available: true,
      needs_approval: needsApproval,
      best_table_id: availableTables[0].id,
      date: checkDate,
      message: needsApproval ? 
        "I can take your request, but for a group of this size, our team will need to confirm it manually." : 
        "Great, we have a table available for you!"
    });

  } catch (error: any) {
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
