import { NextResponse } from 'next/server';
import { getCurrentDateInfo } from '@/lib/current-date';
import { createVapiToolResponse } from '@/lib/vapi-response';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(getCurrentDateInfo());
}

export async function POST(req: Request) {
  const info = getCurrentDateInfo();
  let rawBody: any = {};
  try {
    rawBody = await req.json();
  } catch {
    // Direct health checks may POST without a JSON body.
  }
  return createVapiToolResponse(rawBody, info);
}
