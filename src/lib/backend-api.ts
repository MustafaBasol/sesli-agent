/**
 * Client for the dedicated Node/Express + PostgreSQL backend (see AGENTS.md).
 * Isolated from the existing Supabase/Vapi flow on purpose — nothing here is
 * wired into production pages yet (Phase 9: frontend foundation only).
 */

const DEFAULT_BASE_URL = '/api';

function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_BACKEND_API_URL?.trim() || DEFAULT_BASE_URL;
}

export class BackendApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'BackendApiError';
    this.status = status;
    this.details = details;
  }
}

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string | null;
  body?: unknown;
  query?: Record<string, string | number | undefined>;
};

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${getBaseUrl()}${path}`;
  if (!query) return url;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `${url}?${queryString}` : url;
}

export async function backendRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', token, body, query } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(buildUrl(path, query), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.error?.message) || `Backend request failed (${response.status})`;
    throw new BackendApiError(message, response.status, data?.error?.details);
  }

  return data as T;
}
