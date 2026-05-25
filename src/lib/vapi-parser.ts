/**
 * Utility to parse Vapi tool call payloads.
 * Vapi sends payloads in different formats depending on configuration:
 * 1. Direct JSON body (arguments at root)
 * 2. Nested: message.toolCalls[0].function.arguments
 * 3. Nested: toolCall.function.arguments
 */
export function parseVapiPayload(body: any) {
  // 1. Check for nested toolCalls (Standard Vapi Webhook)
  if (body?.message?.toolCalls?.[0]?.function?.arguments) {
    const args = body.message.toolCalls[0].function.arguments;
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    return {
      ...parsedArgs,
      call_id: body.message.call?.id || parsedArgs.call_id
    };
  }

  if (body?.message?.toolCallList?.[0]?.function?.arguments) {
    const args = body.message.toolCallList[0].function.arguments;
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    return {
      ...parsedArgs,
      call_id: body.message.call?.id || parsedArgs.call_id
    };
  }

  // 2. Check for single toolCall object
  if (body?.toolCall?.function?.arguments) {
    const args = body.toolCall.function.arguments;
    const parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    return {
      ...parsedArgs,
      call_id: body.call?.id || parsedArgs.call_id
    };
  }

  // 3. Default to root level arguments
  return body;
}
