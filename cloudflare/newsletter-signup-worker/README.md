# Newsletter signup worker

Accepts footer subscribe posts, checks Cloudflare Turnstile, then emails the shop owner via Resend. This is a **separate Worker** from PayPal so signup spam cannot consume the payment Worker’s request quota.

Until you add your own domain in Resend, mail is sent from `onboarding@resend.dev` to `NOTIFY_TO`. Sign up for Resend with that same Gmail address.

## Endpoints

- `POST /api/newsletter` — JSON `{ name, email, website, turnstileToken }`

`website` is a honeypot. If it is filled, the Worker returns success and does not send mail.
