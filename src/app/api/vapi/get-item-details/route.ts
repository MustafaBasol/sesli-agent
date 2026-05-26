import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    const supabase = createServerSupabase();
    rawBody = await req.json();
    const { item_name } = rawBody;

    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .ilike('name', `%${item_name}%`)
      .limit(1)
      .single();

    if (error || !data) {
      return createVapiToolResponse(rawBody, { 
        message: "I couldn't find detailed information for this specific item. Please refer to the general menu or ask a staff member." 
      });
    }

    return createVapiToolResponse(rawBody, {
      name: data.name,
      price: `${data.price} ${data.currency}`,
      description: data.description || "No detailed description available in the system.",
      category: data.category,
      availability: data.is_available ? "In Stock" : "Out of Stock",
      instruction: "Use this information to answer the guest. If the description is empty or doesn't contain what they asked, tell them you don't have that specific detail and offer to hand off to staff."
    });

  } catch (error: any) {
    return createVapiToolErrorResponse(rawBody, error.message);
  }
}
