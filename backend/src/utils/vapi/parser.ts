/**
 * Parses Vapi tool-call webhook payloads.
 * Vapi sends payloads in different shapes depending on configuration:
 * 1. Direct JSON body (arguments at root)
 * 2. Nested: message.toolCalls[0].function.arguments
 * 3. Nested: toolCall.function.arguments
 *
 * Mirrors src/lib/vapi-parser.ts in the Next.js app — kept byte-for-byte
 * compatible so both the old and new endpoints accept the same Vapi payloads.
 *
 * The payload shape is genuinely dynamic (decided by Vapi, not by us), so
 * `any` is used deliberately here rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export function parseVapiPayload(body: any): any {
  if (body?.message?.toolCalls?.[0]?.function?.arguments) {
    const args = body.message.toolCalls[0].function.arguments;
    const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
    return {
      ...parsedArgs,
      call_id: body.message.call?.id || parsedArgs.call_id,
    };
  }

  if (body?.message?.toolCallList?.[0]?.function?.arguments) {
    const args = body.message.toolCallList[0].function.arguments;
    const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
    return {
      ...parsedArgs,
      call_id: body.message.call?.id || parsedArgs.call_id,
    };
  }

  if (body?.toolCall?.function?.arguments) {
    const args = body.toolCall.function.arguments;
    const parsedArgs = typeof args === "string" ? JSON.parse(args) : args;
    return {
      ...parsedArgs,
      call_id: body.call?.id || parsedArgs.call_id,
    };
  }

  return body;
}
