/**
 * Resolve YouTube video upload dates for VideoObject.uploadDate.
 * Prefers YouTube Data API v3 when an API key is configured; otherwise uses
 * shared-assets/config/youtubeUploadDates.json (and a localStorage mirror).
 *
 * API key (optional): window.githubAuthConfig.youtubeApiKey or
 * localStorage key siteGenerator.youtubeApiKey
 */

const REPO_CACHE_URL = "../../shared-assets/config/youtubeUploadDates.json";
const LS_DATES_KEY = "siteGenerator.youtubeUploadDates";
const LS_API_KEY = "siteGenerator.youtubeApiKey";
const API_BATCH = 50;

/** @type {Record<string, string>} */
let memoryDates = Object.create(null);
let repoCachePromise = null;

function normalizeVideoId(raw) {
  const id = String(raw || "").trim();
  return /^[\w-]{11}$/.test(id) ? id : "";
}

function normalizeUploadDate(raw) {
  const s = String(raw || "").trim();
  if (!s) {
    return "";
  }
  // Accept ISO-8601; reject obviously bad values.
  const t = Date.parse(s);
  if (!Number.isFinite(t)) {
    return "";
  }
  // Prefer the original string when it already looks like ISO with timezone.
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return s;
  }
  return new Date(t).toISOString();
}

function getApiKey() {
  const fromConfig = String(window.githubAuthConfig?.youtubeApiKey || "").trim();
  if (fromConfig) {
    return fromConfig;
  }
  try {
    return String(window.localStorage?.getItem(LS_API_KEY) || "").trim();
  } catch {
    return "";
  }
}

function readLocalStorageCache() {
  try {
    const raw = window.localStorage?.getItem(LS_DATES_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    const dates = parsed?.dates && typeof parsed.dates === "object" ? parsed.dates : parsed;
    if (!dates || typeof dates !== "object") {
      return;
    }
    for (const [id, value] of Object.entries(dates)) {
      const vid = normalizeVideoId(id);
      const date = normalizeUploadDate(value);
      if (vid && date && !memoryDates[vid]) {
        memoryDates[vid] = date;
      }
    }
  } catch {
    // ignore corrupt cache
  }
}

function writeLocalStorageCache() {
  try {
    window.localStorage?.setItem(
      LS_DATES_KEY,
      JSON.stringify({ updatedAt: new Date().toISOString(), dates: memoryDates }),
    );
  } catch {
    // quota / private mode
  }
}

function mergeDates(map) {
  if (!map || typeof map !== "object") {
    return 0;
  }
  let n = 0;
  for (const [id, value] of Object.entries(map)) {
    const vid = normalizeVideoId(id);
    const date = normalizeUploadDate(value);
    if (!vid || !date) {
      continue;
    }
    if (memoryDates[vid] !== date) {
      memoryDates[vid] = date;
      n += 1;
    }
  }
  return n;
}

async function loadRepoCache() {
  if (!repoCachePromise) {
    repoCachePromise = (async () => {
      readLocalStorageCache();
      try {
        const fetchJson = window.generateAnyPage?.fetchJson;
        const data =
          typeof fetchJson === "function"
            ? await fetchJson(REPO_CACHE_URL)
            : await fetch(REPO_CACHE_URL, { cache: "no-cache" }).then((r) => {
                if (!r.ok) {
                  throw new Error(`HTTP ${r.status}`);
                }
                return r.json();
              });
        const dates = data?.dates && typeof data.dates === "object" ? data.dates : data;
        mergeDates(dates);
      } catch {
        // Missing file on first run is fine.
      }
    })();
  }
  await repoCachePromise;
}

/**
 * @param {string[]} videoIds
 * @param {string} apiKey
 */
async function fetchFromYoutubeDataApi(videoIds, apiKey) {
  const unique = [...new Set(videoIds.map(normalizeVideoId).filter(Boolean))];
  const missing = unique.filter((id) => !memoryDates[id]);
  if (!missing.length || !apiKey) {
    return { fetched: 0, errors: [] };
  }
  let fetched = 0;
  const errors = [];
  for (let i = 0; i < missing.length; i += API_BATCH) {
    const batch = missing.slice(i, i + API_BATCH);
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet");
    url.searchParams.set("id", batch.join(","));
    url.searchParams.set("key", apiKey);
    try {
      const res = await fetch(url.toString());
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = body?.error?.message || `HTTP ${res.status}`;
        errors.push(msg);
        continue;
      }
      const items = Array.isArray(body.items) ? body.items : [];
      for (const item of items) {
        const id = normalizeVideoId(item?.id);
        const publishedAt = normalizeUploadDate(item?.snippet?.publishedAt);
        if (id && publishedAt) {
          memoryDates[id] = publishedAt;
          fetched += 1;
        }
      }
    } catch (err) {
      errors.push(err?.message || String(err));
    }
  }
  if (fetched) {
    writeLocalStorageCache();
  }
  return { fetched, errors };
}

/**
 * Ensure upload dates are available for the given video ids.
 * Uses repo/local cache first, then YouTube Data API when a key is configured.
 * @param {string[]} videoIds
 * @returns {Promise<{ resolved: number, fetched: number, missing: string[], errors: string[] }>}
 */
async function ensureUploadDates(videoIds) {
  await loadRepoCache();
  const unique = [...new Set((videoIds || []).map(normalizeVideoId).filter(Boolean))];
  const stillMissing = unique.filter((id) => !memoryDates[id]);
  let fetched = 0;
  let errors = [];
  if (stillMissing.length) {
    const apiKey = getApiKey();
    if (apiKey) {
      const result = await fetchFromYoutubeDataApi(stillMissing, apiKey);
      fetched = result.fetched;
      errors = result.errors;
    }
  }
  const missing = unique.filter((id) => !memoryDates[id]);
  return {
    resolved: unique.length - missing.length,
    fetched,
    missing,
    errors,
  };
}

/**
 * @param {string} videoId
 * @returns {Promise<string>} ISO-8601 upload date or ""
 */
async function getUploadDate(videoId) {
  const id = normalizeVideoId(videoId);
  if (!id) {
    return "";
  }
  await ensureUploadDates([id]);
  return memoryDates[id] || "";
}

/**
 * Synchronous peek after ensureUploadDates / loadRepoCache.
 * @param {string} videoId
 */
function peekUploadDate(videoId) {
  const id = normalizeVideoId(videoId);
  return id ? memoryDates[id] || "" : "";
}

/** Snapshot of known dates (for writing back into the repo cache on publish). */
function getDatesMap() {
  return { ...memoryDates };
}

window.youtubeVideoMeta = {
  ensureUploadDates,
  getUploadDate,
  peekUploadDate,
  getDatesMap,
  getApiKey,
  REPO_CACHE_URL,
};
