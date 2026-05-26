import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';
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
    const supabase = createServerSupabase();
    rawBody = await req.json();
    const body = parseVapiPayload(rawBody);
    const allSources = [body, rawBody];

    const customer_name: string =
      getValueFromAliases(allSources, ['customer_name', 'full_name', 'name']) || '';
    const rawPhone = getValueFromAliases(allSources, [
      'phone_number', 'phone', 'caller_phone', 'customer_phone',
    ]) ||
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number ||
      null;
    const phone_number = normalizePhone(rawPhone);

    const original_reservation_date = normalizeDate(
      getValueFromAliases(allSources, ['original_reservation_date', 'original_date']),
    );
    const original_reservation_time = normalizeTime(
      getValueFromAliases(allSources, ['original_reservation_time', 'original_time']),
    );
    const new_reservation_date = normalizeDate(
      getValueFromAliases(allSources, [
        'new_reservation_date', 'new_date', 'reservation_date', 'date',
      ]),
    );
    const new_reservation_time = normalizeTime(
      getValueFromAliases(allSources, [
        'new_reservation_time', 'new_time', 'reservation_time', 'time',
      ]),
    );
    const party_size = normalizePartySize(
      getValueFromAliases(allSources, [
        'party_size', 'new_party_size', 'partySize', 'guests',
      ]),
    );
    const language: string = getValueFromAliases(allSources, ['language', 'lang']) || 'tr';
    const note: string | null = getValueFromAliases(allSources, ['note', 'notes', 'special_request']) || null;
    const call_id: string | null = body.call_id || null;

    console.log('[MODIFY_RESERVATION INPUT]', {
      customer_name, phone_number, original_reservation_date, original_reservation_time,
      new_reservation_date, new_reservation_time, party_size,
    });

    const missingFields: string[] = [];
    if (!customer_name && !phone_number) missingFields.push('customer_name or phone_number');
    if (!new_reservation_date) missingFields.push('new_reservation_date');
    if (!new_reservation_time) missingFields.push('new_reservation_time');

    if (missingFields.length > 0) {
      return createVapiToolResponse(rawBody, buildMissingFieldsResponse(missingFields));
    }

    await supabase.from('tool_logs').insert({
      vapi_call_id: call_id,
      tool_name: 'modify_reservation_request',
      request_payload: rawBody,
      status: 'processing'
    });

    const { data: resData, error: resError } = await supabase
      .from('reservation_changes')
      .insert({
        vapi_call_id: call_id,
        customer_name,
        phone_number,
        original_reservation_date,
        original_reservation_time,
        new_reservation_date,
        new_reservation_time,
        party_size,
        language,
        note,
        raw_payload: rawBody,
        status: 'new'
      })
      .select()
      .single();

    if (resError) throw resError;

    await supabase
      .from('tool_logs')
      .update({ status: 'success', response_payload: { id: resData.id } })
      .match({ vapi_call_id: call_id, tool_name: 'modify_reservation_request', status: 'processing' });

    return createVapiToolResponse(rawBody, getVapiResponse('reservation_received', language));

  } catch (error: any) {
    console.error('Error in modify-reservation-request:', error);
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
