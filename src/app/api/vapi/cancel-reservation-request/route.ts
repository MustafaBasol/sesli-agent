import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';
import {
  getValueFromAliases,
  normalizeDate,
  normalizeTime,
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

    const reservation_date = normalizeDate(
      getValueFromAliases(allSources, ['reservation_date', 'date', 'original_date']),
    );
    const reservation_time = normalizeTime(
      getValueFromAliases(allSources, ['reservation_time', 'time', 'original_time']),
    );
    const language: string = getValueFromAliases(allSources, ['language', 'lang']) || 'tr';
    const reason: string | null =
      getValueFromAliases(allSources, ['reason', 'cancellation_reason', 'notes']) || null;
    const call_id: string | null = body.call_id || null;

    console.log('[CANCEL_RESERVATION INPUT]', {
      customer_name, phone_number, reservation_date, reservation_time, reason,
    });

    const missingFields: string[] = [];
    if (!customer_name && !phone_number) missingFields.push('customer_name or phone_number');
    if (!reservation_date) missingFields.push('reservation_date');
    if (!reservation_time) missingFields.push('reservation_time');

    if (missingFields.length > 0) {
      return createVapiToolResponse(rawBody, buildMissingFieldsResponse(missingFields));
    }

    await supabase.from('tool_logs').insert({
      vapi_call_id: call_id,
      tool_name: 'cancel_reservation_request',
      request_payload: rawBody,
      status: 'processing'
    });

    const { data: resData, error: resError } = await supabase
      .from('reservation_cancellations')
      .insert({
        vapi_call_id: call_id,
        customer_name,
        phone_number,
        reservation_date,
        reservation_time,
        language,
        reason,
        raw_payload: rawBody,
        status: 'new'
      })
      .select()
      .single();

    if (resError) throw resError;

    await supabase
      .from('tool_logs')
      .update({ status: 'success', response_payload: { id: resData.id } })
      .match({ vapi_call_id: call_id, tool_name: 'cancel_reservation_request', status: 'processing' });

    return createVapiToolResponse(rawBody, getVapiResponse('reservation_received', language));

  } catch (error: any) {
    console.error('Error in cancel-reservation-request:', error);
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
