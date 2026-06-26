/**
 * Phase 45B — Controlled Vapi menu tool URL cutover.
 *
 * ONLY updates get_menu_info and get_item_details server URLs to the new backend.
 * All other tools, assistant model/voice/prompt/phone/transcriber are untouched.
 *
 * Usage: node scripts/phase45b-menu-url-cutover.js
 */
const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;
if (!VAPI_TOKEN) {
  console.error('STOP: VAPI_TOKEN not found in .env.local');
  process.exit(1);
}

const ASSISTANT_ID = '66793fd8-4e5f-4804-b1ea-d4f3231f2d98';
const NEW_BASE = 'https://api.voice.autoviseo.com/api/webhooks/vapi/dev_vapi_golden_meat';

const TARGET_TOOLS = {
  get_menu_info: `${NEW_BASE}/get-menu-info`,
  get_item_details: `${NEW_BASE}/get-item-details`,
};

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.vapi.ai',
      port: 443,
      path,
      method,
      headers: {
        'Authorization': `Bearer ${VAPI_TOKEN}`,
        'Content-Type': 'application/json',
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data ? JSON.parse(data) : {});
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  console.log('=== Phase 45B: Menu tool URL cutover ===\n');

  // 1. Fetch all tools
  console.log('Step 1: Fetching all tools from Vapi...');
  const allTools = await request('GET', '/tool');

  // 2. Identify only the two menu tools
  const menuTools = allTools.filter(t => {
    const name = t.function?.name || t.name || '';
    return name === 'get_menu_info' || name === 'get_item_details';
  });

  if (menuTools.length === 0) {
    console.error('STOP: Neither get_menu_info nor get_item_details found in Vapi tool library.');
    process.exit(1);
  }

  console.log(`Found ${menuTools.length} menu tool(s):\n`);
  menuTools.forEach(t => {
    const name = t.function?.name || t.name;
    console.log(`  ${name} (ID: ${t.id})`);
    console.log(`    Current URL: ${t.server?.url || 'NONE'}`);
    console.log(`    New URL:     ${TARGET_TOOLS[name]}`);
  });

  // 3. Save rollback note
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const rollbackPath = path.join(
    process.env.HOME || process.env.USERPROFILE || 'C:/root',
    'sesli-agent-phase45b',
    `vapi-menu-cutover-${ts}.txt`
  );
  fs.mkdirSync(path.dirname(rollbackPath), { recursive: true });

  const rollbackLines = [
    `Phase 45B — Vapi menu tool URL cutover`,
    `Timestamp: ${new Date().toISOString()}`,
    `Assistant ID: ${ASSISTANT_ID}`,
    ``,
    `TOOLS CHANGED:`,
    ...menuTools.map(t => {
      const name = t.function?.name || t.name;
      return [
        `  Tool: ${name}`,
        `  Tool ID: ${t.id}`,
        `  Old URL: ${t.server?.url || 'NONE'}`,
        `  New URL: ${TARGET_TOOLS[name]}`,
        ``,
      ].join('\n');
    }),
    `METHOD: Vapi API PATCH /tool/<id>`,
    `ROLLBACK: PATCH /tool/<id> with server.url = Old URL above`,
  ];
  fs.writeFileSync(rollbackPath, rollbackLines.join('\n'), 'utf8');
  console.log(`\nRollback note saved: ${rollbackPath}`);

  // 4. Update only the two menu tools
  console.log('\nStep 2: Updating tool URLs...');
  for (const tool of menuTools) {
    const name = tool.function?.name || tool.name;
    const newUrl = TARGET_TOOLS[name];
    if (!newUrl) {
      console.log(`  SKIP: ${name} — not a target tool`);
      continue;
    }

    console.log(`  Patching ${name} (${tool.id})...`);
    await request('PATCH', `/tool/${tool.id}`, {
      server: {
        url: newUrl,
        ...(tool.server?.headers ? { headers: tool.server.headers } : {}),
      },
    });
    console.log(`  Done.`);
  }

  // 5. Re-read and verify
  console.log('\nStep 3: Verifying updated tool URLs...');
  let allOk = true;
  for (const tool of menuTools) {
    const name = tool.function?.name || tool.name;
    const updated = await request('GET', `/tool/${tool.id}`);
    const actualUrl = updated.server?.url || 'NONE';
    const expected = TARGET_TOOLS[name];
    const ok = actualUrl === expected;
    console.log(`  ${ok ? 'OK' : 'FAIL'} ${name}`);
    console.log(`    URL: ${actualUrl}`);
    if (!ok) {
      console.error(`    Expected: ${expected}`);
      allOk = false;
    }
  }

  if (allOk) {
    // Append verification result to rollback note
    fs.appendFileSync(rollbackPath, `\nVERIFICATION: PASSED at ${new Date().toISOString()}\n`, 'utf8');
    console.log('\n=== Phase 45B COMPLETE: Both menu tool URLs updated and verified ===');
  } else {
    fs.appendFileSync(rollbackPath, `\nVERIFICATION: FAILED at ${new Date().toISOString()}\n`, 'utf8');
    console.error('\nFAIL: One or more URLs did not update correctly. Check rollback note.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
