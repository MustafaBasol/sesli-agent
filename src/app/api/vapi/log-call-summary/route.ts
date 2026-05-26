import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
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

    const webhookCustomerPhone =
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number;

    const call_id: string | null = body.call_id || null;
    const rawPhone = getValueFromAliases(allSources, [
      'caller_phone', 'phone_number', 'phone', 'customer_phone',
    ]) || webhookCustomerPhone || null;
    const caller_phone = normalizePhone(rawPhone);
    const customer_name: string | null =
      getValueFromAliases(allSources, ['customer_name', 'full_name', 'name']) || null;
    const language: string | null = getValueFromAliases(allSources, ['language', 'lang']) || null;
    const intent: string | null =
      getValueFromAliases(allSources, ['intent', 'call_intent', 'reason']) || null;
    const summary: string | null =
      getValueFromAliases(allSources, ['summary', 'conversation_summary', 'notes']) || null;
    const outcome: string | null =
      getValueFromAliases(allSources, ['outcome', 'status', 'result']) || null;
    const callLog = {
      vapi_call_id: call_id,
      caller_phone: caller_phone,
      customer_name,
      language,
      intent,
      summary,
      outcome,
      raw_payload: rawBody
    };

    const { error: resError } = call_id
      ? await supabase.from('calls').upsert(callLog, { onConflict: 'vapi_call_id' })
      : await supabase.from('calls').insert(callLog);

    if (resError) throw resError;

    return createVapiToolResponse(rawBody, {
      success: true,
      silent: true,
      assistant_instruction: "Do not tell the caller to wait. If the caller is ending the call, say a short polite goodbye."
    });

  } catch (error: any) {
    console.error('Error in log-call-summary:', error);
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
