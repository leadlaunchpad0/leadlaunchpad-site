import { google } from 'googleapis';
import { Resend } from 'resend';
import fs from 'fs';

const SHEET_SCOPES = ['https://sheets.googleapis.com/auth/spreadsheets'];

// Map country -> sheet tabs
const TABS = {
  AU: { final: 'AUS Final', sold: 'AUS Sold' },
  USA: { final: 'USA Final', sold: 'USA Sold' },
  AUS: { final: 'AUS Final', sold: 'AUS Sold' } // alias
};

function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Missing Google OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN)');
  }
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

export async function fulfillOrder(country, quantity, buyerEmail) {
  const tabs = TABS[country.toUpperCase()];
  if (!tabs) throw new Error(`Unsupported country: ${country}`);

  const sheets = google.sheets({ version: 'v4', auth: getOAuth2Client() });
  const spreadsheetId = process.env.SHEET_ID || '1bhCK2agMfm_L8LUGmC1xUJRtEARUbtpxYAKHQYBoVg8';

  // 1. Read Final tab
  const finalRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabs.final}'`,
  });
  const rows = finalRes.data.values || [];
  if (rows.length === 0) throw new Error(`Final tab ${tabs.final} is empty`);

  const headers = rows[0];
  const dataRows = rows.slice(1);

  if (dataRows.length < quantity) {
    throw new Error(`Not enough leads in ${tabs.final}. Requested ${quantity}, available ${dataRows.length}`);
  }

  // Select first quantity leads
  const selected = dataRows.slice(0, quantity);
  const remaining = dataRows.slice(quantity);

  // 2. Rewrite Final tab with remaining rows (keep header)
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${tabs.final}'!A1`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [headers, ...remaining],
    },
  });

  // 3. Ensure Sold tab exists with headers if empty
  const soldCheck = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${tabs.sold}'`,
  });
  if ((soldCheck.data.values || []).length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `'${tabs.sold}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });
  }

  // 4. Append selected rows to Sold tab
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `'${tabs.sold}'`,
    valueInputOption: 'RAW',
    requestBody: { values: selected },
  });

  // 5. Generate CSV (include headers)
  const csvRows = [headers, ...selected];
  const csv = csvRows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  // 6. Email CSV using Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const filename = `${country}-${new Date().toISOString().slice(0,10)}-${Date.now()}.csv`;
  await resend.emails.send({
    from: 'Lead Launchpad <sales@leadlaunchpad.io>',
    to: buyerEmail,
    subject: `Your ${country} leads (${quantity}) – Lead Launchpad`,
    html: `
      <p>Hi,</p>
      <p>Attached is your ${quantity} ${country} leads in CSV format.</p>
      <p>Thank you for your purchase!</p>
      <p>— Lead Launchpad</p>
    `,
    attachments: [
      {
        filename,
        content: csv,
      },
    ],
  });

  // Return info (optional)
  return { quantity, country, buyerEmail, csvPath: null };
}
