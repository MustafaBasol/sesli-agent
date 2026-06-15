import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_COOKIE_NAME = 'gm_admin_session';
const DEFAULT_LOCALE = 'en';
const LOCALES = ['en', 'fr', 'tr'] as const;
const LOCALE_COOKIE = 'site-locale';

function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

function getExpectedVapiSecret(): string | null {
  return process.env.VAPI_SERVER_URL_SECRET || process.env.VAPI_WEBHOOK_SECRET || null;
}

function isLocale(value: string | undefined): value is (typeof LOCALES)[number] {
  return Boolean(value && (LOCALES as readonly string[]).includes(value));
}

function splitLocale(pathname: string) {
  const segments = pathname.split('/');
  const locale = isLocale(segments[1]) ? segments[1] : null;
  const pathWithoutLocale = locale ? `/${segments.slice(2).join('/')}` : pathname;

  return {
    locale: locale || DEFAULT_LOCALE,
    pathWithoutLocale: pathWithoutLocale === '/' ? '/' : pathWithoutLocale.replace(/\/$/, '') || '/',
    hasLocale: Boolean(locale),
  };
}

function getPreferredLocale(request: NextRequest) {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  return isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE;
}

function redirectToLocale(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const { hasLocale } = splitLocale(pathname);
  if (hasLocale) return null;

  const locale = getPreferredLocale(request);
  const nextUrl = request.nextUrl.clone();
  nextUrl.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(nextUrl);
}

function guardAdmin(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  const { locale, pathWithoutLocale } = splitLocale(pathname);
  if (!pathWithoutLocale.startsWith('/admin')) return null;

  const hasSession = Boolean(request.cookies.get(ADMIN_COOKIE_NAME)?.value);

  if (pathWithoutLocale.startsWith('/admin/login')) {
    if (hasSession) {
      return NextResponse.redirect(new URL(`/${locale}/admin/dashboard`, request.url));
    }
    return null;
  }

  if (!hasSession) {
    return NextResponse.redirect(new URL(`/${locale}/admin/login`, request.url));
  }

  return null;
}

function withCors(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-vapi-secret, x-vapi-server-secret');
  return response;
}

function guardVapi(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith('/api/vapi/')) return null;

  if (request.method === 'OPTIONS') {
    return withCors(new NextResponse(null, { status: 204 }));
  }

  if (pathname === '/api/vapi/webhook') {
    return null;
  }

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

export function proxy(request: NextRequest) {
  const isVapiRequest = request.nextUrl.pathname.startsWith('/api/vapi/');
  const vapiResponse = guardVapi(request);
  if (vapiResponse) return vapiResponse;
  if (isVapiRequest) return NextResponse.next();

  const localeResponse = redirectToLocale(request);
  if (localeResponse) return localeResponse;

  const adminResponse = guardAdmin(request);
  if (adminResponse) return adminResponse;

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\..*).*)',
    '/api/vapi/:path*',
  ],
};
