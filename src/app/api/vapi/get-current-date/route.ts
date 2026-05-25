import { NextResponse } from 'next/server';
import { getCurrentDateInfo } from '@/lib/current-date';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getCurrentDateInfo());
}

export async function POST(req: Request) {
  const info = getCurrentDateInfo();

  try {
    const body = await req.json();
    const toolCalls = body?.message?.toolCallList || body?.toolCallList;

    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return NextResponse.json({
        results: toolCalls.map((toolCall: any) => ({
          toolCallId: toolCall.id,
          result: JSON.stringify(info),
        })),
      });
    }
  } catch {
    // Direct health checks may POST without a JSON body.
  }

  return NextResponse.json(info);
}
