/**
 * Display-only currency conversion (catalog prices stay in AUD; PayPal checkout unchanged).
 * Rates from Frankfurter (ECB); cached in localStorage for 24h.
 */
(function initDisplayCurrency() {
  if (window.siteDisplayCurrency) {
    return;
  }

  const BASE_CURRENCY = "AUD";
  const STORAGE_KEY = "websitegenerator-display-currency";
  const RATES_CACHE_KEY = "websitegenerator-fx-rates-cache-v3";
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
  const SUPPORTED = [
    "AUD",
    "NZD",
    "USD",
    "EUR",
    "GBP",
    "CAD",
    "JPY",
    "SGD",
    "HKD",
    "CHF",
    "SEK",
    "NOK",
  ];
  const ZERO_DECIMAL_CURRENCIES = ["JPY"];

  const COUNTRY_TO_CURRENCY =
    window.siteShipCountries && window.siteShipCountries.COUNTRY_TO_CURRENCY
      ? window.siteShipCountries.COUNTRY_TO_CURRENCY
      : {
          AU: "AUD",
          NZ: "NZD",
          US: "USD",
          GB: "GBP",
          CA: "CAD",
          JP: "JPY",
          SG: "SGD",
          HK: "HKD",
          CH: "CHF",
          SE: "SEK",
          NO: "NOK",
          DE: "EUR",
          FR: "EUR",
          IT: "EUR",
          ES: "EUR",
          NL: "EUR",
          IE: "EUR",
          AT: "EUR",
          BE: "EUR",
          PT: "EUR",
          FI: "EUR",
        };

  const TZ_TO_CURRENCY = {
    "Australia/Hobart": "AUD",
    "Australia/Sydney": "AUD",
    "Australia/Melbourne": "AUD",
    "Australia/Brisbane": "AUD",
    "Australia/Adelaide": "AUD",
    "Australia/Perth": "AUD",
    "Australia/Darwin": "AUD",
    "Pacific/Auckland": "NZD",
    "Pacific/Chatham": "NZD",
    "America/New_York": "USD",
    "America/Chicago": "USD",
    "America/Denver": "USD",
    "America/Los_Angeles": "USD",
    "Europe/London": "GBP",
    "Europe/Dublin": "EUR",
    "Europe/Paris": "EUR",
    "Europe/Berlin": "EUR",
    "Europe/Zurich": "CHF",
    "Europe/Stockholm": "SEK",
    "Europe/Oslo": "NOK",
    "Asia/Tokyo": "JPY",
    "Asia/Singapore": "SGD",
    "Asia/Hong_Kong": "HKD",
  };

  /** @type {Record<string, number>} */
  let rates = { AUD: 1 };
  let displayCurrency = BASE_CURRENCY;
  let ready = false;
  /** @type {Promise<void> | null} */
  let readyPromise = null;

  function normalizeCode(code) {
    const c = String(code || "")
      .trim()
      .toUpperCase();
    return SUPPORTED.indexOf(c) >= 0 ? c : BASE_CURRENCY;
  }

  function detectDefaultCurrency() {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return normalizeCode(saved);
      }
    } catch (e) {}

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (tz && TZ_TO_CURRENCY[tz]) {
        return TZ_TO_CURRENCY[tz];
      }
    } catch (e2) {}

    try {
      const locale = String(navigator.language || "");
      const parts = locale.split("-");
      if (parts.length >= 2) {
        const region = parts[1].toUpperCase();
        if (COUNTRY_TO_CURRENCY[region]) {
          return COUNTRY_TO_CURRENCY[region];
        }
      }
    } catch (e3) {}

    return BASE_CURRENCY;
  }

  function loadCachedRates() {
    try {
      const raw = window.localStorage.getItem(RATES_CACHE_KEY);
      if (!raw) {
        return false;
      }
      const cached = JSON.parse(raw);
      if (
        !cached ||
        typeof cached.fetchedAt !== "number" ||
        Date.now() - cached.fetchedAt >= CACHE_TTL_MS ||
        !cached.rates ||
        typeof cached.rates !== "object"
      ) {
        return false;
      }
      rates = { AUD: 1, ...cached.rates };
      return true;
    } catch (e) {
      return false;
    }
  }

  function saveCachedRates() {
    try {
      window.localStorage.setItem(
        RATES_CACHE_KEY,
        JSON.stringify({ fetchedAt: Date.now(), rates }),
      );
    } catch (e) {}
  }

  function applyRatesFromApiObject(apiRates) {
    const next = { AUD: 1 };
    for (let i = 0; i < SUPPORTED.length; i++) {
      const code = SUPPORTED[i];
      if (code === BASE_CURRENCY) {
        continue;
      }
      const rate = Number(apiRates[code]);
      if (Number.isFinite(rate) && rate > 0) {
        next[code] = rate;
      }
    }
    if (Object.keys(next).length <= 1) {
      throw new Error("FX response had no usable rates");
    }
    rates = next;
    saveCachedRates();
  }

  async function fetchRatesFromFrankfurter() {
    const targets = SUPPORTED.filter((c) => c !== BASE_CURRENCY).join(",");
    const url =
      "https://api.frankfurter.dev/v1/latest?base=" +
      encodeURIComponent(BASE_CURRENCY) +
      "&symbols=" +
      encodeURIComponent(targets);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("Frankfurter FX fetch failed: " + res.status);
    }
    const data = await res.json();
    applyRatesFromApiObject(data.rates || {});
  }

  async function fetchRatesFromOpenErApi() {
    const url = "https://open.er-api.com/v6/latest/" + encodeURIComponent(BASE_CURRENCY);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("open.er-api.com fetch failed: " + res.status);
    }
    const data = await res.json();
    if (data.result !== "success" || !data.rates) {
      throw new Error("open.er-api.com returned no rates");
    }
    applyRatesFromApiObject(data.rates);
  }

  async function fetchRates() {
    if (loadCachedRates()) {
      return;
    }
    try {
      await fetchRatesFromFrankfurter();
    } catch (e) {
      await fetchRatesFromOpenErApi();
    }
  }

  /** ISO code + symbol prefix so AUD shows as AUD$55.00 (not Intl's A$55.00). */
  const DISPLAY_CURRENCY_PREFIX = {
    AUD: "AUD$",
    NZD: "NZD$",
    USD: "USD$",
    CAD: "CAD$",
    GBP: "GBP£",
    EUR: "EUR€",
    JPY: "JPY¥",
    SGD: "SGD$",
    HKD: "HKD$",
    CHF: "CHF",
    SEK: "SEK",
    NOK: "NOK",
  };

  function formatDecimal(amount, currencyCode) {
    const n = Number(amount);
    if (!Number.isFinite(n) || n < 0) {
      return ZERO_DECIMAL_CURRENCIES.indexOf(currencyCode) >= 0 ? "0" : "0.00";
    }
    if (ZERO_DECIMAL_CURRENCIES.indexOf(currencyCode) >= 0) {
      return String(Math.round(n));
    }
    return (Math.round(n * 100) / 100).toFixed(2);
  }

  /**
   * @param {string} currencyCode
   * @param {number} amount
   * @returns {string}
   */
  function formatWithCode(currencyCode, amount) {
    const cur = normalizeCode(currencyCode);
    const prefix = DISPLAY_CURRENCY_PREFIX[cur];
    const amountStr = formatDecimal(amount, cur);
    if (prefix) {
      if (cur === "CHF" || cur === "SEK" || cur === "NOK") {
        return prefix + " " + amountStr;
      }
      return prefix + amountStr;
    }
    return cur + " " + amountStr;
  }

  function convert(amountAud) {
    const n = Number(amountAud);
    if (!Number.isFinite(n)) {
      return 0;
    }
    if (displayCurrency === BASE_CURRENCY) {
      return ZERO_DECIMAL_CURRENCIES.indexOf(displayCurrency) >= 0
        ? Math.round(n)
        : Math.round(n * 100) / 100;
    }
    const rate = Number(rates[displayCurrency]);
    if (!Number.isFinite(rate) || rate <= 0) {
      return ZERO_DECIMAL_CURRENCIES.indexOf(displayCurrency) >= 0
        ? Math.round(n)
        : Math.round(n * 100) / 100;
    }
    const converted = n * rate;
    if (ZERO_DECIMAL_CURRENCIES.indexOf(displayCurrency) >= 0) {
      return Math.round(converted);
    }
    return Math.round(converted * 100) / 100;
  }

  /**
   * @param {number} amountAud
   * @returns {string}
   */
  function format(amountAud) {
    return formatWithCode(displayCurrency, convert(amountAud));
  }

  function currencySelectEls() {
    return [
      document.getElementById("site-display-currency"),
      document.getElementById("site-display-currency-flyout"),
    ].filter(Boolean);
  }

  function syncSelector() {
    currencySelectEls().forEach(function (sel) {
      if (sel.value !== displayCurrency) {
        sel.value = displayCurrency;
      }
    });
  }

  function syncAudPriceElements() {
    document.querySelectorAll("[data-price-aud]").forEach((el) => {
      const raw = el.getAttribute("data-price-aud");
      if (raw == null || raw === "") {
        el.textContent = "";
        return;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        el.textContent = "";
        return;
      }
      el.textContent = format(n);
    });
  }

  function bindSelector() {
    currencySelectEls().forEach(function (sel) {
      if (sel.dataset.bound === "1") {
        return;
      }
      sel.dataset.bound = "1";
      sel.value = displayCurrency;
      sel.addEventListener("change", function () {
        setDisplayCurrency(sel.value);
      });
    });
  }

  function setDisplayCurrency(code) {
    const next = normalizeCode(code);
    if (next === displayCurrency) {
      return;
    }
    displayCurrency = next;
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch (e) {}
    syncSelector();
    syncAudPriceElements();
    if (!hasRateForDisplayCurrency() && !readyPromise) {
      init();
    }
    window.dispatchEvent(
      new CustomEvent("displaycurrencychange", { detail: { currency: next } }),
    );
  }

  function getDisplayCurrency() {
    return displayCurrency;
  }

  function getBaseCurrency() {
    return BASE_CURRENCY;
  }

  function isConvertedDisplay() {
    return displayCurrency !== BASE_CURRENCY;
  }

  function hasRateForDisplayCurrency() {
    if (displayCurrency === BASE_CURRENCY) {
      return true;
    }
    const rate = Number(rates[displayCurrency]);
    return Number.isFinite(rate) && rate > 0;
  }

  async function init() {
    if (ready) {
      return;
    }
    if (readyPromise) {
      return readyPromise;
    }
    displayCurrency = detectDefaultCurrency();
    syncSelector();
    readyPromise = (async function () {
      try {
        await fetchRates();
      } catch (e) {
        rates = { AUD: 1 };
      }
      ready = true;
      syncAudPriceElements();
      window.dispatchEvent(new CustomEvent("displaycurrencyready"));
      if (isConvertedDisplay() && hasRateForDisplayCurrency()) {
        window.dispatchEvent(
          new CustomEvent("displaycurrencychange", { detail: { currency: displayCurrency } }),
        );
      }
    })();
    return readyPromise;
  }

  window.siteDisplayCurrency = {
    init,
    format,
    formatWithCode,
    convert,
    setDisplayCurrency,
    getDisplayCurrency,
    getBaseCurrency,
    isConvertedDisplay,
    hasRateForDisplayCurrency,
    SUPPORTED,
  };

  function onDomReady() {
    bindSelector();
  }

  init();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onDomReady);
  } else {
    onDomReady();
  }
})();
