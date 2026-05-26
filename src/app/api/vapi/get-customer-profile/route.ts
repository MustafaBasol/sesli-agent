import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseVapiPayload } from '@/lib/vapi-parser';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';

function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, '') || '';
}

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    const supabase = createServerSupabase();
    rawBody = await req.json();
    const body = parseVapiPayload(rawBody);
    const phoneNumber =
      body.phone_number ||
      rawBody?.customer?.number ||
      rawBody?.message?.customer?.number ||
      rawBody?.message?.call?.customer?.number ||
      rawBody?.call?.customer?.number;

    if (!phoneNumber) {
      return createVapiToolErrorResponse(rawBody, 'Phone number is required');
    }

    const phoneSuffix = normalizePhone(phoneNumber).slice(-9);
    const { data, error } = await supabase
      .from('customers')
      .select('id, phone_number, full_name, notes, total_reservations, last_visit_at')
      .ilike('phone_number', `%${phoneSuffix}%`)
      .maybeSingle();

    if (error || !data) {
      return createVapiToolResponse(rawBody, {
        is_known: false,
        caller_phone: phoneNumber,
        message: 'New customer',
      });
    }

    return createVapiToolResponse(rawBody, {
      is_known: true,
      customer_id: data.id,
      full_name: data.full_name,
      phone_number: data.phone_number,
      notes: data.notes,
      total_reservations: data.total_reservations,
      last_visit_at: data.last_visit_at,
      instructions: `Known returning customer. Address the caller by name as ${data.full_name}. Do not ask for their phone number again unless they want to use a different number. Use ${data.phone_number} for tools that require phone_number.`,
      customer_message_fr: `Bienvenue a nouveau, ${data.full_name}! Ravi de vous revoir.`,
      customer_message_tr: `Tekrar hos geldiniz ${data.full_name}! Sizi tekrar gormek cok guzel.`,
      customer_message_en: `Welcome back, ${data.full_name}! Great to see you again.`,
    });
  } catch (error: any) {
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
