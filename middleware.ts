import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Edge Runtime: define cookie name directly to avoid importing Node.js crypto module
const ADMIN_COOKIE_NAME = 'gm_admin_session';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function getExpectedVapiSecret(): string | null {
  return process.env.VAPI_SERVER_URL_SECRET || process.env.VAPI_WEBHOOK_SECRET || null;
}

function guardAdmin(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/admin')) return null;

  const hasSession = Boolean(request.cookies.get(ADMIN_COOKIE_NAME)?.value);

  if (pathname.startsWith('/admin/login')) {
    if (hasSession) {
      return NextResponse.redirect(new URL('/admin/dashboard', request.url));
    }
    return null;
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL('/admin/login', request.url));
  }

  return null;
}

function guardVapi(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/vapi/')) return null;

  const expectedSecret = getExpectedVapiSecret();

  if (!expectedSecret) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'Vapi secret is not configured.' },
        { status: 500 },
      );
    }
    return null;
  }

  const providedSecret =
    request.headers.get('x-vapi-secret') ||
    request.headers.get('x-vapi-server-secret') ||
    extractBearerToken(request.headers.get('authorization'));

  if (!providedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return null;
}

export function middleware(request: NextRequest) {
  const adminResponse = guardAdmin(request);
  if (adminResponse) return adminResponse;

  const vapiResponse = guardVapi(request);
  if (vapiResponse) return vapiResponse;

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/api/vapi/:path*'],
};