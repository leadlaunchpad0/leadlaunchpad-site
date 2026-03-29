import { readFile } from 'fs';
import { google } from 'googleapis';

const SHEET_ID = '1bhCK2agMfm_L8LUGmC1xUJRtEARUbtpxYAKHQYBoVg8';

function loadEnv() {
  const content = readFile('/data/.openclaw/workspace/skills/concrete-scraper/.env', 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    if (line.startsWith('#') || !line.trim()) continue;
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    env[key] = value;
  }
  return env;
}

function getOAuth2Client(env) {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing Google OAuth env vars');
  }
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

async function createSoldTabs() {
  const env = loadEnv();
  const auth = getOAuth2Client(env);
  const sheets = google.sheets({ version: 'v4', auth });

  // Get Final tabs headers
  const auFinalRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'AUS Final'`
  });
  const usaFinalRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'USA Final'`
  });

  const auHeaders = (auFinalRes.data.values && auFinalRes.data.values[0]) || [];
  const usaHeaders = (usaFinalRes.data.values && usaFinalRes.data.values[0]) || [];

  // Add sheets if they don't exist
  const addRequests = [];
  try {
    await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  } catch (e) { throw e; }

  // We'll try to add; ignore if exists
  addRequests.push({
    addSheet: {
      properties: {
        title: 'AUS Sold',
        gridProperties: { rowCount: 1000, columnCount: auHeaders.length || 10 }
      }
    }
  });
  addRequests.push({
    addSheet: {
      properties: {
        title: 'USA Sold',
        gridProperties: { rowCount: 1000, columnCount: usaHeaders.length || 10 }
      }
    }
  });

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: { requests: addRequests }
    });
  } catch (e) {
    if (!e.message.includes('already exists')) throw e;
  }

  // Write headers if empty
  if (auHeaders.length) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'AUS Sold'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [auHeaders] }
      });
    } catch (e) {
      // ignore if sheet exists with content
    }
  }
  if (usaHeaders.length) {
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `'USA Sold'!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [usaHeaders] }
      });
    } catch (e) {
      // ignore
    }
  }

  console.log('AUS Sold and USA Sold tabs created/updated.');
}

createSoldTabs().catch(console.error);
