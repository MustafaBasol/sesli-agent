import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    const supabase = createServerSupabase();
    rawBody = await req.json();
    const body = parseVapiPayload(rawBody);

    const { 
      customer_name, 
      phone_number, 
      original_reservation_date,
      original_reservation_time,
      new_reservation_date,
      new_reservation_time,
      party_size,
      language,
      note,
      call_id 
    } = body;

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
