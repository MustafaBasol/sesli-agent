import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    rawBody = await req.json();
  } catch {}
  try {
    const supabase = createServerSupabase();
    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('is_available', true);

    if (error) throw error;

    // Format the menu for the AI assistant
    const menuFormatted = data.map(item => 
      `- ${item.name} (${item.category}): ${item.price} ${item.currency}. Description: ${item.description}`
    ).join('\n');

    return createVapiToolResponse(rawBody, {
      menu_info: menuFormatted,
      footer_message: "Please inform the guest that all prices are inclusive of VAT."
    });

  } catch (error: any) {
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
