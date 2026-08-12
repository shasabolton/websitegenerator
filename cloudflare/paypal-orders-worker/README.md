# PayPal orders worker (Apple Pay / Google Pay)

GitHub Pages cannot hold your PayPal **client secret**. Apple Pay and Google Pay (Option B) need this tiny API to create and capture orders. The existing PayPal Smart Buttons keep working without it.

## Setup

1. Install Wrangler and log in: `npx wrangler login`
2. From this folder:
   ```bash
   npx wrangler secret put PAYPAL_CLIENT_ID
   npx wrangler secret put PAYPAL_CLIENT_SECRET
   npx wrangler deploy
   ```
3. In Cloudflare, put `www.contraptioncart.com` behind Cloudflare (orange cloud) and add a Worker route:
   - Route: `www.contraptioncart.com/api/paypal/*`
   - Worker: `contraptioncart-paypal-orders`
4. Leave `paypal.ordersApiBase` empty in shop data to use same-origin `/api/paypal`, or set a full base URL if the worker is on another host.

## Endpoints

- `POST /api/paypal/orders` — body is a PayPal Orders v2 create payload
- `POST /api/paypal/orders/:id/capture` — capture an approved order
