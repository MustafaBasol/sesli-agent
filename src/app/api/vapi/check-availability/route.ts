import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getCurrentDateInfo } from '@/lib/current-date';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';
import {
  getValueFromAliases,
  normalizeDate,
  normalizeTime,
  normalizePartySize,
  buildMissingFieldsResponse,
} from '@/lib/vapi-normalizers';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    rawBody = await req.json();
    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const currentYear = Number(getCurrentDateInfo().today_iso.slice(0, 4));

    const requestedDate = getValueFromAliases(allSources, [
      'date', 'reservation_date', 'requested_date', 'new_date', 'new_reservation_date',
    ]);
    const requestedTime = getValueFromAliases(allSources, [
      'time', 'reservation_time', 'requested_time', 'new_time', 'new_reservation_time',
    ]);
    const requestedPartySize = getValueFromAliases(allSources, [
      'party_size', 'partySize', 'guests', 'guest_count', 'number_of_people', 'people', 'new_party_size',
    ]);

    const normalizedDate = normalizeDate(requestedDate, currentYear);
    const normalizedTime = normalizeTime(requestedTime);
    const partySize = normalizePartySize(requestedPartySize);

    console.log('[CHECK_AVAILABILITY INPUT]', {
      requestedDate, requestedTime, requestedPartySize,
      normalizedDate, normalizedTime, partySize,
    });

    const missingFields: string[] = [];
    if (!normalizedDate) missingFields.push('date');
    if (!normalizedTime) missingFields.push('time');
    if (!partySize) missingFields.push('party_size');

    if (missingFields.length > 0) {
      return createVapiToolResponse(rawBody, buildMissingFieldsResponse(
        missingFields,
        `I need the ${missingFields.join(', ')} before checking availability.`,
      ));
    }

    const checkDate = normalizedDate!;
    const time = normalizedTime!;
    const dayOfWeek = new Date(`${checkDate}T12:00:00Z`).getUTCDay();

    const supabase = createServerSupabase();

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
    if (partySize! > maxPartySize) {
      return createVapiToolResponse(rawBody, { 
        available: false, 
        reason: "Party Too Large", 
        message: `Our maximum table size is ${maxPartySize} people. For larger groups, please contact us directly.` 
      });
    }

    // --- CALENDAR / TABLE CHECKS ---

    const bookedTableIds = existingBookings?.map(b => b.assigned_table_id) || [];
    const availableTables = allTables?.filter(t => !bookedTableIds.includes(t.id) && t.capacity >= partySize!);

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
    const needsApproval = partySize! >= manualThreshold;

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
