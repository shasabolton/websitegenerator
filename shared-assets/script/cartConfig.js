/**
 * Runtime fetch for cart-related JSON config (shipping rates, discount codes).
 * Resolved against site base href, same pattern as productData.json.
 */
(function initCartConfig() {
  if (window.cartConfig && typeof window.cartConfig.fetchShippingRates === "function") {
    return;
  }

  const DEFAULT_SHIPPING = { version: 0, currency: "AUD", rates: [] };
  const DEFAULT_DISCOUNT = { version: 0, currency: "AUD", codes: [] };

  /**
   * @param {string} fileName - e.g. shippingRates.json
   * @returns {string}
   */
  function configJsonUrl(fileName) {
    const file = String(fileName || "").trim();
    if (!file) {
      return "";
    }
    if (/\/tools\/siteGenerator\//i.test(window.location.pathname)) {
      return new URL(`../../shared-assets/config/${file}`, window.location.href).href;
    }
    const baseEl = document.querySelector("base[data-site-base]");
    if (baseEl?.href) {
      return new URL(`shared-assets/config/${file}`, baseEl.href).href;
    }
    return new URL(`../../shared-assets/config/${file}`, window.location.href).href;
  }

  /**
   * @param {string} fileName
   * @param {object} fallback
   * @returns {Promise<object>}
   */
  async function fetchConfigJson(fileName, fallback) {
    const url = configJsonUrl(fileName);
    if (!url) {
      return fallback;
    }
    try {
      const data =
        typeof window.githubAuth?.loadJson === "function"
          ? await window.githubAuth.loadJson(url)
          : await (async () => {
              const response = await fetch(url, { cache: "no-store" });
              if (!response.ok) {
                throw new Error(`Failed to load ${fileName} (${response.status})`);
              }
              return response.json();
            })();
      return data && typeof data === "object" ? data : fallback;
    } catch {
      return fallback;
    }
  }

  function fetchShippingRates() {
    return fetchConfigJson("shippingRates.json", DEFAULT_SHIPPING);
  }

  function fetchDiscountCodes() {
    return fetchConfigJson("discountCodes.json", DEFAULT_DISCOUNT);
  }

  window.cartConfig = {
    configJsonUrl,
    fetchShippingRates,
    fetchDiscountCodes,
  };
})();
