import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' });

// Fixed package pricing (USD)
const PRICE_MAP = {
  USA: {500: 99, 1000: 179, 5000: 349, 20000: 699},
  AU: {500: 99, 1000: 179, 5000: 349, 20000: 699}
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { country, quantity } = req.body;
    if (!country || !quantity) return res.status(400).json({ error: 'Missing country or quantity' });

    const qty = parseInt(quantity, 10);
    const allowed = [500, 1000, 5000, 20000];
    if (!allowed.includes(qty)) return res.status(400).json({ error: 'Invalid quantity' });

    const upper = country.toUpperCase();
    if (!['USA', 'AU', 'AUS'].includes(upper)) return res.status(400).json({ error: 'Invalid country' });
    const priceCents = (PRICE_MAP[upper][qty] || 0) * 100;

    const siteUrl = process.env.SITE_URL || req.headers.origin;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `${upper} Leads (${qty})` },
            unit_amount: priceCents,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${siteUrl}/buy.html?success=1`,
      cancel_url: `${siteUrl}/buy.html?canceled=1`,
      metadata: { country: upper, quantity: String(qty) },
    });
    res.json({ url: session.url });
  } catch (e) {
    console.error('Create checkout error:', e);
    res.status(500).json({ error: e.message });
  }
}
