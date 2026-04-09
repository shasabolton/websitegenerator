/**
 * One-off / maintenance: fetches each physical product's LEGACY_SHOP_URL,
 * extracts up to 3 YouTube URLs (iframe embed + links, page order), writes VIDEO1–3.
 * Run: node tools/scrapeLegacyYoutube.js
 */
const fs = require("fs");
const path = require("path");

const productPath = path.join(__dirname, "../shared-assets/config/productData.json");

function extractYoutubeUrls(html) {
  const ids = [];
  const seen = new Set();
  const tryAdd = (id) => {
    if (!id || id.length !== 11) return;
    if (seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  };

  const iframeRe = /iframe[^>]+src=["']([^"']*youtube[^"']*|[^"']*youtu\.be[^"']*)["']/gi;
  let m;
  while ((m = iframeRe.exec(html)) !== null) {
    const u = m[1];
    const embed = u.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (embed) tryAdd(embed[1]);
    const watch = u.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (watch) tryAdd(watch[1]);
    const short = u.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (short) tryAdd(short[1]);
  }

  const linkRe = /https?:\/\/(?:www\.)?youtube\.com\/watch\?[^"'<\s]+/gi;
  while ((m = linkRe.exec(html)) !== null) {
    const vid = m[0].match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (vid) tryAdd(vid[1]);
  }

  const beRe = /https?:\/\/youtu\.be\/([a-zA-Z0-9_-]{11})/gi;
  while ((m = beRe.exec(html)) !== null) tryAdd(m[1]);

  for (const x of html.matchAll(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/g)) tryAdd(x[1]);

  return ids.slice(0, 3).map((id) => `https://www.youtube.com/watch?v=${id}`);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; LegacyShopScraper/1.0)",
      Accept: "text/html,*/*",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

async function main() {
  const data = JSON.parse(fs.readFileSync(productPath, "utf8"));
  const cols = data.columns || [];
  for (const k of ["VIDEO1", "VIDEO2", "VIDEO3"]) {
    if (!cols.includes(k)) cols.push(k);
  }
  data.columns = cols;

  const cache = new Map();

  for (const p of data.products) {
    if (p.DIGITAL) {
      p.VIDEO1 = "";
      p.VIDEO2 = "";
      p.VIDEO3 = "";
      continue;
    }

    const url = (p.LEGACY_SHOP_URL || "").trim();
    if (!url) {
      p.VIDEO1 = "";
      p.VIDEO2 = "";
      p.VIDEO3 = "";
      continue;
    }

    let urls = cache.get(url);
    if (!urls) {
      try {
        const html = await fetchHtml(url);
        urls = extractYoutubeUrls(html);
        cache.set(url, urls);
        console.error(url, "->", urls.length ? urls.join(" | ") : "(no youtube)");
      } catch (e) {
        console.error(url, "!!", e.message);
        urls = [];
        cache.set(url, urls);
      }
    }

    p.VIDEO1 = urls[0] || "";
    p.VIDEO2 = urls[1] || "";
    p.VIDEO3 = urls[2] || "";
  }

  fs.writeFileSync(productPath, JSON.stringify(data, null, 2) + "\n");
  console.error("Wrote", productPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
