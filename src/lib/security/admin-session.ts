import crypto from 'crypto';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'gm_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12;

type SessionPayload = {
  exp: number;
  nonce: string;
};

function getAdminPassword(): string {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('ADMIN_PASSWORD is not configured.');
  }
  return adminPassword;
}

function getSessionSecret(): string {
  const secret = process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD;
  if (!secret) {
    throw new Error('ADMIN_SESSION_SECRET or ADMIN_PASSWORD must be configured.');
  }
  return secret;
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac('sha256', getSessionSecret())
    .update(payloadB64)
    .digest('base64url');
}

function encodePayload(payload: SessionPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodePayload(payloadB64: string): SessionPayload | null {
  try {
    const raw = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw) as SessionPayload;
    if (typeof parsed.exp !== 'number' || typeof parsed.nonce !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function verifyAdminPassword(input: string): boolean {
  const expected = getAdminPassword();
  return constantTimeEqual(input, expected);
}

export function createSignedAdminToken(): string {
  const payload: SessionPayload = {
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const payloadB64 = encodePayload(payload);
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifySignedAdminToken(token: string): boolean {
  const [payloadB64, signature] = token.split('.');
  if (!payloadB64 || !signature) return false;

  const expectedSignature = signPayload(payloadB64);
  if (!constantTimeEqual(signature, expectedSignature)) return false;

  const payload = decodePayload(payloadB64);
  if (!payload) return false;
  if (!Number.isFinite(payload.exp)) return false;

  return payload.exp > Date.now();
}

export async function createAdminSession(): Promise<void> {
  const token = createSignedAdminToken();
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
}

export async function isAdminAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!token) return false;
  return verifySignedAdminToken(token);
}

export async function requireAdminSession(): Promise<void> {
  if (!(await isAdminAuthenticated())) {
    throw new Error('Unauthorized');
  }
}

export { ADMIN_COOKIE_NAME };