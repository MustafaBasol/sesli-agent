import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { getCurrentDateInfo } from '@/lib/current-date';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';
import {
  getValueFromAliases,
  normalizeDate,
  normalizeTime,
  normalizePartySize,
  normalizePhone,
  buildMissingFieldsResponse,
} from '@/lib/vapi-normalizers';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    rawBody = await req.json();
    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];
    const currentYear = Number(getCurrentDateInfo().today_iso.slice(0, 4));

    const customer_name: string =
      getValueFromAliases(allSources, ['customer_name', 'full_name', 'name', 'customerName']) || '';
    const rawPhone = getValueFromAliases(allSources, [
      'phone_number', 'phone', 'caller_phone', 'customer_phone',
    ]) ||
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number ||
      null;
    const phone_number = normalizePhone(rawPhone);

    const reservation_date = normalizeDate(
      getValueFromAliases(allSources, ['reservation_date', 'date', 'requested_date']),
      currentYear,
    );
    const reservation_time = normalizeTime(
      getValueFromAliases(allSources, ['reservation_time', 'time', 'requested_time']),
    );
    const party_size = normalizePartySize(
      getValueFromAliases(allSources, [
        'party_size', 'partySize', 'guests', 'guest_count', 'number_of_people', 'people',
      ]),
    );
    const language: string =
      getValueFromAliases(allSources, ['language', 'lang']) || 'tr';
    const special_request: string | null =
      getValueFromAliases(allSources, ['special_request', 'notes', 'request', 'special_notes']) || null;
    const call_id: string | null = body.call_id || null;

    console.log('[CREATE_RESERVATION INPUT]', {
      customer_name, phone_number, reservation_date, reservation_time, party_size, language,
    });

    const missingFields: string[] = [];
    if (!customer_name) missingFields.push('customer_name');
    if (!phone_number) missingFields.push('phone_number');
    if (!reservation_date) missingFields.push('reservation_date');
    if (!reservation_time) missingFields.push('reservation_time');
    if (!party_size) missingFields.push('party_size');

    if (missingFields.length > 0) {
      return createVapiToolResponse(rawBody, buildMissingFieldsResponse(missingFields));
    }

    const finalReservationDate = reservation_date!;

    const supabase = createServerSupabase();

    // 1. Log Tool Call
    await supabase.from('tool_logs').insert({
      vapi_call_id: call_id,
      tool_name: 'create_reservation_request',
      request_payload: rawBody,
      status: 'processing'
    });

    // 2. CRM: Upsert Customer
    const { data: customerData } = await supabase
      .from('customers')
      .upsert({ 
        phone_number, 
        full_name: customer_name,
        last_visit_at: new Date().toISOString()
      }, { onConflict: 'phone_number' })
      .select()
      .single();

    // 3. Insert Reservation Request
    const { data: resData, error: resError } = await supabase
      .from('reservation_requests')
      .insert({
        vapi_call_id: call_id,
        customer_id: customerData?.id,
        customer_name,
        phone_number,
        party_size,
        reservation_date: finalReservationDate,
        reservation_time: reservation_time!,
        language,
        special_request,
        raw_payload: rawBody,
        status: 'new'
      })
      .select()
      .single();

    if (resError) throw resError;

    await supabase
      .from('calls')
      .upsert({
        vapi_call_id: call_id,
        caller_phone: phone_number,
        customer_name,
        language,
        intent: 'reservation_create',
        summary: `${customer_name} için ${party_size} kişilik rezervasyon oluşturuldu: ${finalReservationDate} ${reservation_time}.`,
        outcome: resData.status || 'new',
        raw_payload: rawBody,
      }, { onConflict: 'vapi_call_id' });

    // 4. Update Tool Log
    await supabase
      .from('tool_logs')
      .update({ status: 'success', response_payload: { id: resData.id } })
      .match({ vapi_call_id: call_id, tool_name: 'create_reservation_request', status: 'processing' });

    return createVapiToolResponse(rawBody, getVapiResponse('reservation_received', language));

  } catch (error: any) {
    console.error('Error in create-reservation-request:', error);
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
