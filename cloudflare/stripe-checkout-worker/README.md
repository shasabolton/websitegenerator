# Stripe checkout worker

Creates Stripe Checkout sessions for the cart page and emails the shop owner when an order is paid.

- **Prices are recalculated here** from the live `productData.json`, `shippingRates.json` and `discountCodes.json` on `SITE_ORIGIN`, so the browser cannot change the total.
- **Ship-to check**: Stripe only lets the buyer enter a shipping address in the countries that match the cart's "Ship to" choice (Australia / New Zealand / Germany / other EU members / United Kingdom / everything else). Pickup has no postage and does not collect a shipping address.
- **Email**: the cart email is pre-filled and locked on the Stripe page; phone number is collected.
- **Order email** (via Resend): order reference, customer name/email/phone, shipping address, ship-to selection + country check, items with SKU and options, discount, postage, Germany import charges when that destination is selected, total, payment method and a link to the payment in Stripe.
- Payment methods come from the Stripe Dashboard (Settings → Payment methods): cards, Apple Pay, Google Pay, Link, Afterpay, Zip etc. No code change needed to turn them on or off.

## Setup

1. Create a Stripe account and get your secret key (Developers → API keys). Use the `sk_test_...` key first.
2. From this folder:
   ```bash
   npx wrangler login
   npx wrangler secret put STRIPE_SECRET_KEY
   npx wrangler secret put RESEND_API_KEY
   npx wrangler deploy
   ```
   The worker URL will be `https://contraptioncart-checkout.contraptioncart.workers.dev`.
3. In Stripe → Developers → Webhooks → Add endpoint:
   - URL: `https://contraptioncart-checkout.contraptioncart.workers.dev/api/checkout/webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
   - Copy the signing secret, then `npx wrangler secret put STRIPE_WEBHOOK_SECRET`
4. In Stripe → Settings → Payment methods, turn on Apple Pay, Google Pay and any others you want. For Apple Pay, Stripe hosts the checkout page so no domain verification is needed.
5. Make sure `checkout.apiBase` in `shared-assets/config/shopData.json` points at `/api/checkout` on this worker, then republish the site.
6. Test with card `4242 4242 4242 4242`, then repeat steps 2–3 with live keys (live mode has its own webhook and signing secret).

## Endpoints

- `POST /api/checkout/session` — `{ items: [{ sku, lineId, quantity }], shipTo, email, discountCode }` → `{ url }`
- `GET /api/checkout/session?id=cs_...` — status/total for the cart success message (no personal data)
- `POST /api/checkout/webhook` — Stripe webhook (signature verified)
