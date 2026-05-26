import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { createVapiToolResponse, createVapiToolErrorResponse } from '@/lib/vapi-response';
import { getValueFromAliases, buildMissingFieldsResponse } from '@/lib/vapi-normalizers';
import { parseVapiPayload } from '@/lib/vapi-parser';

export async function POST(req: Request) {
  let rawBody: any = {};
  try {
    rawBody = await req.json();
    const body = parseVapiPayload(rawBody);
    const item_name: string | null = getValueFromAliases(
      [body, rawBody],
      ['item_name', 'item', 'dish', 'product_name', 'menu_item', 'name'],
    ) || null;

    if (!item_name) {
      return createVapiToolResponse(rawBody, buildMissingFieldsResponse(['item_name']));
    }

    const supabase = createServerSupabase();

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
