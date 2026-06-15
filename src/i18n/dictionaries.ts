import 'server-only';

import { defaultLocale, isLocale, type Locale } from './config';

const dictionaries = {
  en: () => import('./messages/en.json').then((module) => module.default),
  fr: () => import('./messages/fr.json').then((module) => module.default),
  tr: () => import('./messages/tr.json').then((module) => module.default),
};

export type Messages = Awaited<ReturnType<(typeof dictionaries)[Locale]>>;

export async function getDictionary(locale: string): Promise<Messages> {
  const safeLocale = isLocale(locale) ? locale : defaultLocale;
  return dictionaries[safeLocale]();
}
