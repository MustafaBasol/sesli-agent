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

    const rawPhone = getValueFromAliases(allSources, [
      'phone_number', 'phone', 'caller_phone', 'customer_phone',
    ]) ||
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number ||
      null;
    const phoneNumber = normalizePhone(rawPhone);

    if (!phoneNumber) {
      return createVapiToolErrorResponse(rawBody, 'Phone number is required');
    }

    const fullName: string =
      getValueFromAliases(allSources, ['full_name', 'customer_name', 'name', 'customerName']) ||
      rawBody?.customer?.name ||
      rawBody?.message?.customer?.name ||
      rawBody?.message?.call?.customer?.name ||
      rawBody?.call?.customer?.name ||
      'Unknown Customer';

    const notes: string | null =
      getValueFromAliases(allSources, ['notes', 'conversation_summary', 'summary', 'request']) || null;
    const { language, call_id, intent, conversation_summary } = body;

    // 1. Log tool call
    await supabase.from('tool_logs').insert({
      tool_name: 'create_customer_profile',
      vapi_call_id: call_id || null,
      request_payload: rawBody,
      status: 'processing',
    });

    // 2. Upsert customer (preserve existing notes if none provided)
    let customerData: { id: string } | null = null;
    let isNew = false;

    const { data: existing } = await supabase
      .from('customers')
      .select('id, notes')
      .eq('phone_number', phoneNumber)
      .maybeSingle();

    if (existing) {
      const updatePayload: Record<string, unknown> = {
        full_name: fullName,
        last_visit_at: new Date().toISOString(),
      };
      if (notes) updatePayload.notes = notes;

      const { data: updated } = await supabase
        .from('customers')
        .update(updatePayload)
        .eq('phone_number', phoneNumber)
        .select('id')
        .single();

      customerData = updated;
      isNew = false;
    } else {
      const { data: inserted } = await supabase
        .from('customers')
        .insert({
          phone_number: phoneNumber,
          full_name: fullName,
          notes: notes || null,
          last_visit_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      customerData = inserted;
      isNew = true;
    }

    // 3. Upsert call record (only if call_id is present)
    if (call_id) {
      await supabase
        .from('calls')
        .upsert(
          {
            vapi_call_id: call_id,
            caller_phone: phoneNumber,
            customer_name: fullName,
            language: language || null,
            intent: intent || 'customer_profile',
            summary:
              conversation_summary ||
              `${fullName} müşteri profili oluşturuldu veya güncellendi.`,
            outcome: 'customer_profile_saved',
            raw_payload: rawBody,
          },
          { onConflict: 'vapi_call_id' }
        );
    }

    // 4. Update tool log to success
    await supabase
      .from('tool_logs')
      .update({
        status: 'success',
        response_payload: {
          customer_id: customerData?.id,
          phone_number: phoneNumber,
          full_name: fullName,
        },
      })
      .match({
        tool_name: 'create_customer_profile',
        status: 'processing',
        ...(call_id ? { vapi_call_id: call_id } : {}),
      });

    return createVapiToolResponse(rawBody, {
      success: true,
      customer_id: customerData?.id,
      full_name: fullName,
      phone_number: phoneNumber,
      is_new: isNew,
      message: 'Customer profile saved',
    });
  } catch (error: any) {
    console.error('Error in create-customer-profile:', error);
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
