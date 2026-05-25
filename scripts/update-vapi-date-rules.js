const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || 'http://localhost:3000';

const headers = {
  Authorization: `Bearer ${VAPI_TOKEN}`,
  'Content-Type': 'application/json',
};

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { hostname: 'api.vapi.ai', port: 443, path, method, headers },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 400) {
            reject(new Error(`${method} ${path} failed (${res.statusCode}): ${data}`));
            return;
          }
          resolve(parsed);
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

const dateToolPayload = {
  type: 'function',
  function: {
    name: 'get_current_date',
    description:
      'MANDATORY at the start of every call and before interpreting relative dates like today, tonight, tomorrow, bugun, bu aksam, yarin, ce soir, or demain. Returns the current Europe/Paris date in ISO format for tools and natural Turkish spoken text for the caller.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  server: {
    url: `${PUBLIC_APP_URL}/api/vapi/get-current-date`,
  },
};

const DATE_BLOCK_START = '# CURRENT DATE AND SPOKEN DATE RULES - MANDATORY';
const DATE_BLOCK_END = '# END CURRENT DATE AND SPOKEN DATE RULES';
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
const WEEKDAYS_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const ONES_TR = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS_TR = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, iso, weekday: WEEKDAYS_TR[new Date(`${iso}T12:00:00Z`).getUTCDay()] };
}

function addDays(date, days) {
  const parts = parisParts(date);
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
}

function numberToTr(value) {
  if (value === 0) return 'sıfır';
  if (value < 10) return ONES_TR[value];
  if (value < 100) return [TENS_TR[Math.floor(value / 10)], ONES_TR[value % 10]].filter(Boolean).join(' ');
  if (value < 1000) {
    const hundred = Math.floor(value / 100);
    const rest = value % 100;
    return [hundred === 1 ? 'yüz' : `${ONES_TR[hundred]} yüz`, rest ? numberToTr(rest) : ''].filter(Boolean).join(' ');
  }
  const thousand = Math.floor(value / 1000);
  const rest = value % 1000;
  return [thousand === 1 ? 'bin' : `${numberToTr(thousand)} bin`, rest ? numberToTr(rest) : ''].filter(Boolean).join(' ');
}

function spokenDate(parts) {
  return `${numberToTr(parts.day)} ${MONTHS_TR[parts.month - 1]} ${numberToTr(parts.year)}`;
}

function buildDateRulesBlock() {
  const today = parisParts();
  const tomorrow = parisParts(addDays(new Date(), 1));

  return `${DATE_BLOCK_START}
- ACTUAL_CURRENT_DATE_ISO: ${today.iso}
- ACTUAL_CURRENT_DATE_SPOKEN_TR: ${spokenDate(today)}
- ACTUAL_CURRENT_WEEKDAY_TR: ${today.weekday}
- ACTUAL_TOMORROW_DATE_ISO: ${tomorrow.iso}
- ACTUAL_TOMORROW_DATE_SPOKEN_TR: ${spokenDate(tomorrow)}
- ACTUAL_TOMORROW_WEEKDAY_TR: ${tomorrow.weekday}
- At the very beginning of every call, call get_current_date.
- Before any reservation or availability check involving "bugün", "bu akşam", "yarın", "today", "tonight", "tomorrow", "ce soir", or "demain", you MUST call get_current_date and use the tool result.
- The ACTUAL_* lines above are only a backup if get_current_date fails. They are injected by the app server when this assistant version is published.
- The current Europe/Paris date is available directly in this prompt through Vapi dynamic variables:
  - current_date_iso: {{"now" | date: "%Y-%m-%d", "Europe/Paris"}}
  - current_year: {{"now" | date: "%Y", "Europe/Paris"}}
  - current_month_number: {{"now" | date: "%m", "Europe/Paris"}}
  - current_day_number: {{"now" | date: "%d", "Europe/Paris"}}
  - current_weekday: {{"now" | date: "%A", "Europe/Paris"}}
- Never tell the caller that you cannot access date information. If get_current_date is unavailable, use ACTUAL_CURRENT_DATE_ISO and ACTUAL_TOMORROW_DATE_ISO from this prompt.
- When get_current_date returns successfully, use today_iso for "bugün", "bu akşam", "today", and "tonight".
- When get_current_date returns successfully, use tomorrow_iso for "yarın", "tomorrow", and "demain".
- For every date sent to tools, use only YYYY-MM-DD. The order is year-month-day. Never send DD-MM-YYYY or YYYY-DD-MM.
- When speaking Turkish dates to the caller, use the *_spoken_tr values returned by get_current_date or speak the date naturally as Turkish words.
- Never read dates digit by digit. Never say "bir bir sıfır beş", "zero five", or English year words like "two thousand twenty six" while speaking Turkish.
- Example spoken Turkish: 2026-05-11 must be said as "on bir Mayıs iki bin yirmi altı".
- Do not guess today's date from memory or model knowledge. The ACTUAL_* lines in this prompt are the primary source of truth; get_current_date and dynamic variables are secondary fallbacks.
${DATE_BLOCK_END}`;
}

function upsertBlock(content, block) {
  const pattern = new RegExp(`${DATE_BLOCK_START}[\\s\\S]*?${DATE_BLOCK_END}\\n*`, 'm');
  const cleaned = content.replace(pattern, '').trimStart();
  return `${block}\n\n${cleaned}`;
}

async function ensureDateTool() {
  const tools = await request('GET', '/tool');
  const existing = tools.find(
    (tool) => tool.function?.name === 'get_current_date' || tool.name === 'get_current_date'
  );

  if (existing) {
    const { type, ...patchPayload } = dateToolPayload;
    await request('PATCH', `/tool/${existing.id}`, patchPayload);
    return existing.id;
  }

  const created = await request('POST', '/tool', dateToolPayload);
  return created.id;
}

async function main() {
  if (!VAPI_TOKEN) throw new Error('VAPI_TOKEN is missing in .env.local');

  const dateToolId = await ensureDateTool();
  const assistant = await request('GET', `/assistant/${ASSISTANT_ID}`);
  const model = assistant.model || {};
  const messages = Array.isArray(model.messages) ? [...model.messages] : [];
  const systemIndex = messages.findIndex((message) => message.role === 'system');

  if (systemIndex >= 0) {
    messages[systemIndex] = {
      ...messages[systemIndex],
      content: upsertBlock(messages[systemIndex].content || '', buildDateRulesBlock()),
    };
  } else {
    messages.unshift({ role: 'system', content: buildDateRulesBlock() });
  }

  const toolIds = Array.from(new Set([...(model.toolIds || []), dateToolId]));

  await request('PATCH', `/assistant/${ASSISTANT_ID}`, {
    model: {
      ...model,
      messages,
      toolIds,
    },
  });

  const verified = await request('GET', `/assistant/${ASSISTANT_ID}`);
  console.log('Date tool ID:', dateToolId);
  console.log('Tool attached:', verified.model?.toolIds?.includes(dateToolId));
  console.log('Prompt has date rules:', verified.model?.messages?.some((m) => m.content?.includes(DATE_BLOCK_START)));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
