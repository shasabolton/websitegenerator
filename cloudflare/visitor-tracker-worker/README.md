# Visitor tracker worker

Stores each visitor's journey (pages, time on page, clicks, video plays, add to cart) from
`shared-assets/script/siteTracker.js` in a D1 database, and serves it to the password-protected
viewer at `tools/analytics/`.

## Setup

From this folder:

```bash
npx wrangler d1 execute contraptioncart-tracker --remote --file=schema.sql
npx wrangler secret put DASHBOARD_PASSWORD
npx wrangler deploy
```

`DASHBOARD_PASSWORD` is the password you type into the analytics viewer. Use a new password,
not your Cloudflare login. Change it any time by running `secret put` again.

## Endpoints

- `POST /api/track` — one page visit (sent by the site when a visitor leaves a page)
- `GET /api/track/login` — checks the dashboard password (`Authorization: Bearer <password>`)
- `GET /api/track/visits?from=<ms>&to=<ms>` — sessions with their pages and events

## Limits

Shares the account's free daily Workers quota with the PayPal and newsletter workers. The site
sends one request when a visitor leaves a page (again if they switch tabs and come back, capped
at 10 per page), so normal traffic uses a tiny fraction of it. Data older
than 400 days is deleted daily by the cron trigger.

Protection against bots using up the quota:

- In the browser (`siteTracker.js`): at most 20 sends per minute and 300 per day per browser;
  pages left within 1 second with no actions are not sent; 15+ pages in a minute flags the visit
  as a possible bot; clicks pause for 10 seconds after 10 clicks (20 carousel clicks) in 10
  seconds; synthetic clicks and automated browsers (`navigator.webdriver`) are ignored.
- In the worker: requests without an allowed `Origin`, from bot user agents, or not in the
  expected format are dropped. Rate limits (`ratelimits` in `wrangler.jsonc`): 30 per minute per
  visitor, 120 per minute per IP, 600 per minute in total, 10 login attempts per minute per IP.
  Cloudflare applies these per location and approximately.

Requests that reach the worker still count towards the daily quota even when rejected. Blocking
them before they reach the worker needs the domain's DNS on Cloudflare (it is on GoDaddy).
