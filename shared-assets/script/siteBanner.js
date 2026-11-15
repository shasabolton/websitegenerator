/**
 * Fills #site-banner from shared-assets/config/banner.json.
 * The slot is empty until a sale is turned on in the site generator.
 */
(function initSiteBanner() {
  if (window.siteBanner) {
    return;
  }

  const THEMES = new Set(["brass", "christmas", "halloween"]);

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

  async function loadJson(fileName) {
    const url = configJsonUrl(fileName);
    if (!url) {
      throw new Error("Missing config URL");
    }
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load ${fileName} (${response.status})`);
    }
    return response.json();
  }

  function codeIsActive(discountConfig, code) {
    const want = String(code || "").trim().toUpperCase();
    if (!want) {
      return false;
    }
    const codes = Array.isArray(discountConfig?.codes) ? discountConfig.codes : [];
    return codes.some(
      (entry) =>
        entry &&
        entry.active !== false &&
        String(entry.code ?? "").trim().toUpperCase() === want,
    );
  }

  function bannerIsCurrent(banner) {
    if (!banner || banner.enabled !== true) {
      return false;
    }
    const message = String(banner.message || "").trim();
    if (!message) {
      return false;
    }
    const theme = String(banner.theme || "").trim().toLowerCase();
    if (!THEMES.has(theme)) {
      return false;
    }
    const code = String(banner.code || "").trim();
    if (!code) {
      return false;
    }
    const endsRaw = String(banner.endsAt || "").trim();
    if (endsRaw) {
      const ends = Date.parse(endsRaw);
      if (Number.isFinite(ends) && Date.now() > ends) {
        return false;
      }
    }
    return true;
  }

  function render(banner) {
    const el = document.getElementById("site-banner");
    if (!el) {
      return;
    }
    const theme = String(banner.theme || "brass").trim().toLowerCase();
    const message = String(banner.message || "").trim();
    el.className = `site-banner site-banner--${theme}`;
    el.replaceChildren();
    const text = document.createElement("p");
    text.className = "site-banner-text";
    text.textContent = message;
    el.appendChild(text);
    el.hidden = false;
  }

  async function mount() {
    const el = document.getElementById("site-banner");
    if (!el) {
      return;
    }
    try {
      const banner = await loadJson("banner.json");
      if (!bannerIsCurrent(banner)) {
        return;
      }
      try {
        const discounts = await loadJson("discountCodes.json");
        if (!codeIsActive(discounts, banner.code)) {
          return;
        }
      } catch {
        /* Show the banner if the code list cannot be loaded. */
      }
      render(banner);
    } catch {
      /* Leave the slot hidden. */
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.siteBanner = { mount };
})();
