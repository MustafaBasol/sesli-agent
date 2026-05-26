import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';
import { getValueFromAliases, normalizePhone } from '@/lib/vapi-normalizers';

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
    const language: string = getValueFromAliases(allSources, ['language', 'lang']) || 'tr';
    const reason: string =
      getValueFromAliases(allSources, ['reason', 'handoff_reason', 'request']) || '';
    const conversation_summary: string | null =
      getValueFromAliases(allSources, ['conversation_summary', 'summary', 'notes']) || null;
    const urgency: string =
      getValueFromAliases(allSources, ['urgency', 'priority']) || 'normal';
    const call_id: string | null = body.call_id || null;

    await supabase.from('tool_logs').insert({
      vapi_call_id: call_id,
      tool_name: 'handoff_to_staff',
      request_payload: rawBody,
      status: 'processing'
    });

    const { data: resData, error: resError } = await supabase
      .from('staff_handoffs')
      .insert({
        vapi_call_id: call_id,
        customer_name,
        phone_number,
        language,
        reason,
        conversation_summary,
        urgency: urgency || 'normal',
        raw_payload: rawBody,
        status: 'new'
      })
      .select()
      .single();

    if (resError) throw resError;

    await supabase
      .from('tool_logs')
      .update({ status: 'success', response_payload: { id: resData.id } })
      .match({ vapi_call_id: call_id, tool_name: 'handoff_to_staff', status: 'processing' });

    return createVapiToolResponse(rawBody, getVapiResponse('staff_handoff', language));

  } catch (error: any) {
    console.error('Error in handoff-to-staff:', error);
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
