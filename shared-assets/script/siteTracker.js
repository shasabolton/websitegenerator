/**
 * Visitor journey tracker. Records each page visit (time on page, scroll depth) and what the
 * visitor did on it (clicks, photo carousel, YouTube plays, add to cart, errors), then sends one
 * request to the tracker worker when the visitor leaves the page.
 *
 * Never records what visitors type into fields.
 * Opt this browser out with ?notrack=1 (undo with ?notrack=0).
 */
(function initSiteTracker() {
  if (window.__siteTrackerBound) {
    return;
  }
  window.__siteTrackerBound = true;

  const script = document.currentScript;
  const endpoint = String(script?.getAttribute("data-endpoint") || "").trim();
  const hosts = String(script?.getAttribute("data-hosts") || "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  const OPT_OUT_KEY = "cc-tracker-off";
  const VISITOR_KEY = "cc-visitor";
  const SESSION_KEY = "cc-session";
  const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
  const MAX_EVENTS = 300;
  const MAX_SENDS_PER_PAGE = 10;
  const MAX_ERRORS_PER_PAGE = 20;
  // Quota protection: every request counts against the shared free Workers quota (the checkout worker uses it too).
  const SEND_LOG_KEY = "cc-tracker-sends";
  const MAX_SENDS_PER_MINUTE = 20;
  const MAX_SENDS_PER_DAY = 300;
  const QUICK_PAGE_MS = 1000;
  const FAST_PAGES_PER_MINUTE = 15;
  const FLOOD_WINDOW_MS = 10000;
  const FLOOD_LIMITS = { click: 10, carousel: 20 };
  const TRACKING_PARAMS = [
    "gclid",
    "gbraid",
    "wbraid",
    "fbclid",
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "matchtype",
    "device",
    "network",
    "notrack",
  ];

  function storageGet(store, key) {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  }

  function storageSet(store, key, value) {
    try {
      store.setItem(key, value);
    } catch {}
  }

  try {
    const notrack = new URLSearchParams(window.location.search).get("notrack");
    if (notrack === "1") {
      localStorage.setItem(OPT_OUT_KEY, "1");
    } else if (notrack === "0") {
      localStorage.removeItem(OPT_OUT_KEY);
    }
  } catch {}

  if (
    !endpoint ||
    !hosts.includes(window.location.hostname.toLowerCase()) ||
    navigator.webdriver ||
    storageGet(localStorage, OPT_OUT_KEY) === "1"
  ) {
    return;
  }

  function randomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  function clip(value, max) {
    const s = String(value ?? "").replace(/\s+/g, " ").trim();
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function isInternalUrl(url) {
    try {
      return hosts.includes(new URL(url, window.location.href).hostname.toLowerCase());
    } catch {
      return false;
    }
  }

  function cleanPageUrl(href) {
    try {
      const u = new URL(href, window.location.href);
      for (const key of TRACKING_PARAMS) {
        u.searchParams.delete(key);
      }
      return `${u.pathname}${u.search}${u.hash}`;
    } catch {
      return window.location.pathname;
    }
  }

  function deviceType() {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (!coarse) {
      return "desktop";
    }
    return Math.min(window.screen.width, window.screen.height) < 600 ? "mobile" : "tablet";
  }

  function hasCampaignParams() {
    const params = new URLSearchParams(window.location.search);
    return ["gclid", "gbraid", "wbraid", "utm_source", "fbclid"].some((k) => params.get(k));
  }

  // ---- Visitor + session ----

  let visitorId = storageGet(localStorage, VISITOR_KEY);
  if (!visitorId || !/^[a-f0-9]{32}$/.test(visitorId)) {
    visitorId = randomId();
    storageSet(localStorage, VISITOR_KEY, visitorId);
  }

  function loadSession() {
    const now = Date.now();
    let stored = null;
    try {
      stored = JSON.parse(storageGet(localStorage, SESSION_KEY) || "null");
    } catch {}
    const landingUrl = window.location.href;
    const startsNewCampaign = hasCampaignParams() && stored && stored.landingUrl !== landingUrl;
    if (stored && stored.id && now - Number(stored.lastActive) < SESSION_TIMEOUT_MS && !startsNewCampaign) {
      return stored;
    }
    const referrer = document.referrer && !isInternalUrl(document.referrer) ? document.referrer : "";
    return {
      id: randomId(),
      startedAt: now,
      lastActive: now,
      referrer,
      landingUrl,
    };
  }

  const session = loadSession();
  session.pageStarts = Array.isArray(session.pageStarts) ? session.pageStarts : [];
  session.skippedQuick = Number(session.skippedQuick) || 0;

  function touchSession() {
    session.lastActive = Date.now();
    storageSet(localStorage, SESSION_KEY, JSON.stringify(session));
  }
  touchSession();

  // ---- Sending budget (shared by all tabs of this browser) ----

  function sendAllowed() {
    const now = Date.now();
    let log = [];
    try {
      log = JSON.parse(storageGet(localStorage, SEND_LOG_KEY) || "[]");
    } catch {}
    log = (Array.isArray(log) ? log : []).filter((t) => now - t < 86_400_000);
    const lastMinute = log.filter((t) => now - t < 60_000).length;
    if (lastMinute >= MAX_SENDS_PER_MINUTE || log.length >= MAX_SENDS_PER_DAY) {
      session.throttled = true;
      touchSession();
      return false;
    }
    log.push(now);
    storageSet(localStorage, SEND_LOG_KEY, JSON.stringify(log));
    return true;
  }

  function flagBot(reason) {
    if (session.suspectedBot) {
      return;
    }
    session.suspectedBot = true;
    touchSession();
    track("bot", "Possible bot", reason);
  }

  // ---- Page record ----

  let page;
  let visibleSince = 0;
  let activeMs = 0;
  let sendCount = 0;
  let lastSentSignature = "";
  let errorCount = 0;
  let maxScrollPct = 0;
  let floodCount = 0;
  const scrollMilestones = new Set();

  function startPage() {
    const now = Date.now();
    page = {
      id: randomId(),
      url: cleanPageUrl(window.location.href),
      title: clip(document.title, 200),
      startedAt: now,
      events: [],
    };
    activeMs = 0;
    visibleSince = document.visibilityState === "visible" ? now : 0;
    sendCount = 0;
    lastSentSignature = "";
    errorCount = 0;
    maxScrollPct = 0;
    floodCount = 0;
    scrollMilestones.clear();
    updateScroll();

    if (session.skippedQuick > 0) {
      const n = session.skippedQuick;
      track("skipped", `${n} page view${n === 1 ? "" : "s"} under 1 second not recorded`);
      session.skippedQuick = 0;
    }
    session.pageStarts = session.pageStarts.filter((t) => now - t < 60_000).concat(now);
    if (session.pageStarts.length >= FAST_PAGES_PER_MINUTE) {
      flagBot(`${FAST_PAGES_PER_MINUTE}+ pages opened within a minute`);
    }
    touchSession();
  }

  function activeNow() {
    return activeMs + (visibleSince ? Date.now() - visibleSince : 0);
  }

  function track(type, label, detail) {
    if (!page || page.events.length >= MAX_EVENTS) {
      return;
    }
    const event = { t: activeNow(), type };
    if (label) {
      event.label = clip(label, 120);
    }
    if (detail) {
      event.detail = clip(detail, 200);
    }
    page.events.push(event);
  }

  function send(isLeaving) {
    if (!page || sendCount >= MAX_SENDS_PER_PAGE) {
      return;
    }
    const active = activeNow();
    if (active < QUICK_PAGE_MS && !page.events.length) {
      if (isLeaving === true) {
        session.skippedQuick += 1;
        touchSession();
      }
      return;
    }
    const signature = `${page.events.length}:${Math.round(active / 1000)}:${maxScrollPct}`;
    if (signature === lastSentSignature || !sendAllowed()) {
      return;
    }
    lastSentSignature = signature;
    sendCount += 1;
    touchSession();

    const body = JSON.stringify({
      v: 1,
      sentAt: Date.now(),
      visitorId,
      session: {
        id: session.id,
        startedAt: session.startedAt,
        referrer: session.referrer,
        landingUrl: session.landingUrl,
        device: deviceType(),
        screen: `${window.screen.width}x${window.screen.height}`,
        language: navigator.language || "",
      },
      page: {
        id: page.id,
        url: page.url,
        title: page.title,
        startedAt: page.startedAt,
        activeMs: active,
        totalMs: Date.now() - page.startedAt,
        scrollPct: maxScrollPct,
        events: page.events,
        flags: [session.suspectedBot && "bot", session.throttled && "throttled"].filter(Boolean),
      },
    });

    try {
      const blob = new Blob([body], { type: "text/plain;charset=UTF-8" });
      if (navigator.sendBeacon && navigator.sendBeacon(endpoint, blob)) {
        return;
      }
    } catch {}
    try {
      fetch(endpoint, { method: "POST", body, keepalive: true, mode: "no-cors" });
    } catch {}
  }

  // ---- Visibility / leaving ----

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (visibleSince) {
        activeMs += Date.now() - visibleSince;
        visibleSince = 0;
      }
      send(false);
    } else if (!visibleSince) {
      visibleSince = Date.now();
    }
  });

  window.addEventListener("pagehide", () => send(true));

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      startPage();
    }
  });

  // ---- Scroll depth ----

  function updateScroll() {
    const doc = document.documentElement;
    const height = Math.max(doc.scrollHeight, document.body?.scrollHeight || 0);
    if (!height) {
      return;
    }
    const pct = Math.min(100, Math.round(((window.scrollY + window.innerHeight) / height) * 100));
    if (pct > maxScrollPct) {
      maxScrollPct = pct;
    }
    for (const milestone of [25, 50, 75, 100]) {
      if (pct >= milestone && !scrollMilestones.has(milestone) && window.scrollY > 0) {
        scrollMilestones.add(milestone);
        track("scroll", `Scrolled ${milestone}%`);
      }
    }
  }

  let scrollQueued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollQueued) {
        return;
      }
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        updateScroll();
      });
    },
    { passive: true },
  );

  // ---- Clicks ----

  const CLICKABLE =
    'a, button, [role="button"], input[type="submit"], input[type="button"], input[type="checkbox"], input[type="radio"], summary, label, [data-track]';

  function labelFor(el) {
    const explicit = el.getAttribute("data-track") || el.getAttribute("aria-label");
    if (explicit) {
      return explicit;
    }
    if (el.tagName === "INPUT") {
      if (el.type === "checkbox" || el.type === "radio") {
        const labelEl = el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`) : el.closest("label");
        return `${el.type}: ${labelEl?.innerText || el.name || el.id || ""}`;
      }
      return el.value || el.name || el.type;
    }
    const text = el.innerText || el.textContent || "";
    if (text.trim()) {
      return text;
    }
    const img = el.querySelector("img[alt]");
    return img?.getAttribute("alt") || el.getAttribute("title") || el.tagName.toLowerCase();
  }

  function carouselLabel(el) {
    const label = el.getAttribute("aria-label") || "";
    const match = label.match(/(image|YouTube video) \(?(\d+) of (\d+)/i);
    if (!match) {
      return label || "Carousel";
    }
    const kind = match[1].toLowerCase() === "image" ? "Photo" : "Video";
    return `${kind} ${match[2]} of ${match[3]}`;
  }

  function looksClickable(el) {
    if (!el || el === document.body || el === document.documentElement) {
      return false;
    }
    if (el.closest("img, picture, figure")) {
      return true;
    }
    try {
      return getComputedStyle(el).cursor === "pointer";
    } catch {
      return false;
    }
  }

  const recentClicks = [];
  let lastRageAt = 0;

  function checkRageClick(event, label) {
    const now = Date.now();
    recentClicks.push({ x: event.clientX, y: event.clientY, at: now });
    while (recentClicks.length && now - recentClicks[0].at > 800) {
      recentClicks.shift();
    }
    const near = recentClicks.filter((c) => Math.abs(c.x - event.clientX) < 40 && Math.abs(c.y - event.clientY) < 40);
    if (near.length >= 3 && now - lastRageAt > 2000) {
      lastRageAt = now;
      track("rage", `Rage click: ${label}`, "3+ fast clicks in the same spot");
    }
  }

  const clickTimes = { click: [], carousel: [] };
  const floodPausedUntil = { click: 0, carousel: 0 };

  function allowClick(kind) {
    const now = Date.now();
    if (now < floodPausedUntil[kind]) {
      return false;
    }
    const times = clickTimes[kind];
    times.push(now);
    while (times.length && now - times[0] > FLOOD_WINDOW_MS) {
      times.shift();
    }
    if (times.length < FLOOD_LIMITS[kind]) {
      return true;
    }
    times.length = 0;
    floodPausedUntil[kind] = now + FLOOD_WINDOW_MS;
    floodCount += 1;
    const what = kind === "carousel" ? "photo carousel clicks" : "clicks";
    track("flood", `Click flood: ${FLOOD_LIMITS[kind]}+ ${what} in 10s`, "Clicks not recorded for 10 seconds");
    if (floodCount >= 2) {
      flagBot("Repeated click floods");
    }
    return false;
  }

  document.addEventListener(
    "click",
    (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target || !event.isTrusted) {
        return;
      }
      const el = target.closest(CLICKABLE);
      const isCarousel = Boolean(el && el.classList.contains("image-carousel-thumb"));
      if (!allowClick(isCarousel ? "carousel" : "click")) {
        return;
      }
      let label;
      if (isCarousel) {
        label = carouselLabel(el);
        track("carousel", label);
      } else if (el) {
        label = labelFor(el);
        let detail = "";
        if (el.tagName === "A" && el.getAttribute("href")) {
          detail = isInternalUrl(el.href) ? cleanPageUrl(el.href) : el.href;
        }
        track("click", label, detail);
      } else {
        const img = target.closest("img");
        label = img?.getAttribute("alt") || target.innerText?.slice(0, 40) || target.tagName.toLowerCase();
        if (looksClickable(target)) {
          track("dead", `Clicked (not clickable): ${label}`);
        }
      }
      checkRageClick(event, label || "page");
    },
    true,
  );

  // ---- Form fields (names only, never values) ----

  const fieldsSeen = new Set();
  document.addEventListener(
    "focusin",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLElement) || !el.matches("input, textarea")) {
        return;
      }
      if (el.matches('[type="submit"], [type="button"], [type="checkbox"], [type="radio"], [type="hidden"]')) {
        return;
      }
      const name = el.getAttribute("aria-label") || el.name || el.id || el.getAttribute("placeholder") || el.type;
      if (fieldsSeen.has(name)) {
        return;
      }
      fieldsSeen.add(name);
      track("field", `Used field: ${name}`);
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      const el = event.target;
      if (!(el instanceof HTMLSelectElement)) {
        return;
      }
      const name = el.getAttribute("aria-label") || el.name || el.id || "option";
      track("select", `Chose ${name}`, el.selectedOptions[0]?.text || "");
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (form instanceof HTMLFormElement) {
        track("submit", `Submitted form: ${form.getAttribute("aria-label") || form.id || form.name || "form"}`);
      }
    },
    true,
  );

  // ---- Errors ----

  window.addEventListener(
    "error",
    (event) => {
      if (errorCount >= MAX_ERRORS_PER_PAGE) {
        return;
      }
      const target = event.target;
      if (target && target !== window && target instanceof Element) {
        errorCount += 1;
        const src = target.getAttribute("src") || target.getAttribute("href") || "";
        track("error", `Failed to load ${target.tagName.toLowerCase()}`, src);
        return;
      }
      errorCount += 1;
      const where = event.filename ? `${cleanPageUrl(event.filename)}:${event.lineno}` : "";
      track("error", event.message || "Script error", where);
    },
    true,
  );

  window.addEventListener("unhandledrejection", (event) => {
    if (errorCount >= MAX_ERRORS_PER_PAGE) {
      return;
    }
    errorCount += 1;
    const reason = event.reason;
    track("error", reason?.message || String(reason || "Unhandled promise rejection"));
  });

  // ---- Shopping cart (wraps the GA4 helpers the cart already calls) ----

  function formatMoney(value) {
    const n = Number(value);
    return Number.isFinite(n) ? `$${n.toFixed(2)}` : "";
  }

  const analytics = window.siteAnalytics;
  if (analytics) {
    const { addToCart, beginCheckout, purchase } = analytics;
    analytics.addToCart = function (line) {
      if (line) {
        const qty = Math.max(1, Math.floor(Number(line.quantity)) || 1);
        track("cart", `Added to cart: ${line.title || line.sku || "item"}`, `${qty} × ${formatMoney(line.unitPrice)}`);
      }
      return addToCart?.apply(this, arguments);
    };
    analytics.beginCheckout = function (lines, value) {
      track("checkout", "Started checkout", formatMoney(value));
      return beginCheckout?.apply(this, arguments);
    };
    analytics.purchase = function (transactionId, value) {
      track("purchase", "Purchase completed", formatMoney(value));
      send();
      return purchase?.apply(this, arguments);
    };
  }

  // ---- YouTube videos ----

  const players = new WeakMap();
  let youtubeApiRequested = false;

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  function isYoutubeApiIframe(iframe) {
    const src = iframe.getAttribute("src") || "";
    return /youtube(-nocookie)?\.com\/embed\//.test(src) && /[?&]enablejsapi=1/.test(src);
  }

  function embedKey(iframe) {
    return String(iframe.getAttribute("src") || "").split("?")[0];
  }

  function bindPlayer(iframe) {
    const src = embedKey(iframe);
    if (!isYoutubeApiIframe(iframe) || players.get(iframe)?.src === src) {
      return;
    }
    if (!window.YT?.Player) {
      requestYoutubeApi();
      return;
    }
    const title = iframe.getAttribute("title") || "video";
    const state = { src, quartiles: new Set(), timer: 0, player: null };
    players.set(iframe, state);

    const checkProgress = () => {
      const p = state.player;
      if (!p?.getDuration) {
        return;
      }
      const duration = p.getDuration();
      if (!duration) {
        return;
      }
      const pct = (p.getCurrentTime() / duration) * 100;
      for (const q of [25, 50, 75]) {
        if (pct >= q && !state.quartiles.has(q)) {
          state.quartiles.add(q);
          track("video", `Watched ${q}%`, title);
        }
      }
    };

    try {
      state.player = new window.YT.Player(iframe, {
        events: {
          onStateChange(ev) {
            const p = state.player;
            const at = p?.getCurrentTime ? formatTime(p.getCurrentTime()) : "";
            if (ev.data === 1) {
              track("video", `Play at ${at}`, title);
              clearInterval(state.timer);
              state.timer = setInterval(checkProgress, 1000);
            } else if (ev.data === 2) {
              track("video", `Pause at ${at}`, title);
              clearInterval(state.timer);
            } else if (ev.data === 0) {
              track("video", "Finished video", title);
              clearInterval(state.timer);
            }
          },
        },
      });
    } catch {}
  }

  function bindAllPlayers() {
    document.querySelectorAll("iframe").forEach((iframe) => {
      if (isYoutubeApiIframe(iframe)) {
        bindPlayer(iframe);
      } else if (!iframe.getAttribute("src") && players.has(iframe)) {
        // Carousel unloads hidden videos; a fresh player is needed when the src comes back.
        clearInterval(players.get(iframe).timer);
        players.delete(iframe);
      }
    });
  }

  let bindQueued = false;
  function queueBindAllPlayers() {
    if (bindQueued) {
      return;
    }
    bindQueued = true;
    setTimeout(() => {
      bindQueued = false;
      bindAllPlayers();
    }, 250);
  }

  function requestYoutubeApi() {
    if (youtubeApiRequested) {
      return;
    }
    youtubeApiRequested = true;
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = function () {
      if (typeof previous === "function") {
        previous();
      }
      bindAllPlayers();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    tag.async = true;
    document.head.appendChild(tag);
  }

  // Older pages embed YouTube without the player API; at least record that the video was clicked.
  window.addEventListener("blur", () => {
    setTimeout(() => {
      const active = document.activeElement;
      if (active instanceof HTMLIFrameElement && !players.has(active)) {
        track("video", "Clicked video", active.getAttribute("title") || active.getAttribute("src") || "");
      }
    }, 0);
  });

  new MutationObserver(queueBindAllPlayers).observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["src"],
  });

  window.siteTracker = { track, flush: send };

  startPage();
  bindAllPlayers();
})();
