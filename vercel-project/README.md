# Stripe → Telegram Alert

A tiny Vercel serverless function that forwards Stripe `checkout.session.completed` events to a Telegram chat.

## Deploy

1. Create a new project on Vercel (https://vercel.com/new)
2. Drag & drop the `vercel-project` folder (or import the Git repo)
3. In Vercel Dashboard → Project Settings → Environment Variables, add:
   - `TELEGRAM_BOT_TOKEN` = your bot token
   - `TELEGRAM_CHAT_ID` = your chat ID (e.g., 7175251168)
   - (Optional) `STRIPE_WEBHOOK_SECRET` = Stripe webhook signing secret for verification
4. Deploy
5. Copy the deployment URL, e.g. `https://your-project.vercel.app`
6. In Stripe Dashboard → Developers → Webhooks, add endpoint:
   - URL: `https://your-project.vercel.app/api/stripe`
   - Select event: `checkout.session.completed`
   - Copy the signing secret into Vercel env if you added it

That’s it. You’ll receive a Telegram message on every purchase.
