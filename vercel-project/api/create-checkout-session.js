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

  const { country, quantity } = req.body;
  if (!country || !quantity) return res.status(400).json({ error: 'Missing country or quantity' });

  const qty = parseInt(quantity, 10);
  const allowed = [500, 1000, 5000, 20000];
  if (!allowed.includes(qty)) return res.status(400).json({ error: 'Invalid quantity' });

  const upper = country.toUpperCase();
  if (!['USA', 'AU', 'AUS'].includes(upper)) return res.status(400).json({ error: 'Invalid country' });
  const priceCents = (PRICE_MAP[upper][qty] || 0) * 100; // dollars to cents

  try {
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
      success_url: `${req.headers.origin}/buy.html?success=1`,
      cancel_url: `${req.headers.origin}/buy.html?canceled=1`,
      metadata: { country: upper, quantity: String(qty) },
    });
    res.json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}