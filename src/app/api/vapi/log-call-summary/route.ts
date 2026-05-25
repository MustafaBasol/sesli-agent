import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseVapiPayload } from '@/lib/vapi-parser';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();
    const rawBody = await req.json();
    const body = parseVapiPayload(rawBody);

    const webhookCustomerPhone =
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number;

    const { 
      call_id,
      caller_phone,
      phone_number,
      customer_name,
      language,
      intent,
      summary,
      outcome
    } = body;

    const resolvedPhone = caller_phone || phone_number || webhookCustomerPhone || null;
    const callLog = {
      vapi_call_id: call_id,
      caller_phone: resolvedPhone,
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

    return NextResponse.json({ status: 'success', message: 'Call summary logged.' });

  } catch (error: any) {
    console.error('Error in log-call-summary:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
