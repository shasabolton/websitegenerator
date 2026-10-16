/**
 * Visitor journey tracker: stores page visits + interactions in D1, serves them to the
 * password-protected viewer at tools/analytics/.
 *
 * Secret:
 *   npx wrangler secret put DASHBOARD_PASSWORD
 *
 * Deploy:
 *   npx wrangler d1 execute contraptioncart-tracker --remote --file=schema.sql
 *   npx wrangler deploy
 */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS_PER_PAGE = 300;
const MAX_RANGE_MS = 93 * 24 * 60 * 60 * 1000;
const MAX_SESSIONS_PER_QUERY = 3000;
const RETENTION_DAYS = 400;
const BOT_PATTERN = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|bingpreview|python|curl|wget/i;
const ID_PATTERN = /^[a-z0-9]{8,40}$/i;

const ipHits = new Map();
const failedLogins = new Map();

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...corsHeaders() },
  });
}

function emptyResponse(status = 204) {
  return new Response(null, { status, headers: corsHeaders() });
}

function clientIp(request) {
  return String(request.headers.get("CF-Connecting-IP") || "").trim() || "unknown";
}

/** Fallback for when the rate limit bindings aren't configured; each isolate keeps its own counts. */
function overLimit(map, key, windowMs, max) {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.start > windowMs) {
    map.set(key, { start: now, count: 1 });
    if (map.size > 5000) {
      map.clear();
    }
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

async function limited(binding, key) {
  if (!binding) {
    return false;
  }
  try {
    const { success } = await binding.limit({ key });
    return !success;
  } catch {
    return false;
  }
}

function str(value, max) {
  if (value == null) {
    return null;
  }
  const s = String(value).trim();
  return s ? s.slice(0, max) : null;
}

function int(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) {
    return min;
  }
  return Math.min(max, Math.max(min, n));
}

