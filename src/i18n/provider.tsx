'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Messages } from './dictionaries';
import type { Locale } from './config';
import enMessages from './messages/en.json';
import frMessages from './messages/fr.json';
import trMessages from './messages/tr.json';

type I18nContextValue = {
  locale: Locale;
  messages: Messages;
  t: (key: string, fallback?: string) => string;
  text: (value: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const clientMessages: Record<Locale, Messages> = {
  en: enMessages,
  fr: frMessages,
  tr: trMessages,
};
const textSources = new WeakMap<Text, string>();

function getNestedValue(source: unknown, key: string): string | null {
  const value = key
    .split('.')
    .reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object') return null;
      return (current as Record<string, unknown>)[part];
    }, source);

  return typeof value === 'string' ? value : null;
}

function replacePreservingWhitespace(value: string, replacement: string) {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  if (!match) return replacement;
  return `${match[1]}${replacement}${match[3]}`;
}

function translateDom(root: ParentNode, messages: Messages) {
  const textMap = (messages.text || {}) as Record<string, string>;
  const ignoredTags = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

  const translateElementAttributes = (element: Element) => {
    for (const attr of ['placeholder', 'title', 'aria-label']) {
      const value = element.getAttribute(attr);
      if (!value) continue;

      const sourceDataAttr = `data-i18n-source-${attr}`;
      const source = element.getAttribute(sourceDataAttr) || value;
      if (!element.hasAttribute(sourceDataAttr)) element.setAttribute(sourceDataAttr, source);

      const translated = textMap[source] || source;
      if (value !== translated) element.setAttribute(attr, translated);
    }
  };

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let current = walker.nextNode();

  while (current) {
    if (current.nodeType === Node.ELEMENT_NODE) {
      const element = current as Element;
      if (ignoredTags.has(element.tagName)) {
        current = walker.nextSibling();
        continue;
      }
      translateElementAttributes(element);
    } else if (current.nodeType === Node.TEXT_NODE) {
      const raw = current.nodeValue || '';
      const trimmed = raw.trim();
      if (!trimmed) {
        current = walker.nextNode();
        continue;
      }

      const source = textSources.get(current as Text) || trimmed;
      textSources.set(current as Text, source);
      const translated = textMap[source] || source;
      const nextValue = replacePreservingWhitespace(raw, translated);
      if (raw !== nextValue) current.nodeValue = nextValue;
    }

    current = walker.nextNode();
  }
}

function DomTranslator({ messages }: { messages: Messages }) {
  useEffect(() => {
    translateDom(document.body, messages);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
              translateDom(node.parentNode || document.body, messages);
            }
          });
        }

        if (mutation.type === 'characterData' && mutation.target.parentNode) {
          translateDom(mutation.target.parentNode, messages);
        }

        if (mutation.type === 'attributes' && mutation.target.parentNode) {
          translateDom(mutation.target.parentNode, messages);
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['placeholder', 'title', 'aria-label'],
      characterData: true,
      childList: true,
      subtree: true,
    });

    return () => observer.disconnect();
  }, [messages]);

  return null;
}

export function I18nProvider({
  children,
  locale,
  messages,
}: {
  children: ReactNode;
  locale: Locale;
  messages: Messages;
}) {
  const [activeLocale, setActiveLocale] = useState(locale);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveLocale(locale);
  }, [locale]);

  useEffect(() => {
    const handleLocaleChange = (event: Event) => {
      const nextLocale = (event as CustomEvent<Locale>).detail;
      if (nextLocale && clientMessages[nextLocale]) setActiveLocale(nextLocale);
    };

    window.addEventListener('site-locale-change', handleLocaleChange);
    return () => window.removeEventListener('site-locale-change', handleLocaleChange);
  }, []);

  const activeMessages = clientMessages[activeLocale] || messages;

  const t = useCallback(
    (key: string, fallback?: string) => getNestedValue(activeMessages, key) || fallback || key,
    [activeMessages],
  );

  const text = useCallback(
    (value: string) => ((activeMessages.text || {}) as Record<string, string>)[value] || value,
    [activeMessages],
  );

  const value = useMemo(
    () => ({ locale: activeLocale, messages: activeMessages, t, text }),
    [activeLocale, activeMessages, t, text],
  );

  return (
    <I18nContext.Provider value={value}>
      {children}
      <DomTranslator messages={activeMessages} />
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used within I18nProvider');
  return value;
}

export function useT() {
  return useI18n().t;
}
