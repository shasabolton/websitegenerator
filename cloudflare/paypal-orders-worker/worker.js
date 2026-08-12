/**
 * Cloudflare Worker: PayPal Orders create + capture for Apple Pay / Google Pay.
 *
 * Bind secrets (wrangler secret put):
 *   PAYPAL_CLIENT_ID
 *   PAYPAL_CLIENT_SECRET
 * Optional var:
 *   PAYPAL_ENV = "live" | "sandbox" (default live)
 *
 * Routes (same path prefix):
 *   POST /api/paypal/orders          → create order (JSON body = PayPal Orders v2 create payload)
 *   POST /api/paypal/orders/:id/capture → capture order
 *
 * Deploy example:
 *   npx wrangler deploy
 * Then route /api/paypal/* on www.contraptioncart.com to this worker (Cloudflare proxy).
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function apiBase(env) {
  const mode = String(env.PAYPAL_ENV || "live").toLowerCase();
  return mode === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function getAccessToken(env) {
  const clientId = env.PAYPAL_CLIENT_ID;
  const secret = env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) {
    throw new Error("Missing PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET");
  }
  const auth = btoa(`${clientId}:${secret}`);
  const res = await fetch(`${apiBase(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error("PayPal token error");
    err.details = data;
    err.status = res.status;
    throw err;
  }
  return data.access_token;
}

async function paypalFetch(env, path, { method, body } = {}) {
  const token = await getAccessToken(env);
  const res = await fetch(`${apiBase(env)}${path}`, {
    method: method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function parsePath(pathname) {
  const p = pathname.replace(/\/+$/, "") || "/";
  const createMatch = p.match(/\/api\/paypal\/orders$/);
  if (createMatch) {
    return { action: "create" };
  }
  const captureMatch = p.match(/\/api\/paypal\/orders\/([^/]+)\/capture$/);
  if (captureMatch) {
    return { action: "capture", orderId: decodeURIComponent(captureMatch[1]) };
  }
  return { action: "unknown" };
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== "POST") {
      return jsonResponse(405, { error: "Method not allowed" });
    }

    const url = new URL(request.url);
    const route = parsePath(url.pathname);

    try {
      if (route.action === "create") {
        const payload = await request.json();
        const result = await paypalFetch(env, "/v2/checkout/orders", {
          method: "POST",
          body: payload,
        });
        return jsonResponse(result.status, result.data);
      }

      if (route.action === "capture") {
        const result = await paypalFetch(
          env,
          `/v2/checkout/orders/${encodeURIComponent(route.orderId)}/capture`,
          { method: "POST", body: {} },
        );
        return jsonResponse(result.status, result.data);
      }

      return jsonResponse(404, { error: "Not found" });
    } catch (err) {
      return jsonResponse(500, {
        error: err.message || "Server error",
        details: err.details || null,
      });
    }
  },
};
