export default async function handler(req, res) {
  // Echo back some env presence for debugging
  const env = {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY ? 'set' : 'missing',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? 'set' : 'missing',
    TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN ? 'set' : 'missing',
    RESEND_API_KEY: process.env.RESEND_API_KEY ? 'set' : 'missing',
  };
  res.status(200).json({ status: 'ok', env });
}
