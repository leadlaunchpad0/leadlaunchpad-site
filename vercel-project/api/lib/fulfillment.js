import { google } from 'googleapis';
import { Resend } from 'resend';

const SHEET_ID = process.env.SHEET_ID || '1bhCK2agMfm_L8LUGmC1xUJRtEARUbtpxYAKHQYBoVg8';

function getOAuth2Client() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) {
    throw new Error('Missing Google OAuth env vars');
  }
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN });
  return oauth2Client;
}

const TAB_MAP = {
  USA: { final: 'USA Final', sold: 'USA Sold' },
  AU: { final: 'AUS Final', sold: 'AUS Sold' },
  AUS: { final: 'AUS Final', sold: 'AUS Sold' }
};

export async function fulfillOrder(country, quantity, buyerEmail) {
  const upper = country.toUpperCase();
  const tabs = TAB_MAP[upper];
  if (!tabs) throw new Error(`Unsupported country: ${country}`);

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  // 1. Read Final tab
  const finalRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tabs.final}'`
  });
  const rows = finalRes.data.values || [];
  if (rows.length === 0) throw new Error(`Final tab ${tabs.final} is empty`);

  const headers = rows[0];
  const dataRows = rows.slice(1);
  if (dataRows.length < quantity) {
    throw new Error(`Not enough leads in ${tabs.final}: requested ${quantity}, available ${dataRows.length}`);
  }

  // 2. Select first `quantity` rows; remaining stay in Final
  const selected = dataRows.slice(0, quantity);
  const remaining = dataRows.slice(quantity);

  // Update Final tab with remaining rows (keep header)
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `'${tabs.final}'!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [headers, ...remaining] }
  });

  // 3. Ensure Sold tab has headers if empty
  const soldCheck = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `'${tabs.sold}'`
  });
  if ((soldCheck.data.values || []).length === 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: `'${tabs.sold}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] }
    });
  }

  // 4. Append selected rows to Sold tab
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `'${tabs.sold}'`,
    valueInputOption: 'RAW',
    requestBody: { values: selected }
  });

  // 5. Generate CSV in memory
  const csvRows = [headers, ...selected];
  const csv = csvRows.map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

  // 6. Email CSV via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const filename = `${upper}-${new Date().toISOString().slice(0,10)}-${Date.now()}.csv`;
  await resend.emails.send({
    from: 'Lead Launchpad <sales@leadlaunchpad.io>',
    to: buyerEmail,
    subject: `Your ${upper} leads (${quantity}) – Lead Launchpad`,
    html: `
      <p>Hi,</p>
      <p>Attached is your ${quantity} ${upper} leads in CSV format.</p>
      <p>Thank you for your purchase!</p>
      <p>— Lead Launchpad</p>
    `,
    attachments: [{ filename, content: csv }]
  });

  // 7. Send Telegram alert (best effort)
  try {
    const tgToken = process.env.TELEGRAM_BOT_TOKEN;
    const tgChatId = process.env.TELEGRAM_CHAT_ID;
    if (tgToken && tgChatId) {
      const msg = `🤑 Sale complete!\nCountry: ${upper}\nQuantity: ${quantity}\nBuyer: ${buyerEmail}`;
      await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: tgChatId, text: msg })
      });
    }
  } catch (e) {
    console.error('Telegram send failed:', e.message);
  }

  return { quantity, country: upper, buyerEmail };
}
