import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getVapiResponse } from '@/lib/vapi-messages';
import { parseVapiPayload } from '@/lib/vapi-parser';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();

    const rawBody = await req.json();
    const body = parseVapiPayload(rawBody);

    const { 
      customer_name, 
      phone_number, 
      language,
      reason,
      conversation_summary,
      urgency,
      call_id 
    } = body;

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

    return NextResponse.json(getVapiResponse('staff_handoff', language));

  } catch (error: any) {
    console.error('Error in handoff-to-staff:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
