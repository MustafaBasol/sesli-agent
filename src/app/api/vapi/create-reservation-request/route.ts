import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { getCurrentDateInfo } from '@/lib/current-date';
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
      party_size, 
      reservation_date, 
      reservation_time, 
      language, 
      special_request,
      call_id 
    } = body;
    const currentYear = Number(getCurrentDateInfo().today_iso.slice(0, 4));
    const dateParts = String(reservation_date || '').split('-');
    let finalReservationDate = String(reservation_date || '');

    if (dateParts.length === 3 && Number(dateParts[0]) < currentYear) {
      finalReservationDate = `${currentYear}-${dateParts[1]}-${dateParts[2]}`;
    }

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
        reservation_time,
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
