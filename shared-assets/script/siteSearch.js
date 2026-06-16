/**
 * Product search in the site header: debounced dropdown with thumbnails.
 */
(function initSiteSearch() {
  if (window.siteSearch && typeof window.siteSearch.init === "function") {
    return;
  }

  const MAX_RESULTS = 12;
  const DEBOUNCE_MS = 200;
  const FALLBACK_IMAGE = "shared-assets/images/branding/favicon.jpg";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function productImageUrl(url) {
    const resize = window.productData?.productImageUrlForDisplay;
    const trimmed = String(url || "").trim();
    if (!trimmed) {
      return FALLBACK_IMAGE;
    }
    if (typeof resize === "function") {
      return resize(trimmed, "grid");
    }
    return trimmed;
  }

  function formatResultPrice(priceAud) {
    if (priceAud == null || !Number.isFinite(priceAud) || priceAud < 0) {
      return "";
    }
    const dc = window.siteDisplayCurrency;
    if (dc && typeof dc.format === "function") {
      return dc.format(priceAud);
    }
    return `AUD$${priceAud.toFixed(2)}`;
  }

  function buildSearchEntries(products) {
    const pd = window.productData;
    if (!pd) {
      return [];
    }
    const list = Array.isArray(products) ? products : [];
    const visible =
      typeof pd.filterVisibleProducts === "function" ? pd.filterVisibleProducts(list) : list;
    const isDraft = typeof pd.isProductRowDraft === "function" ? pd.isProductRowDraft : () => false;
    const resolveTitle =
      typeof pd.resolveProductDisplayTitle === "function"
        ? pd.resolveProductDisplayTitle
        : (row) => String(row?.TITLE || "").trim();
    const getSlug =
      typeof pd.getProductSlugForRow === "function"
        ? (row) => pd.getProductSlugForRow(row, list)
        : () => "";
    const resolveCategory =
      typeof pd.resolveProductCategory === "function"
        ? pd.resolveProductCategory
        : (row) => String(row?.CATEGORY || "").trim();

    const entries = [];
    for (const row of visible) {
      if (!row || isDraft(row)) {
        continue;
      }
      const title = resolveTitle(row, "");
      const etsyTitle = String(row.TITLE || "").trim();
      const category = resolveCategory(row);
      const tags = String(row.TAGS || "")
        .replace(/_/g, " ")
        .trim();
      const slug = getSlug(row);
      if (!slug) {
        continue;
      }
      const priceNum = parseFloat(String(row.PRICE ?? "").trim());
      entries.push({
        title: title || etsyTitle || "Product",
        href: `shop/${slug}`,
        image: productImageUrl(String(row.IMAGE1 || "").trim()),
        priceAud: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null,
        haystack: `${title} ${etsyTitle} ${category} ${tags}`.toLowerCase(),
      });
    }
    return entries;
  }

  function searchEntries(entries, query) {
    const q = String(query || "")
      .trim()
      .toLowerCase();
    if (!q) {
      return [];
    }
    return entries.filter((entry) => entry.haystack.includes(q)).slice(0, MAX_RESULTS);
  }

  function closeMobileNav() {
    const header = document.querySelector(".site-header");
    const toggle = document.querySelector(".nav-toggle");
    const flyout = document.getElementById("site-nav-flyout");
    if (!header || !toggle || !flyout) {
      return;
    }
    header.classList.remove("is-nav-open");
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-label", "Open menu");
    if (window.matchMedia("(max-width: 767px)").matches) {
      flyout.setAttribute("aria-hidden", "true");
      document.body.classList.remove("nav-scroll-lock");
    }
  }

  function init() {
    const form = document.getElementById("site-search-form");
    const input = form?.querySelector("[data-site-search-input]");
    const resultsEl = document.getElementById("site-search-results");
    if (!form || !input || !resultsEl) {
      return;
    }

    let entries = [];
    let activeResults = [];
    let activeIndex = -1;
    let debounceTimer = null;
    let catalogPromise = null;

    function loadCatalog() {
      if (entries.length) {
        return Promise.resolve(entries);
      }
      if (catalogPromise) {
        return catalogPromise;
      }
      const pd = window.productData;
      if (!pd || typeof pd.fetchProductDataJson !== "function") {
        return Promise.resolve([]);
      }
      catalogPromise = pd
        .fetchProductDataJson()
        .then((data) => {
          entries = buildSearchEntries((data && data.products) || []);
          return entries;
        })
        .catch(() => {
          entries = [];
          catalogPromise = null;
          return entries;
        });
      return catalogPromise;
    }

    function setOpen(open) {
      input.setAttribute("aria-expanded", open ? "true" : "false");
      resultsEl.hidden = !open;
    }

    function renderResults(rows) {
      activeResults = rows;
      activeIndex = -1;
      resultsEl.replaceChildren();

      if (!String(input.value || "").trim()) {
        setOpen(false);
        return;
      }

      setOpen(true);

      if (!rows.length) {
        const empty = document.createElement("p");
        empty.className = "site-search-empty";
        empty.textContent = "No products found.";
        resultsEl.appendChild(empty);
        return;
      }

      const list = document.createElement("ul");
      list.className = "site-search-result-list";

      rows.forEach((row, index) => {
        const li = document.createElement("li");
        li.className = "site-search-result-item";
        li.setAttribute("role", "option");
        li.id = `site-search-option-${index}`;

        const link = document.createElement("a");
        link.className = "site-search-result-link";
        link.href = row.href;
        link.innerHTML = `
          <img class="site-search-result-image" src="${escapeHtml(row.image)}" alt="" loading="lazy" />
          <span class="site-search-result-text">
            <span class="site-search-result-title">${escapeHtml(row.title)}</span>
            <span class="site-search-result-price" data-price-aud="${row.priceAud != null ? escapeHtml(String(row.priceAud)) : ""}">${escapeHtml(formatResultPrice(row.priceAud))}</span>
          </span>
        `;
        link.addEventListener("click", () => {
          closeMobileNav();
          setOpen(false);
        });

        li.appendChild(link);
        list.appendChild(li);
      });

      resultsEl.appendChild(list);
    }

    function highlightActive() {
      const items = resultsEl.querySelectorAll(".site-search-result-item");
      items.forEach((item, index) => {
        item.classList.toggle("is-active", index === activeIndex);
        if (index === activeIndex) {
          input.setAttribute("aria-activedescendant", item.id);
        }
      });
      if (activeIndex < 0) {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function navigateToActive() {
      if (activeIndex < 0 || activeIndex >= activeResults.length) {
        return false;
      }
      const href = activeResults[activeIndex].href;
      closeMobileNav();
      setOpen(false);
      window.location.assign(href);
      return true;
    }

    function runSearch() {
      const rows = searchEntries(entries, input.value);
      renderResults(rows);
    }

    function scheduleSearch() {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(runSearch, DEBOUNCE_MS);
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      loadCatalog().then(() => {
        runSearch();
        if (!navigateToActive() && activeResults.length === 1) {
          closeMobileNav();
          setOpen(false);
          window.location.assign(activeResults[0].href);
        }
      });
    });

    input.addEventListener("input", () => {
      loadCatalog().then(scheduleSearch);
    });

    input.addEventListener("focus", () => {
      loadCatalog().then(() => {
        if (String(input.value || "").trim()) {
          runSearch();
        }
      });
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!activeResults.length) {
          return;
        }
        activeIndex = Math.min(activeIndex + 1, activeResults.length - 1);
        highlightActive();
        setOpen(true);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!activeResults.length) {
          return;
        }
        activeIndex = Math.max(activeIndex - 1, 0);
        highlightActive();
        setOpen(true);
        return;
      }
      if (event.key === "Enter" && activeIndex >= 0) {
        event.preventDefault();
        navigateToActive();
        return;
      }
      if (event.key === "Escape") {
        setOpen(false);
        input.removeAttribute("aria-activedescendant");
      }
    });

    document.addEventListener("click", (event) => {
      const wrap = form.closest(".site-search-wrap");
      if (wrap && !wrap.contains(event.target)) {
        setOpen(false);
        activeIndex = -1;
        highlightActive();
      }
    });

    window.addEventListener("displaycurrencychange", () => {
      resultsEl.querySelectorAll("[data-price-aud]").forEach((el) => {
        const raw = el.getAttribute("data-price-aud");
        if (raw == null || raw === "") {
          el.textContent = "";
          return;
        }
        const n = Number(raw);
        el.textContent = formatResultPrice(Number.isFinite(n) ? n : null);
      });
    });
  }

  window.siteSearch = { init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
