import Stripe from 'stripe';
import { fulfillOrder } from './lib/fulfillment.js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return res.status(400).json({ error: `Webhook Error: ${e.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { country, quantity } = session.metadata;
    const buyerEmail = session.customer_details?.email || session.customer_email || 'unknown@example.com';

    try {
      await fulfillOrder(country, parseInt(quantity, 10), buyerEmail);
      const msg = `🤑 Sale complete!\nCountry: ${country}\nQuantity: ${quantity}\nBuyer: ${buyerEmail}`;
      await sendTelegram(msg);
    } catch (err) {
      console.error('Fulfillment failed', err);
      await sendTelegram(`❌ Fulfillment failed for order: ${err.message}\nCountry: ${country}\nQuantity: ${quantity}\nBuyer: ${buyerEmail}`);
    }
  }

  res.json({ received: true });
}

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text })
    });
  } catch (e) {
    console.error('Telegram send failed:', e.message);
  }
}
