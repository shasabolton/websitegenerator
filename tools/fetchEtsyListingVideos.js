/**
 * Fills ETSY_VIDEO1–ETSY_VIDEO3 from Etsy native listing videos (MP4 URLs).
 * Uses Open API v3: GET /application/listings/{listing_id}/videos
 *
 * Set ETSY_API_KEY (app key from https://www.etsy.com/developers/your-apps).
 * If required for your app, also set ETSY_ACCESS_TOKEN (OAuth bearer).
 *
 *   set ETSY_API_KEY=your_key_string
 *   node tools/fetchEtsyListingVideos.js
 */
const fs = require("fs");
const path = require("path");

const productPath = path.join(__dirname, "../shared-assets/config/productData.json");

const LISTING_ID_RE = /\/listing\/(\d+)\b/;

function listingIdFromEtsyUrl(url) {
  const m = String(url || "").match(LISTING_ID_RE);
  return m ? m[1] : null;
}

function ensureColumns(data) {
  const cols = data.columns || [];
  const insert = ["ETSY_VIDEO1", "ETSY_VIDEO2", "ETSY_VIDEO3"];
  const missing = insert.filter((k) => !cols.includes(k));
  if (missing.length === 0) return;
  const etsyIdx = cols.indexOf("ETSY_LISTING_URL");
  const existingIdx = insert.map((k) => cols.indexOf(k)).filter((i) => i >= 0);
  const anchorAfter =
    existingIdx.length > 0 ? Math.max(...existingIdx) : etsyIdx;
  if (anchorAfter >= 0) {
    cols.splice(anchorAfter + 1, 0, ...missing);
  } else {
    cols.push(...missing);
  }
  data.columns = cols;
}

function videoUrlsFromApiPayload(body) {
  const results = body.results || body.listing_videos || [];
  const urls = [];
  for (const r of results) {
    if (r.video_state && r.video_state !== "active") continue;
    const u = r.video_url || r.url;
    if (u && String(u).startsWith("http")) urls.push(String(u).trim());
  }
  return [...new Set(urls)];
}

async function fetchListingVideos(listingId, apiKey, accessToken) {
  const url = `https://openapi.etsy.com/v3/application/listings/${listingId}/videos`;
  const headers = {
    Accept: "application/json",
    "x-api-key": apiKey,
  };
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON: ${text.slice(0, 120)}`);
  }
  return videoUrlsFromApiPayload(body);
}

async function main() {
  const apiKey = process.env.ETSY_API_KEY || process.env.ETSY_OPEN_API_KEY || "";
  const accessToken = process.env.ETSY_ACCESS_TOKEN || "";

  const raw = fs.readFileSync(productPath, "utf8");
  const data = JSON.parse(raw);

  ensureColumns(data);

  for (const p of data.products) {
    if (p.ETSY_VIDEO1 === undefined) p.ETSY_VIDEO1 = "";
    if (p.ETSY_VIDEO2 === undefined) p.ETSY_VIDEO2 = "";
    if (p.ETSY_VIDEO3 === undefined) p.ETSY_VIDEO3 = "";
  }

  if (!apiKey) {
    console.error("No ETSY_API_KEY: added ETSY_VIDEO1–3 columns/keys (empty). Re-run with key set.");
    fs.writeFileSync(productPath, JSON.stringify(data, null, 2) + "\n");
    return;
  }

  const cache = new Map();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const p of data.products) {
    const listingUrl = String(p.ETSY_LISTING_URL || "").trim();
    const listingId = listingIdFromEtsyUrl(listingUrl);
    p.ETSY_VIDEO1 = "";
    p.ETSY_VIDEO2 = "";
    p.ETSY_VIDEO3 = "";

    if (!listingId) {
      continue;
    }

    let urls = cache.get(listingId);
    if (urls === undefined) {
      try {
        urls = await fetchListingVideos(listingId, apiKey, accessToken);
        cache.set(listingId, urls);
        console.error(`listing ${listingId}: ${urls.length ? urls.join(" | ") : "(no videos)"}`);
      } catch (e) {
        console.error(`listing ${listingId}: !! ${e.message}`);
        cache.set(listingId, []);
        urls = [];
      }
      await delay(200);
    }

    p.ETSY_VIDEO1 = urls[0] || "";
    p.ETSY_VIDEO2 = urls[1] || "";
    p.ETSY_VIDEO3 = urls[2] || "";
  }

  fs.writeFileSync(productPath, JSON.stringify(data, null, 2) + "\n");
  console.error("Wrote", productPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
