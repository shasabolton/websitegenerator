/**
 * Newsletter signup: Turnstile + honeypot + rate limit, then email the shop owner.
 *
 * Secrets:
 *   npx wrangler secret put TURNSTILE_SECRET
 *   npx wrangler secret put RESEND_API_KEY
 *
 * Deploy:
 *   npx wrangler deploy
 */

const MAX_BODY_BYTES = 4096;
const MAX_NAME_CHARS = 100;
const RATE_WINDOW_SECONDS = 60;
const RATE_MAX_PER_WINDOW = 5;
const BURST_WINDOW_SECONDS = 10;
const BURST_MAX = 20;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clientIp(request) {
  return String(request.headers.get("CF-Connecting-IP") || "").trim() || "unknown";
}

function expectedHostnames(env) {
  return new Set(
    String(env.TURNSTILE_HOSTNAMES || "")
      .split(",")
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean),
  );
}

function isValidEmail(value) {
  if (typeof value !== "string") {
    return false;
  }
  const email = value.trim();
  if (email.length < 5 || email.length > 254) {
    return false;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function readPayload(request) {
  const contentType = String(request.headers.get("Content-Type") || "");
  if (contentType.includes("application/json")) {
    const data = await request.json();
    return data && typeof data === "object" ? data : {};
  }
  const form = await request.formData();
  return {
    name: form.get("name") || form.get("entry.268156310"),
    email: form.get("email") || form.get("entry.866413073"),
    website: form.get("website"),
    turnstileToken:
      form.get("turnstileToken") || form.get("cf-turnstile-response"),
  };
}

async function rateLimited(request, prefix, windowSeconds, maxHits) {
  const ip = clientIp(request);
  const cache = caches.default;
  const key = new Request(
    `https://newsletter-rate.invalid/${prefix}/${encodeURIComponent(ip)}`,
  );
  const hit = await cache.match(key);
  const count = hit ? Number(await hit.text()) || 0 : 0;
  if (count >= maxHits) {
    return true;
  }
  await cache.put(
    key,
    new Response(String(count + 1), {
      headers: { "Cache-Control": `max-age=${windowSeconds}` },
    }),
  );
  return false;
}

async function verifyTurnstile(env, token, ip) {
  const secret = env.TURNSTILE_SECRET;
  const expectedAction = String(env.TURNSTILE_ACTION || "newsletter");
  const hostnames = expectedHostnames(env);

  if (
    typeof token !== "string" ||
    token.length === 0 ||
    token.length > 2048 ||
    !secret ||
    hostnames.size === 0
  ) {
    return false;
  }

  let result;
  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        signal: AbortSignal.timeout(10_000),
        body: new URLSearchParams({
          secret,
          response: token,
          remoteip: ip,
        }),
      },
    );
    if (!response.ok) {
      return false;
    }
    result = await response.json();
  } catch {
    return false;
  }

  return Boolean(
    result?.success &&
      result.action === expectedAction &&
      hostnames.has(String(result.hostname || "").toLowerCase()),
  );
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/api/newsletter") {
      return jsonResponse(404, { error: "Not found" });
    }

    const lengthHeader = request.headers.get("Content-Length");
    if (lengthHeader && Number(lengthHeader) > MAX_BODY_BYTES) {
      return jsonResponse(413, { error: "Payload too large" });
    }

    if (await rateLimited(request, "burst", BURST_WINDOW_SECONDS, BURST_MAX)) {
      return jsonResponse(429, { error: "Too many requests" });
    }

    let payload;
    try {
      payload = await readPayload(request);
    } catch {
      return jsonResponse(400, { error: "Invalid body" });
    }

    const website = String(payload.website ?? "").trim();
    if (website) {
      return jsonResponse(200, { ok: true });
    }

    const name = String(payload.name ?? "").trim().slice(0, MAX_NAME_CHARS);
    const email = String(payload.email ?? "").trim();
    const token = payload.turnstileToken;

    if (!isValidEmail(email)) {
      return jsonResponse(400, { error: "A valid email is required" });
    }

    const ip = clientIp(request);
    const turnstileOk = await verifyTurnstile(env, token, ip);
    if (!turnstileOk) {
      return jsonResponse(403, { error: "Verification failed" });
    }

    if (await rateLimited(request, "ok", RATE_WINDOW_SECONDS, RATE_MAX_PER_WINDOW)) {
      return jsonResponse(429, { error: "Too many requests" });
    }

    const notifyTo = String(env.NOTIFY_TO || "").trim();
    const fromEmail = String(env.FROM_EMAIL || "").trim();
    const resendKey = env.RESEND_API_KEY;
    if (!notifyTo || !fromEmail || !resendKey) {
      return jsonResponse(500, { error: "Server misconfigured" });
    }

    const safeName = name || "(not given)";
    const subject = `Newsletter signup: ${safeName}`;
    const text = [
      "New newsletter signup",
      "",
      `Name: ${safeName}`,
      `Email: ${email}`,
    ].join("\n");
    const html = `<p>New newsletter signup</p>
<p><strong>Name:</strong> ${escapeHtml(safeName)}<br />
<strong>Email:</strong> ${escapeHtml(email)}</p>`;

    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10_000),
        body: JSON.stringify({
          from: fromEmail,
          to: [notifyTo],
          reply_to: email,
          subject,
          text,
          html,
        }),
      });
      if (!resendRes.ok) {
        console.error(
          JSON.stringify({
            event: "newsletter_email_failed",
            status: resendRes.status,
          }),
        );
        return jsonResponse(500, { error: "Could not send signup" });
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          event: "newsletter_email_failed",
          message: err?.message || "send failed",
        }),
      );
      return jsonResponse(500, { error: "Could not send signup" });
    }

    return jsonResponse(200, { ok: true });
  },
};
