const TIMEZONE = 'Europe/Paris';

const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const WEEKDAYS_TR = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
];

const ONES_TR = [
  '',
  'bir',
  'iki',
  'üç',
  'dört',
  'beş',
  'altı',
  'yedi',
  'sekiz',
  'dokuz',
];

const TENS_TR = [
  '',
  'on',
  'yirmi',
  'otuz',
  'kırk',
  'elli',
  'altmış',
  'yetmiş',
  'seksen',
  'doksan',
];

export type CurrentDateInfo = {
  timezone: string;
  now_iso: string;
  today_iso: string;
  tomorrow_iso: string;
  today_spoken_tr: string;
  tomorrow_spoken_tr: string;
  weekday_tr: string;
  tomorrow_weekday_tr: string;
  tool_date_rule: string;
  spoken_date_rule_tr: string;
  relative_date_rule_tr: string;
};

function getParisParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || '';

  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  return {
    year,
    month,
    day,
    iso,
    weekday: WEEKDAYS_TR[new Date(`${iso}T12:00:00Z`).getUTCDay()],
  };
}

function numberToTurkishWords(value: number): string {
  if (value === 0) return 'sıfır';
  if (value < 10) return ONES_TR[value];
  if (value < 100) {
    const ten = Math.floor(value / 10);
    const one = value % 10;
    return [TENS_TR[ten], ONES_TR[one]].filter(Boolean).join(' ');
  }
  if (value < 1000) {
    const hundred = Math.floor(value / 100);
    const rest = value % 100;
    const hundredText = hundred === 1 ? 'yüz' : `${ONES_TR[hundred]} yüz`;
    return [hundredText, rest ? numberToTurkishWords(rest) : ''].filter(Boolean).join(' ');
  }

  const thousand = Math.floor(value / 1000);
  const rest = value % 1000;
  const thousandText = thousand === 1 ? 'bin' : `${numberToTurkishWords(thousand)} bin`;
  return [thousandText, rest ? numberToTurkishWords(rest) : ''].filter(Boolean).join(' ');
}

function addDaysInParis(date: Date, days: number) {
  const parts = getParisParts(date);
  const utcNoon = Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0);
  return new Date(utcNoon);
}

export function formatDateForTurkishSpeech(isoDate: string): string {
  const [yearText, monthText, dayText] = isoDate.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return `${numberToTurkishWords(day)} ${MONTHS_TR[month - 1]} ${numberToTurkishWords(year)}`;
}

export function getCurrentDateInfo(now = new Date()): CurrentDateInfo {
  const today = getParisParts(now);
  const tomorrow = getParisParts(addDaysInParis(now, 1));

  return {
    timezone: TIMEZONE,
    now_iso: now.toISOString(),
    today_iso: today.iso,
    tomorrow_iso: tomorrow.iso,
    today_spoken_tr: formatDateForTurkishSpeech(today.iso),
    tomorrow_spoken_tr: formatDateForTurkishSpeech(tomorrow.iso),
    weekday_tr: today.weekday,
    tomorrow_weekday_tr: tomorrow.weekday,
    tool_date_rule: 'Tool parametrelerinde tarihleri daima YYYY-MM-DD formatında gönder. Ay ortada, gün sonda olmalı.',
    spoken_date_rule_tr:
      'Telefonda tarihleri Türkçe kelimelerle oku. Rakam rakam okuma, İngilizce yıl okuma. Örnek: 2026-05-11 için "on bir Mayıs iki bin yirmi altı" de.',
    relative_date_rule_tr:
      'Müşteri bugün, bu akşam veya tonight derse today_iso kullan. Yarın, tomorrow veya demain derse tomorrow_iso kullan. Güncel tarihi asla hafızadan tahmin etme.',
  };
}

