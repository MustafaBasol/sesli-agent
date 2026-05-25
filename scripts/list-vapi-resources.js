/**
 * Script to list existing Vapi resources safely (Assistants, Tools, Phone Numbers).
 * Usage: node scripts/list-vapi-resources.js
 */
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const VAPI_TOKEN = process.env.VAPI_TOKEN;

if (!VAPI_TOKEN) {
  console.error('Error: VAPI_TOKEN is not set in .env file');
  process.exit(1);
}

const options = {
  hostname: 'api.vapi.ai',
  port: 443,
  headers: {
    'Authorization': `Bearer ${VAPI_TOKEN}`,
    'Content-Type': 'application/json'
  }
};

function fetchResource(path) {
  return new Promise((resolve, reject) => {
    https.get({ ...options, path }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Failed to fetch ${path}: ${res.statusCode} ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function listResources() {
  console.log('--- Fetching Vapi Resources ---\n');
  
  try {
    const assistants = await fetchResource('/assistant');
    console.log(`[Assistants] Count: ${assistants.length}`);
    assistants.forEach(a => console.log(`- ${a.name || 'Unnamed'} (ID: ${a.id})`));

    const tools = await fetchResource('/tool');
    console.log(`\n[Tools] Count: ${tools.length}`);
    tools.forEach(t => console.log(`- ${t.name || 'Unnamed'} (ID: ${t.id})`));

    const phoneNumbers = await fetchResource('/phone-number');
    console.log(`\n[Phone Numbers] Count: ${phoneNumbers.length}`);
    phoneNumbers.forEach(p => console.log(`- ${p.number} (ID: ${p.id})`));

  } catch (error) {
    console.error('Error fetching resources:', error.message);
  }
}

listResources();
