import { NextResponse } from 'next/server';

export function getVapiToolCallId(rawBody: any): string | null {
  return (
    rawBody?.message?.toolCalls?.[0]?.id ||
    rawBody?.toolCallList?.[0]?.id ||
    rawBody?.toolCalls?.[0]?.id ||
    rawBody?.toolCall?.id ||
    rawBody?.toolCallId ||
    rawBody?.id ||
    null
  );
}

export function createVapiToolResponse(rawBody: any, payload: unknown, status = 200) {
  const toolCallId = getVapiToolCallId(rawBody);

  if (toolCallId) {
    return NextResponse.json(
      {
        results: [
          {
            toolCallId,
            result: JSON.stringify(payload),
          },
        ],
      },
      { status: 200 }
    );
  }

  return NextResponse.json(payload, { status });
}

export function createVapiToolErrorResponse(rawBody: any, message: string) {
  const toolCallId = getVapiToolCallId(rawBody);

  if (toolCallId) {
    return NextResponse.json(
      {
        results: [
          {
            toolCallId,
            error: message,
          },
        ],
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ error: message }, { status: 500 });
}
