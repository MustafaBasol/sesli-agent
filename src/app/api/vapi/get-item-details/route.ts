import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();

    const { item_name } = await req.json();

    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .ilike('name', `%${item_name}%`)
      .limit(1)
      .single();

    if (error || !data) {
      return NextResponse.json({ 
        message: "I couldn't find detailed information for this specific item. Please refer to the general menu or ask a staff member." 
      });
    }

    return NextResponse.json({
      name: data.name,
      price: `${data.price} ${data.currency}`,
      description: data.description || "No detailed description available in the system.",
      category: data.category,
      availability: data.is_available ? "In Stock" : "Out of Stock",
      instruction: "Use this information to answer the guest. If the description is empty or doesn't contain what they asked, tell them you don't have that specific detail and offer to hand off to staff."
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
