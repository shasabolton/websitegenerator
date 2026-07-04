/**
 * Google Analytics 4 e-commerce events. Requires gtag from the GA4 head snippet.
 * Safe to load when analytics is disabled — all calls no-op if gtag is missing.
 */
(function initSiteAnalytics() {
  if (window.siteAnalytics) {
    return;
  }

  var UTM_STORAGE_KEY = "site-analytics-utm";

  function gtagSafe() {
    return typeof window.gtag === "function" ? window.gtag : null;
  }

  function persistUtmParams() {
    try {
      var params = new URLSearchParams(window.location.search);
      var keys = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
      var stored = {};
      var hasAny = false;
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var v = String(params.get(k) || "").trim();
        if (v) {
          stored[k] = v;
          hasAny = true;
        }
      }
      if (hasAny) {
        sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(stored));
      }
    } catch (e) {}
  }

  function readStoredUtms() {
    try {
      var raw = sessionStorage.getItem(UTM_STORAGE_KEY);
      if (!raw) {
        return {};
      }
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function lineToGaItem(line) {
    var sku = String(line.sku || "").trim();
    var title = String(line.title || "Item").trim() || "Item";
    var qty = Math.max(1, Math.floor(Number(line.quantity)) || 1);
    var price = Number(line.unitPrice);
    if (!Number.isFinite(price) || price < 0) {
      price = 0;
    }
    return {
      item_id: sku || undefined,
      item_name: title,
      price: price,
      quantity: qty,
    };
  }

  function linesToGaItems(lines) {
    var out = [];
    var list = Array.isArray(lines) ? lines : [];
    for (var i = 0; i < list.length; i++) {
      out.push(lineToGaItem(list[i]));
    }
    return out;
  }

  function eventParams(extra) {
    var utms = readStoredUtms();
    var base = {};
    if (utms.utm_source) {
      base.campaign_source = utms.utm_source;
    }
    if (utms.utm_medium) {
      base.campaign_medium = utms.utm_medium;
    }
    if (utms.utm_campaign) {
      base.campaign_name = utms.utm_campaign;
    }
    if (utms.utm_content) {
      base.campaign_content = utms.utm_content;
    }
    if (utms.utm_term) {
      base.campaign_term = utms.utm_term;
    }
    if (extra && typeof extra === "object") {
      for (var key in extra) {
        if (Object.prototype.hasOwnProperty.call(extra, key)) {
          base[key] = extra[key];
        }
      }
    }
    return base;
  }

  persistUtmParams();

  window.siteAnalytics = {
    addToCart: function (line) {
      var g = gtagSafe();
      if (!g || !line) {
        return;
      }
      var item = lineToGaItem(line);
      var value = item.price * item.quantity;
      g(
        "event",
        "add_to_cart",
        eventParams({
          currency: "AUD",
          value: value,
          items: [item],
        }),
      );
    },

    beginCheckout: function (lines, value) {
      var g = gtagSafe();
      if (!g) {
        return;
      }
      var n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        n = 0;
      }
      g(
        "event",
        "begin_checkout",
        eventParams({
          currency: "AUD",
          value: n,
          items: linesToGaItems(lines),
        }),
      );
    },

    purchase: function (transactionId, value, lines) {
      var g = gtagSafe();
      if (!g) {
        return;
      }
      var n = Number(value);
      if (!Number.isFinite(n) || n < 0) {
        n = 0;
      }
      g(
        "event",
        "purchase",
        eventParams({
          transaction_id: String(transactionId || "").trim() || undefined,
          currency: "AUD",
          value: n,
          items: linesToGaItems(lines),
        }),
      );
    },
  };
})();
