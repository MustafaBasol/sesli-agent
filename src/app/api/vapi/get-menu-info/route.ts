import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST(req: Request) {
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

    return NextResponse.json({
      menu_info: menuFormatted,
      footer_message: "Please inform the guest that all prices are inclusive of VAT."
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
