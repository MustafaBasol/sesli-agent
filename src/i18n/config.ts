export const locales = ['en', 'fr', 'tr'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeLabels: Record<Locale, string> = {
  en: 'EN',
  fr: 'FR',
  tr: 'TR',
};

export function isLocale(value: string | undefined): value is Locale {
  return Boolean(value && (locales as readonly string[]).includes(value));
}

export function getLocaleFromPathname(pathname: string): Locale | null {
  const segment = pathname.split('/')[1];
  return isLocale(segment) ? segment : null;
}

export function stripLocaleFromPathname(pathname: string): string {
  const locale = getLocaleFromPathname(pathname);
  if (!locale) return pathname || '/';

  const stripped = pathname.slice(locale.length + 1);
  return stripped || '/';
}

export function withLocale(locale: Locale, pathname: string): string {
  const cleanPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return cleanPath === '/' ? `/${locale}` : `/${locale}${cleanPath}`;
}
