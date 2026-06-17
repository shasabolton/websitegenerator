(function initNotFoundProductMatch() {
  if (window.__notFoundProductMatchBound) {
    return;
  }
  window.__notFoundProductMatchBound = true;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function legacyUrlToSitePath(legacyUrl) {
    const raw = String(legacyUrl || "").trim();
    if (!raw) {
      return "";
    }
    const normalize =
      typeof window.productData?.normalizeRedirectPath === "function"
        ? window.productData.normalizeRedirectPath.bind(window.productData)
        : (value) =>
            String(value || "")
              .trim()
              .replace(/^\/+/, "")
              .replace(/\/+$/, "")
              .toLowerCase();
    try {
      return normalize(new URL(raw).pathname);
    } catch {
      return normalize(raw);
    }
  }

  function stripGithubPagesPrefix(pathname) {
    const baseEl = document.querySelector("base[data-site-base]");
    if (!baseEl?.href) {
      return pathname;
    }
    try {
      const basePath = new URL(baseEl.href, window.location.href).pathname.replace(/\/+$/, "") || "";
      if (basePath && basePath !== "/" && pathname.toLowerCase().startsWith(basePath.toLowerCase())) {
        return pathname.slice(basePath.length) || "/";
      }
    } catch {
      /* ignore */
    }
    return pathname;
  }

  function attemptedSitePath() {
    const pd = window.productData;
    const normalize =
      typeof pd?.normalizeRedirectPath === "function"
        ? pd.normalizeRedirectPath.bind(pd)
        : (raw) =>
            String(raw || "")
              .trim()
              .replace(/^\/+/, "")
              .replace(/\/+$/, "")
              .toLowerCase();
    return normalize(stripGithubPagesPrefix(window.location.pathname));
  }

  function pathsToTryForMatch(rawPath) {
    const normalize =
      typeof window.productData?.normalizeRedirectPath === "function"
        ? window.productData.normalizeRedirectPath.bind(window.productData)
        : (value) =>
            String(value || "")
              .trim()
              .replace(/^\/+/, "")
              .replace(/\/+$/, "")
              .toLowerCase();
    const paths = [];
    const add = (value) => {
      const normalized = normalize(value);
      if (normalized && !paths.includes(normalized)) {
        paths.push(normalized);
      }
    };

    add(rawPath);
    add(rawPath.replace(/\/index\.html$/i, ""));
    add(rawPath.replace(/\.html$/i, ""));

    const stripped = rawPath
      .replace(/\/(help|tutorial|instructions?)(\/.*)?$/i, "")
      .replace(/\/+$/, "");
    if (stripped && stripped !== rawPath) {
      add(stripped);
    }

    const withoutShop = rawPath.replace(/^shop\//, "");
    if (withoutShop && withoutShop !== rawPath) {
      add(withoutShop);
      add(`shop/${withoutShop}`);
    }

    return paths;
  }

  function redirectsJsonUrl() {
    const baseEl = document.querySelector("base[data-site-base]");
    if (baseEl?.href) {
      return new URL("shared-assets/config/redirects.json", baseEl.href).href;
    }
    return new URL("shared-assets/config/redirects.json", window.location.href).href;
  }

  async function fetchRedirectsJson() {
    const response = await fetch(redirectsJsonUrl(), { cache: "no-store" });
    if (!response.ok) {
      return { entries: [] };
    }
    const data = await response.json();
    return {
      entries: Array.isArray(data?.entries) ? data.entries : [],
    };
  }

  /**
   * @param {Array<{ from?: string, to?: string, title?: string, description?: string }>} entries
   * @param {string} attemptedPath
   */
  function findContentRedirectsForAttemptedPath(entries, attemptedPath) {
    const paths = pathsToTryForMatch(attemptedPath);
    const matched = [];
    const seenTo = new Set();
    for (const path of paths) {
      for (const entry of entries) {
        const from = String(entry?.from || "")
          .trim()
          .toLowerCase();
        const to = String(entry?.to || "").trim();
        if (!from || !to || from !== path || seenTo.has(to)) {
          continue;
        }
        seenTo.add(to);
        matched.push(entry);
      }
    }
    return matched;
  }

  function buildPageLinkHtml(entry) {
    const href = escapeAttr(String(entry?.to || "").trim());
    const title = escapeHtml(String(entry?.title || entry?.to || "Page").trim() || "Page");
    const description = String(entry?.description || "").trim();
    const descriptionHtml = description
      ? `<p class="not-found-page-description">${escapeHtml(description)}</p>`
      : "";
    return `<article class="not-found-page-card">
  <h3 class="not-found-page-title"><a href="${href}">${title}</a></h3>
  ${descriptionHtml}
</article>`;
  }

  function renderPageSuggestions(entries, attemptedPath) {
    const cards = entries.map((entry) => buildPageLinkHtml(entry)).join("\n");
    const heading =
      entries.length === 1 ? "Were you looking for this page?" : "Were you looking for one of these pages?";
    const pathLabel = attemptedPath ? escapeHtml(attemptedPath) : "this page";
    return `<section class="not-found-suggestions" aria-labelledby="not-found-page-suggestions-heading">
  <h2 id="not-found-page-suggestions-heading" class="not-found-suggestions-heading">${heading}</h2>
  <p class="not-found-suggestions-path">We could not find <code>${pathLabel}</code>, but it may have moved.</p>
  <div class="not-found-page-list">
    ${cards}
  </div>
</section>`;
  }

  function pathWantsInstructions(rawPath) {
    return /help/i.test(rawPath) || /tutorial/i.test(rawPath);
  }

  function isEligibleProduct(row) {
    const pd = window.productData;
    if (!row || !pd) {
      return false;
    }
    if (typeof pd.isProductRowHidden === "function" && pd.isProductRowHidden(row)) {
      return false;
    }
    if (typeof pd.isProductRowDraft === "function" && pd.isProductRowDraft(row)) {
      return false;
    }
    return true;
  }

  /**
   * @param {object[]} products
   * @param {string} attemptedPath
   * @returns {object[]}
   */
  function findProductsForAttemptedPath(products, attemptedPath) {
    const pd = window.productData;
    if (!pd) {
      return [];
    }
    const list = Array.isArray(products) ? products : [];
    const paths = pathsToTryForMatch(attemptedPath);
    const matched = [];
    const seenSku = new Set();

    const add = (row) => {
      if (!isEligibleProduct(row)) {
        return;
      }
      const sku = String(row.SKU ?? "").trim();
      if (!sku || seenSku.has(sku)) {
        return;
      }
      seenSku.add(sku);
      matched.push(row);
    };

    for (const path of paths) {
      if (typeof pd.findProductBySlug === "function") {
        add(pd.findProductBySlug(list, path));
      }

      const slugOnly = path.replace(/^shop\//, "");
      if (slugOnly !== path && typeof pd.findProductBySlug === "function") {
        add(pd.findProductBySlug(list, slugOnly));
      }

      for (const row of list) {
        const legacyPath = legacyUrlToSitePath(row?.LEGACY_SHOP_URL);
        if (legacyPath && legacyPath === path) {
          add(row);
        }
      }
    }

    return matched;
  }

  function productHref(row, products, wantsInstructions) {
    const pd = window.productData;
    const slug =
      typeof pd.getProductSlugForRow === "function"
        ? pd.getProductSlugForRow(row, products)
        : String(row.SLUG || "").trim();
    let href = slug ? `shop/${slug}` : "shop";
    if (wantsInstructions) {
      href += "?instr=true";
    }
    return href;
  }

  function buildProductThumbHtml(row, products, wantsInstructions) {
    const pd = window.productData;
    const title =
      typeof pd.resolveProductDisplayTitle === "function"
        ? pd.resolveProductDisplayTitle(row, "Product")
        : String(row.TITLE || "Product").trim() || "Product";
    const imageRaw = String(row.IMAGE1 || "").trim();
    const imageUrl =
      typeof pd.productImageUrlForDisplay === "function"
        ? pd.productImageUrlForDisplay(imageRaw, "thumb")
        : imageRaw;
    const href = productHref(row, products, wantsInstructions);
    const priceNum = parseFloat(String(row.PRICE ?? "").trim());
    const priceAud = Number.isFinite(priceNum) && priceNum >= 0 ? String(priceNum) : "";
    const priceLabel = priceAud ? `$${priceAud}` : "";

    return `<article class="product-thumb-card">
  <a class="product-thumb-link" href="${escapeAttr(href)}">
    <img class="product-thumb-image" src="${escapeAttr(imageUrl)}" alt="${escapeAttr(title)}" loading="lazy" />
  </a>
  <h3 class="product-thumb-title">
    <a class="product-thumb-title-link" href="${escapeAttr(href)}">${escapeHtml(title)}</a>
  </h3>
  <p class="product-thumb-price" data-price-aud="${escapeAttr(priceAud)}">${escapeHtml(priceLabel)}</p>
</article>`;
  }

  function renderSuggestions(mount, products, contentEntries, attemptedPath) {
    const wantsInstructions = pathWantsInstructions(attemptedPath);
    const pageSectionHtml = contentEntries.length
      ? renderPageSuggestions(contentEntries, attemptedPath)
      : "";

    const productSectionHtml = products.length
      ? (() => {
          const cards = products
            .map((row) => buildProductThumbHtml(row, products, wantsInstructions))
            .join("\n");
          const heading =
            products.length === 1
              ? "Were you looking for this product?"
              : "Were you looking for one of these products?";
          const pathLabel = attemptedPath ? escapeHtml(attemptedPath) : "this page";
          const intro =
            contentEntries.length > 0
              ? ""
              : `<p class="not-found-suggestions-path">We could not find <code>${pathLabel}</code>, but it may have moved.</p>`;
          return `<section class="not-found-suggestions" aria-labelledby="not-found-product-suggestions-heading">
  <h2 id="not-found-product-suggestions-heading" class="not-found-suggestions-heading">${heading}</h2>
  ${intro}
  <div class="product-thumb-row not-found-product-thumb-row">
    ${cards}
  </div>
</section>`;
        })()
      : "";

    mount.innerHTML = `${pageSectionHtml}${productSectionHtml}`;

    if (typeof window.siteDisplayCurrency?.format === "function") {
      const fx = window.siteDisplayCurrency;
      const applyPrices = () => {
        mount.querySelectorAll("[data-price-aud]").forEach((el) => {
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
          el.textContent = fx.format(n);
        });
      };
      if (typeof fx.init === "function") {
        fx.init().then(applyPrices).catch(applyPrices);
      } else {
        applyPrices();
      }
    }
  }

  function renderEmpty(mount, attemptedPath) {
    const pathLabel = attemptedPath ? escapeHtml(attemptedPath) : "this page";
    mount.innerHTML = `<p class="not-found-generic">We could not find <code>${pathLabel}</code>. Try the <a href=".">shop home</a> or use search from the menu.</p>`;
  }

  async function run() {
    const mount = document.getElementById("not-found-product-suggestions");
    if (!mount) {
      return;
    }

    const attemptedPath = attemptedSitePath();
    if (!attemptedPath || attemptedPath === "404.html") {
      renderEmpty(mount, attemptedPath);
      return;
    }

    const [redirectsResult, productResult] = await Promise.allSettled([
      fetchRedirectsJson(),
      window.productData?.fetchProductDataJson?.() ?? Promise.resolve({ products: [] }),
    ]);

    const redirectEntries =
      redirectsResult.status === "fulfilled" ? redirectsResult.value.entries : [];
    const products =
      productResult.status === "fulfilled" && Array.isArray(productResult.value?.products)
        ? productResult.value.products
        : [];

    const contentEntries = findContentRedirectsForAttemptedPath(redirectEntries, attemptedPath);
    const matchedProducts = findProductsForAttemptedPath(products, attemptedPath);

    if (!contentEntries.length && !matchedProducts.length) {
      renderEmpty(mount, attemptedPath);
      return;
    }

    renderSuggestions(mount, matchedProducts, contentEntries, attemptedPath);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