function allowedHostnames(env) {
  return new Set(
    String(env.TRACK_HOSTNAMES || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

function originAllowed(request, env) {
  // Browsers always send Origin on cross-site POSTs, so a missing one means a script, not the site.
  const origin = request.headers.get("Origin");
  if (!origin) {
    return false;
  }
  try {
    return allowedHostnames(env).has(new URL(origin).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function marketingParams(landingUrl) {
  const out = {};
  try {
    const params = new URL(landingUrl).searchParams;
    for (const key of [
      "gclid",
      "gbraid",
      "wbraid",
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "matchtype",
      "device",
      "network",
      "fbclid",
    ]) {
      const v = str(params.get(key), 300);
      if (v) {
        out[key] = v;
      }
    }
  } catch {}
  return out;
}

function sanitizeEvents(raw) {
  const list = Array.isArray(raw) ? raw.slice(0, MAX_EVENTS_PER_PAGE) : [];
  const out = [];
  for (const e of list) {
    if (!e || typeof e !== "object") {
      continue;
    }
    const type = str(e.type, 24);
    if (!type) {
      continue;
    }
    const event = { t: int(e.t, 0, 86_400_000), type };
    const label = str(e.label, 160);
    const detail = str(e.detail, 300);
    if (label) {
      event.label = label;
    }
    if (detail) {
      event.detail = detail;
    }
    out.push(event);
  }
  return out;
}

function sanitizeFlags(raw) {
  const allowed = new Set(["bot", "throttled"]);
  const flags = (Array.isArray(raw) ? raw : []).filter((f) => allowed.has(f));
  return flags.length ? [...new Set(flags)].join(",") : null;
}

async function handleCollect(request, env) {
  if (!originAllowed(request, env)) {
    return emptyResponse();
  }
  const ua = String(request.headers.get("User-Agent") || "");
  if (!ua || BOT_PATTERN.test(ua)) {
    return emptyResponse();
  }
  const ip = clientIp(request);
  if (env.IP_LIMITER ? await limited(env.IP_LIMITER, ip) : overLimit(ipHits, ip, 60_000, 120)) {
    return emptyResponse(429);
  }
  if (await limited(env.GLOBAL_LIMITER, "all")) {
    return emptyResponse(429);
  }
  const lengthHeader = Number(request.headers.get("Content-Length") || 0);
  if (lengthHeader > MAX_BODY_BYTES) {
    return emptyResponse(413);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return emptyResponse(413);
    }
    body = JSON.parse(text);
  } catch {
    return emptyResponse(400);
  }

  const session = body?.session;
  const page = body?.page;
  const visitorId = str(body?.visitorId, 40);
  if (
    body?.v !== 1 ||
    !session ||
    !page ||
    !visitorId ||
    !ID_PATTERN.test(visitorId) ||
    !ID_PATTERN.test(String(session.id || "")) ||
    !ID_PATTERN.test(String(page.id || ""))
  ) {
    return emptyResponse(400);
  }
  if (await limited(env.VISITOR_LIMITER, visitorId)) {
    return emptyResponse(429);
  }

  const now = Date.now();
  // Shift client timestamps onto server time so a wrong device clock doesn't misplace visits.
  const clockOffset = Number.isFinite(Number(body.sentAt)) ? now - Number(body.sentAt) : 0;
  const toServerTime = (t) => int(Number(t) + clockOffset, now - 2 * 86_400_000, now);

  const landingUrl = str(session.landingUrl, 1000);
  const params = marketingParams(landingUrl);
  const cf = request.cf || {};

  const insertSession = env.DB.prepare(
    `INSERT INTO sessions (id, visitor_id, started_at, country, region, city, referrer, landing_url, gclid, params, device, screen, language, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  ).bind(
    session.id,
    visitorId,
    toServerTime(session.startedAt),
    str(cf.country, 8),
    str(cf.region, 80),
    str(cf.city, 80),
    str(session.referrer, 500),
    landingUrl,
    params.gclid || null,
    Object.keys(params).length ? JSON.stringify(params) : null,
    str(session.device, 20),
    str(session.screen, 20),
    str(session.language, 20),
    str(ua, 300),
  );

  const upsertPage = env.DB.prepare(
    `INSERT INTO pages (id, session_id, visitor_id, url, title, started_at, active_ms, total_ms, scroll_pct, events, flags, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       active_ms = excluded.active_ms,
       total_ms = excluded.total_ms,
       scroll_pct = excluded.scroll_pct,
       events = excluded.events,
       flags = excluded.flags,
       updated_at = excluded.updated_at`,
  ).bind(
    page.id,
    session.id,
    visitorId,
    str(page.url, 1000) || "/",
    str(page.title, 200),
    toServerTime(page.startedAt),
    int(page.activeMs, 0, 86_400_000),
    int(page.totalMs, 0, 86_400_000),
    int(page.scrollPct, 0, 100),
    JSON.stringify(sanitizeEvents(page.events)),
    sanitizeFlags(page.flags),
    now,
  );

  await env.DB.batch([insertSession, upsertPage]);
  return emptyResponse();
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return new Uint8Array(digest);
}

async function passwordMatches(given, expected) {
  if (!expected || !given) {
    return false;
  }
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

async function authorized(request, env) {
  const ip = clientIp(request);
  if (overLimit(failedLogins, ip, 10 * 60_000, 10) || (await limited(env.LOGIN_LIMITER, ip))) {
    return false;
  }
  const header = String(request.headers.get("Authorization") || "");
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const ok = await passwordMatches(given, env.DASHBOARD_PASSWORD);
  if (ok) {
    failedLogins.delete(ip);
  }
  return ok;
}

function parseJsonColumn(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

async function handleVisits(request, env) {
  if (!(await authorized(request, env))) {
    return jsonResponse(401, { error: "Wrong password" });
  }
  const url = new URL(request.url);
  const now = Date.now();
  const to = int(url.searchParams.get("to") || now, 0, now + 86_400_000);
  const from = int(url.searchParams.get("from") || to - 7 * 86_400_000, to - MAX_RANGE_MS, to);

  const sessionsResult = await env.DB.prepare(
    `SELECT * FROM sessions WHERE started_at BETWEEN ? AND ? ORDER BY started_at DESC LIMIT ?`,
  )
    .bind(from, to, MAX_SESSIONS_PER_QUERY)
    .all();
  const sessions = sessionsResult.results || [];

  const pagesResult = await env.DB.prepare(
    `SELECT p.id, p.session_id, p.url, p.title, p.started_at, p.active_ms, p.total_ms, p.scroll_pct, p.events, p.flags
     FROM pages p JOIN sessions s ON s.id = p.session_id
     WHERE s.started_at BETWEEN ? AND ?
     ORDER BY p.started_at ASC`,
  )
    .bind(from, to)
    .all();

  const visitorIds = [...new Set(sessions.map((s) => s.visitor_id))];
  const priorCounts = {};
  if (visitorIds.length) {
    const placeholders = visitorIds.map(() => "?").join(",");
    const counts = await env.DB.prepare(
      `SELECT visitor_id, COUNT(*) AS n FROM sessions WHERE visitor_id IN (${placeholders}) AND started_at < ? GROUP BY visitor_id`,
    )
      .bind(...visitorIds, from)
      .all();
    for (const row of counts.results || []) {
      priorCounts[row.visitor_id] = row.n;
    }
  }

  const pagesBySession = new Map();
  for (const p of pagesResult.results || []) {
    const list = pagesBySession.get(p.session_id) || [];
    list.push({
      id: p.id,
      url: p.url,
      title: p.title,
      startedAt: p.started_at,
      activeMs: p.active_ms,
      totalMs: p.total_ms,
      scrollPct: p.scroll_pct,
      events: parseJsonColumn(p.events, []),
      flags: p.flags ? p.flags.split(",") : [],
    });
    pagesBySession.set(p.session_id, list);
  }

  return jsonResponse(200, {
    from,
    to,
    truncated: sessions.length >= MAX_SESSIONS_PER_QUERY,
    sessions: sessions.map((s) => ({
      id: s.id,
      visitorId: s.visitor_id,
      startedAt: s.started_at,
      country: s.country,
      region: s.region,
      city: s.city,
      referrer: s.referrer,
      landingUrl: s.landing_url,
      gclid: s.gclid,
      params: parseJsonColumn(s.params, {}),
      device: s.device,
      screen: s.screen,
      language: s.language,
      userAgent: s.user_agent,
      priorSessions: priorCounts[s.visitor_id] || 0,
      pages: pagesBySession.get(s.id) || [],
    })),
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return emptyResponse();
    }
    const path = new URL(request.url).pathname.replace(/\/+$/, "");
    if (request.method === "POST" && path === "/api/track") {
      try {
        return await handleCollect(request, env);
      } catch (err) {
        console.error(JSON.stringify({ event: "track_failed", message: err?.message }));
        return emptyResponse(500);
      }
    }
    if (request.method === "GET" && path === "/api/track/visits") {
      return handleVisits(request, env);
    }
    if (request.method === "GET" && path === "/api/track/login") {
      return (await authorized(request, env))
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: "Wrong password" });
    }
    return jsonResponse(404, { error: "Not found" });
  },

  async scheduled(event, env) {
    const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM pages WHERE started_at < ?`).bind(cutoff),
      env.DB.prepare(`DELETE FROM sessions WHERE started_at < ?`).bind(cutoff),
    ]);
  },
};
