/**
 * Refresh shared-assets/config/youtubeUploadDates.json from product VIDEO1 URLs.
 *
 * Prefer YouTube Data API when YOUTUBE_API_KEY is set; otherwise scrape the
 * watch page for itemprop=uploadDate (same value Google expects).
 *
 * Run: node tools/fetchYoutubeUploadDates.js
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const productPath = path.join(root, "shared-assets/config/productData.json");
const outPath = path.join(root, "shared-assets/config/youtubeUploadDates.json");

function parseYoutubeVideoId(raw) {
  const s = String(raw || "").trim();
  if (!s) {
    return null;
  }
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\./i, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0] || "";
      return /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (u.pathname.startsWith("/embed/")) {
        const id = u.pathname.slice("/embed/".length).split("/")[0] || "";
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
      if (u.pathname === "/watch") {
        const v = u.searchParams.get("v") || "";
        return /^[\w-]{11}$/.test(v) ? v : null;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.slice("/shorts/".length).split("/")[0] || "";
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
    }
  } catch {
    // fall through
  }
  return /^[\w-]{11}$/.test(s) ? s : null;
}

function collectVideoIds(productData) {
  const ids = new Set();
  const products = Array.isArray(productData?.products) ? productData.products : [];
  for (const row of products) {
    const url = String(row?.VIDEO1 ?? row?.video01 ?? row?.VIDEO_1 ?? "").trim();
    const id = parseYoutubeVideoId(url);
    if (id) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

async function fetchViaDataApi(ids, apiKey) {
  const dates = {};
  const errors = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey);
    const res = await fetch(url.toString());
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      errors.push(body?.error?.message || `HTTP ${res.status}`);
      continue;
    }
    for (const item of body.items || []) {
      const id = String(item?.id || "").trim();
      const publishedAt = String(item?.snippet?.publishedAt || "").trim();
      if (/^[\w-]{11}$/.test(id) && publishedAt) {
        dates[id] = publishedAt;
      }
    }
  }
  return { dates, errors };
}

function extractUploadDateFromHtml(html) {
  const patterns = [
    /itemprop="uploadDate"\s+content="([^"]+)"/i,
    /itemprop='uploadDate'\s+content='([^']+)'/i,
    /"uploadDate"\s*:\s*"([^"]+)"/,
    /"publishDate"\s*:\s*"([^"]+)"/,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      return m[1];
    }
  }
  return null;
}

async function fetchViaScrape(ids) {
  const dates = {};
  const errors = [];
  for (const id of ids) {
    try {
      const res = await fetch(`https://www.youtube.com/watch?v=${id}`, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; ContraptionCartUploadDateBot/1.0)",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,*/*",
        },
        redirect: "follow",
      });
      if (!res.ok) {
        errors.push(`${id}: HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      const date = extractUploadDateFromHtml(html);
      if (!date) {
        errors.push(`${id}: uploadDate not found`);
        continue;
      }
      dates[id] = date;
      process.stdout.write(".");
    } catch (err) {
      errors.push(`${id}: ${err.message || err}`);
    }
  }
  if (ids.length) {
    process.stdout.write("\n");
  }
  return { dates, errors };
}

async function main() {
  const productData = JSON.parse(fs.readFileSync(productPath, "utf8"));
  const ids = collectVideoIds(productData);
  console.log(`Found ${ids.length} unique VIDEO1 YouTube ids.`);

  let existing = {};
  if (fs.existsSync(outPath)) {
    try {
      const prev = JSON.parse(fs.readFileSync(outPath, "utf8"));
      existing = prev?.dates && typeof prev.dates === "object" ? prev.dates : {};
    } catch {
      existing = {};
    }
  }

  const apiKey = String(process.env.YOUTUBE_API_KEY || "").trim();
  const need = ids.filter((id) => !existing[id]);
  console.log(`Already cached: ${ids.length - need.length}; to fetch: ${need.length}`);

  let fetched = {};
  let errors = [];
  if (need.length) {
    if (apiKey) {
      console.log("Fetching via YouTube Data API…");
      const result = await fetchViaDataApi(need, apiKey);
      fetched = result.dates;
      errors = result.errors;
    } else {
      console.log("No YOUTUBE_API_KEY; scraping watch pages for uploadDate…");
      const result = await fetchViaScrape(need);
      fetched = result.dates;
      errors = result.errors;
    }
  }

  const dates = { ...existing };
  for (const id of ids) {
    if (fetched[id]) {
      dates[id] = fetched[id];
    }
  }

  const missing = ids.filter((id) => !dates[id]);
  const payload = {
    updatedAt: new Date().toISOString(),
    source: apiKey ? "youtube-data-api" : "youtube-watch-page",
    dates,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${Object.keys(dates).length} dates to ${path.relative(root, outPath)}`);
  if (missing.length) {
    console.warn(`Missing dates for: ${missing.join(", ")}`);
  }
  if (errors.length) {
    console.warn("Errors:");
    for (const e of errors.slice(0, 20)) {
      console.warn(`  ${e}`);
    }
    if (errors.length > 20) {
      console.warn(`  …and ${errors.length - 20} more`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
