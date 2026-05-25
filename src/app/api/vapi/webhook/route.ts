import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { getCurrentDateInfo } from '@/lib/current-date';

function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, '') || '';
}

export async function POST(req: Request) {
  try {
    const supabase = createServerSupabase();
    const body = await req.json();
    
    // Vapi sends tool calls via the "message" field
    const message = body.message;
    
    // Handle Assistant Request (at the start of the call)
    if (message?.type === 'assistant-request') {
      const dateInfo = getCurrentDateInfo();
      const currentAssistant = body.assistant || {};
      const currentPrompt = currentAssistant.model?.messages?.[0]?.content || "";
      const callerPhone =
        message.customer?.number ||
        message.call?.customer?.number ||
        body.customer?.number ||
        body.call?.customer?.number ||
        null;
      const phoneSuffix = normalizePhone(callerPhone).slice(-9);
      let customerContext = `CALLER PHONE: ${callerPhone || 'unknown'}\nCUSTOMER STATUS: unknown. If the phone number is unknown, ask for it only when needed.`;
      let dynamicFirstMessage = currentAssistant.firstMessage;

      if (phoneSuffix) {
        const { data: customer } = await supabase
          .from('customers')
          .select('full_name, phone_number, notes, total_reservations, last_visit_at')
          .ilike('phone_number', `%${phoneSuffix}%`)
          .maybeSingle();

        if (customer) {
          dynamicFirstMessage = `Merhaba ${customer.full_name}, Golden Meat'e tekrar hos geldiniz. Size nasil yardimci olabilirim?`;
          customerContext = [
            `CALLER PHONE: ${customer.phone_number}`,
            'CUSTOMER STATUS: known returning customer',
            `CUSTOMER NAME: ${customer.full_name}`,
            `TOTAL RESERVATIONS: ${customer.total_reservations ?? 0}`,
            customer.last_visit_at ? `LAST VISIT: ${customer.last_visit_at}` : null,
            customer.notes ? `INTERNAL CUSTOMER NOTES: ${customer.notes}` : null,
            '',
            'MANDATORY CUSTOMER RECOGNITION RULES:',
            `- Greet this caller naturally by name as ${customer.full_name}.`,
            '- Do not ask for their phone number again unless they explicitly want to use a different number.',
            `- When a tool requires phone_number, use ${customer.phone_number}.`,
            `- When a tool requires customer_name, use ${customer.full_name}.`,
            '- Do not reveal internal notes directly to the caller.',
          ].filter(Boolean).join('\n');
        } else {
          customerContext = [
            `CALLER PHONE: ${callerPhone}`,
            'CUSTOMER STATUS: new or not found',
            'Ask for the caller name when needed. Do not ask for the phone number again if the caller phone above is usable.',
            `When a tool requires phone_number, use ${callerPhone}.`,
          ].join('\n');
        }
      }
      console.log(`[DYNAMIC DATE] Call started on: ${dateInfo.today_spoken_tr} (${dateInfo.today_iso})`);

      // PREPEND date but KEEP the rest of the prompt!
      const newPrompt = [
        'GÜNCEL TARİH VE KONUŞMA KURALI - ZORUNLU',
        `Bugünün tarihi: ${dateInfo.today_spoken_tr} (${dateInfo.weekday_tr}, ISO: ${dateInfo.today_iso})`,
        `Yarının tarihi: ${dateInfo.tomorrow_spoken_tr} (${dateInfo.tomorrow_weekday_tr}, ISO: ${dateInfo.tomorrow_iso})`,
        dateInfo.relative_date_rule_tr,
        dateInfo.tool_date_rule,
        dateInfo.spoken_date_rule_tr,
        'Telefonda "bir bir sıfır beş", "zero five", "two thousand twenty six" gibi rakam rakam veya İngilizce tarih okuma.',
        '',
        customerContext,
        '',
        currentPrompt,
      ].join('\n');

      return NextResponse.json({
        assistant: {
          firstMessage: dynamicFirstMessage,
          model: {
            messages: [
              {
                role: 'system',
                content: newPrompt
              }
            ]
          }
        }
      });
    }

    if (message?.type === 'end-of-call-report') {
      const callId = message.call?.id || body.call?.id || body.id || null;
      const phone =
        message.customer?.number ||
        message.call?.customer?.number ||
        body.customer?.number ||
        body.call?.customer?.number ||
        null;
      const summary = message.summary || message.analysis?.summary || null;
      const language = message.language || message.call?.language || null;
      const outcome = message.endedReason || message.status || 'ended';

      const callLog = {
        vapi_call_id: callId,
        caller_phone: phone,
        customer_name: message.customer?.name || message.call?.customer?.name || 'Guest',
        language,
        intent: message.analysis?.structuredData?.intent || message.analysis?.structuredData?.Intent || 'call_report',
        summary,
        outcome,
        started_at: message.startedAt || null,
        ended_at: message.endedAt || null,
        raw_payload: body,
      };

      if (callId) {
        await supabase
          .from('calls')
          .upsert(callLog, { onConflict: 'vapi_call_id' });
      } else {
        await supabase.from('calls').insert(callLog);
      }

      console.log(`[END OF CALL] Saved report for call: ${callId || 'unknown'}`);
      return NextResponse.json({ ok: true });
    }

    // Vapi sends tool calls via the "message" field
    if (message?.type === 'tool-calls') {
      const results = [];
      
      for (const toolCall of message.toolCallList || []) {
        const fnName = toolCall.function?.name;
        const args = toolCall.function?.arguments ? 
          (typeof toolCall.function.arguments === 'string' 
            ? JSON.parse(toolCall.function.arguments) 
            : toolCall.function.arguments) 
          : {};
        
        console.log(`[WEBHOOK] Tool call: ${fnName}`, args);
        
        let result: any = {};
        
        switch (fnName) {
          case 'get_current_date': {
            result = getCurrentDateInfo();
            break;
          }

          case 'get_customer_profile': {
            const inputPhone =
              args.phone_number ||
              message.customer?.number ||
              message.call?.customer?.number ||
              body.customer?.number ||
              body.call?.customer?.number ||
              null;
            const phone = inputPhone?.replace(/\D/g, '').slice(-9);
            
            // Try to find existing
            let { data } = await supabase
              .from('customers')
              .select('*')
              .ilike('phone_number', `%${phone}%`)
              .maybeSingle();
            
            // AUTOMATIC REGISTRATION: If not found, create immediately
            if (!data && inputPhone) {
              console.log(`[SILENT REGISTRATION] Creating profile for ${inputPhone}`);
              const { data: newCust, error } = await supabase
                .from('customers')
                .insert({ full_name: 'New Guest', phone_number: inputPhone })
                .select('*')
                .single();
              
              if (error) console.error(`[SILENT REG ERROR]`, error);
              data = newCust;
            }
            
            result = data
              ? {
                  is_known: data.full_name !== 'New Guest',
                  ...data,
                  instructions: data.full_name !== 'New Guest'
                    ? `Address the caller by name as ${data.full_name}. Do not ask for phone_number again; use ${data.phone_number}.`
                    : `Caller phone is ${data.phone_number}. Ask for name when needed, but do not ask for phone number again.`,
                }
              : { is_known: false, message: 'Customer not found and could not be created.' };
            break;
          }
          
          case 'get_menu_info': {
            const { data } = await supabase
              .from('menu_items')
              .select('*')
              .eq('is_available', true);
            const formatted = (data || []).map(i => 
              `- ${i.name} (${i.category}): ${i.price}€. ${i.description || ''}`
            ).join('\n');
            result = { menu_info: formatted || 'Menu is currently empty.' };
            break;
          }
          
          case 'get_item_details': {
            const { data } = await supabase
              .from('menu_items')
              .select('*')
              .ilike('name', `%${args.item_name}%`)
              .single();
            result = data || { message: `No details found for "${args.item_name}".` };
            break;
          }
          
          case 'check_availability': {
            // Smart Date Validation First!
            let checkDate = args.date;
            const currentYear = Number(getCurrentDateInfo().today_iso.slice(0, 4));
            const parts = checkDate.split('-');
            const requestedYear = parseInt(parts[0]);
            if (requestedYear < currentYear) {
              checkDate = checkDate.replace(parts[0], currentYear.toString());
            }

            const dayOfWeek = new Date(`${checkDate}T12:00:00Z`).getUTCDay();
            const { data: settings } = await supabase
              .from('restaurant_settings')
              .select('*')
              .eq('day_of_week', dayOfWeek)
              .single();
            const { data: blackout } = await supabase
              .from('blackout_dates')
              .select('*')
              .eq('date', checkDate)
              .single();
            
            if (blackout) {
              result = { available: false, reason: 'Holiday', message: `Closed on ${checkDate}: ${blackout.reason || 'Holiday'}` };
            } else if (!settings || settings.is_closed) {
              result = { available: false, reason: 'Closed', message: 'We are closed on this day.' };
            } else {
              // Support multiple time slots
              const slots = settings.open_time.includes('-') 
                ? settings.open_time.split(',').map((s: string) => s.trim())
                : [`${settings.open_time.slice(0,5)}-${settings.close_time.slice(0,5)}`];
              
              const isWithinAnySlot = slots.some((slot: string) => {
                const [start, end] = slot.split('-');
                return args.time >= start && args.time <= end;
              });

              if (!isWithinAnySlot) {
                result = { 
                  available: false, 
                  reason: 'Outside Hours', 
                  message: `We are only open during these slots: ${slots.join(', ')}. Your requested time ${args.time} is outside our service hours.` 
                };
              } else {
                const { data: rules } = await supabase.from('restaurant_rules').select('*');
                const maxParty = parseInt(rules?.find((r: any) => r.key === 'max_party_size')?.value || '12');
                if (args.party_size > maxParty) {
                  result = { available: false, reason: 'Party Too Large', message: `Max party size is ${maxParty}.` };
                } else {
                  const { data: bookings } = await supabase
                    .from('reservation_requests')
                    .select('assigned_table_id')
                    .eq('reservation_date', checkDate)
                    .eq('reservation_time', args.time);
                  const { data: tables } = await supabase
                    .from('tables')
                    .select('*')
                    .eq('is_active', true);
                  const bookedIds = (bookings || []).map((b: any) => b.assigned_table_id);
                  const available = (tables || []).filter((t: any) => !bookedIds.includes(t.id) && t.capacity >= args.party_size);
                  
                  if (available.length === 0) {
                    result = { available: false, reason: 'Fully Booked', message: 'No tables available at this time.' };
                  } else {
                    result = { available: true, best_table_id: available[0].id, message: 'Table available!' };
                  }
                }
              }
            }
            break;
          }
          
          case 'create_reservation_request': {
            const callId = args.call_id || message.call?.id || body.call?.id || null;
            // Smart Date Validation First!
            const currentYear = Number(getCurrentDateInfo().today_iso.slice(0, 4));
            let finalDate = args.reservation_date;
            const parts = finalDate.split('-');
            const requestedYear = parseInt(parts[0]);

            if (requestedYear < currentYear) {
              finalDate = finalDate.replace(parts[0], currentYear.toString());
              console.log(`[DATE AUTO-FIX] Moved past year ${requestedYear} to current year ${currentYear}: ${finalDate}`);
            }

            // 1. Double Check Availability (Security)
            const dayOfWeek = new Date(`${finalDate}T12:00:00Z`).getUTCDay();
            const { data: settings } = await supabase.from('restaurant_settings').select('*').eq('day_of_week', dayOfWeek).single();
            const { data: blackout } = await supabase.from('blackout_dates').select('*').eq('date', finalDate).single();

            if (blackout || (settings && settings.is_closed)) {
              console.error(`[BOOKING REJECTED] Date ${finalDate} is CLOSED!`);
              result = { success: false, message: 'Sorry, we are actually closed on this day. Reservation could not be completed.' };
              break;
            }

            // 2. Find or Create/Update Customer (Upsert)
            const phone = args.phone_number?.replace(/\D/g, '').slice(-9);
            const fullName = args.customer_name || 'New Guest';
            
            console.log(`[UPSERT CUSTOMER] Phone suffix: ${phone}, Name: ${fullName}`);

            // We use a robust find-or-create logic instead of upsert to avoid constraint issues
            let customerId = null;
            const { data: existingCust } = await supabase
              .from('customers')
              .select('id')
              .ilike('phone_number', `%${phone}%`)
              .single();

            if (existingCust) {
              customerId = existingCust.id;
              console.log(`[CUSTOMER FOUND] ID: ${customerId}`);
            } else {
              console.log(`[CUSTOMER NOT FOUND] Creating new customer ${fullName}...`);
              const { data: newCust, error: custError } = await supabase
                .from('customers')
                .insert({ full_name: fullName, phone_number: args.phone_number })
                .select('id')
                .single();
              
              if (custError) {
                console.error(`[CUSTOMER CREATE ERROR]`, custError);
              }
              customerId = newCust?.id;
            }            
            console.log(`[CUSTOMER READY] ID: ${customerId}`);

            // AUTO-ASSIGN TABLE if not provided
            let tableId = args.assigned_table_id;
            if (!tableId) {
              const { data: bookings } = await supabase
                .from('reservation_requests')
                .select('assigned_table_id')
                .eq('reservation_date', finalDate) // Using corrected date
                .eq('reservation_time', args.reservation_time);
              const { data: tables } = await supabase
                .from('tables')
                .select('*')
                .eq('is_active', true)
                .order('capacity', { ascending: true });
              
              const bookedIds = (bookings || []).map((b: any) => b.assigned_table_id);
              const available = (tables || []).filter((t: any) => !bookedIds.includes(t.id) && t.capacity >= args.party_size);
              
              if (available.length > 0) {
                tableId = available[0].id;
              }
            }
            
            const { data: res, error } = await supabase
              .from('reservation_requests')
              .insert({
                vapi_call_id: callId,
                customer_id: customerId,
                customer_name: fullName,
                phone_number: args.phone_number,
                reservation_date: finalDate, // Using corrected date
                reservation_time: args.reservation_time,
                party_size: args.party_size,
                assigned_table_id: tableId,
                status: 'confirmed'
              })
              .select('*')
              .single();

            if (!error) {
              await supabase
                .from('calls')
                .upsert({
                  vapi_call_id: callId,
                  caller_phone: args.phone_number,
                  customer_name: fullName,
                  language: args.language || 'tr',
                  intent: 'reservation_create',
                  summary: `${fullName} için ${args.party_size} kişilik rezervasyon oluşturuldu: ${finalDate} ${args.reservation_time}.`,
                  outcome: res?.status || 'confirmed',
                  raw_payload: body,
                }, { onConflict: 'vapi_call_id' });
            }
            
            result = error 
              ? { success: false, message: error.message } 
              : { success: true, reservation_id: res?.id, message: `Reservation confirmed at table ${tableId ? 'assigned' : 'pending'}!` };
            break;
          }
          
          case 'create_customer_profile': {
            const phone = args.phone_number?.replace(/\D/g, '').slice(-9);
            let { data: existing } = await supabase
              .from('customers')
              .select('*')
              .ilike('phone_number', `%${phone}%`)
              .single();
            
            let resultData = existing;
            let resultError = null;

            if (!existing) {
              const { data: newCust, error } = await supabase
                .from('customers')
                .insert({ full_name: args.full_name, phone_number: args.phone_number })
                .select('*')
                .single();
              resultData = newCust;
              resultError = error;
            }
            
            result = resultError 
              ? { success: false, message: resultError.message } 
              : { success: true, customer: resultData, message: 'Customer profile created successfully!' };
            break;
          }

          case 'modify_reservation_request': {
            const { data: res, error } = await supabase
              .from('reservation_requests')
              .update({
                reservation_date: args.new_date || undefined,
                reservation_time: args.new_time || undefined,
                party_size: args.new_party_size || undefined
              })
              .eq('id', args.reservation_id)
              .select('*')
              .single();
            
            result = error 
              ? { success: false, message: error.message } 
              : { success: true, message: 'Reservation updated successfully!' };
            break;
          }

          case 'cancel_reservation_request': {
            const { error } = await supabase
              .from('reservation_requests')
              .delete()
              .eq('id', args.reservation_id);
            
            result = error 
              ? { success: false, message: error.message } 
              : { success: true, message: 'Reservation cancelled successfully!' };
            break;
          }
          
          case 'handoff_to_staff': {
            result = { success: true, message: "Transferring to staff..." };
            break;
          }
          
          case 'log_call_summary': {
            const phone =
              args.caller_phone ||
              args.phone_number ||
              body.customer?.number ||
              message.customer?.number ||
              message.call?.customer?.number ||
              null;
            
            await supabase.from('calls').insert({
              caller_phone: phone,
              customer_name: args.customer_name || 'Guest',
              summary: args.summary,
              intent: args.intent,
              outcome: args.outcome,
              language: args.language || 'tr'
            });
            
            console.log(`[CALL LOGGED] Saved summary for phone: ${phone}`);
            result = { success: true };
            break;
          }
          
          case 'get_opening_hours': {
            const { data } = await supabase.from('restaurant_settings').select('*').order('day_of_week');
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            const formatted = (data || []).map((d: any) => {
              const slots = d.open_time.includes('-') ? d.open_time : `${d.open_time.slice(0,5)}-${d.close_time.slice(0,5)}`;
              return `${days[d.day_of_week]}: ${d.is_closed ? 'Closed' : slots}`;
            }).join('\n');

            // Also fetch upcoming closures
            const { data: blackouts } = await supabase
              .from('blackout_dates')
              .select('*')
              .gte('date', getCurrentDateInfo().today_iso)
              .limit(5);
            
            const blackoutInfo = (blackouts && blackouts.length > 0) 
              ? '\n\nSPECIAL CLOSURES (CLOSED THESE DATES):\n' + blackouts.map((b: any) => `${b.date}: CLOSED (${b.reason || 'Holiday'})`).join('\n')
              : '';

            result = { opening_hours: formatted + blackoutInfo };
            break;
          }
          
          default:
            result = { message: `Unknown tool: ${fnName}` };
        }
        
        results.push({
          toolCallId: toolCall.id,
          result: JSON.stringify(result)
        });
      }
      
      return NextResponse.json({ results });
    }
    
    // For other message types (status updates, etc.)
    return NextResponse.json({ ok: true });
    
  } catch (error: any) {
    console.error('[WEBHOOK ERROR]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
