import type { Response } from "express";

/**
 * Express port of src/lib/vapi-response.ts (Next.js app). Pure builders are
 * exported separately from the res.json() senders so the response shape can
 * be unit-tested without mocking Express's Response object.
 *
 * rawBody's shape is decided by Vapi, not by us, so `any` is used
 * deliberately for it rather than fought with type assertions.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
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

export interface VapiHttpPayload {
  status: number;
  body: unknown;
}

export function buildVapiSuccessPayload(rawBody: any, payload: unknown, status = 200): VapiHttpPayload {
  const toolCallId = getVapiToolCallId(rawBody);

  if (toolCallId) {
    return {
      status: 200,
      body: { results: [{ toolCallId, result: JSON.stringify(payload) }] },
    };
  }

  return { status, body: payload };
}

export function buildVapiErrorPayload(rawBody: any, message: string, fallbackStatus = 500): VapiHttpPayload {
  const toolCallId = getVapiToolCallId(rawBody);

  if (toolCallId) {
    return {
      status: 200,
      body: { results: [{ toolCallId, error: message }] },
    };
  }

  return { status: fallbackStatus, body: { error: message } };
}

export function sendVapiToolResponse(res: Response, rawBody: any, payload: unknown, status = 200): void {
  const { status: httpStatus, body } = buildVapiSuccessPayload(rawBody, payload, status);
  res.status(httpStatus).json(body);
}

export function sendVapiToolErrorResponse(
  res: Response,
  rawBody: any,
  message: string,
  fallbackStatus = 500
): void {
  const { status, body } = buildVapiErrorPayload(rawBody, message, fallbackStatus);
  res.status(status).json(body);
}
