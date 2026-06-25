function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {object} row - Product row from productData (expects PRICE, CURRENCY_CODE).
 * @returns {string} HTML-safe formatted price, or empty string when not displayable.
 */
function formatProductPriceDisplay(row) {
  const currency = String(row.CURRENCY_CODE || "AUD")
    .trim()
    .toUpperCase();
  const priceNum = parseFloat(String(row.PRICE ?? "").trim());
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return "";
  }
  const dc = window.siteDisplayCurrency;
  if (dc && typeof dc.formatWithCode === "function") {
    return escapeHtml(dc.formatWithCode(currency, priceNum));
  }
  const prefixes = {
    AUD: "AUD$",
    NZD: "NZD$",
    USD: "USD$",
    CAD: "CAD$",
    GBP: "GBP£",
    EUR: "EUR€",
    JPY: "JPY¥",
    SGD: "SGD$",
    HKD: "HKD$",
    CHF: "CHF ",
    SEK: "SEK ",
    NOK: "NOK ",
  };
  const prefix = prefixes[currency];
  if (prefix) {
    const amountStr = currency === "JPY" ? String(Math.round(priceNum)) : priceNum.toFixed(2);
    return escapeHtml(prefix + amountStr);
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return escapeHtml(`${String(row.PRICE ?? "").trim()} ${currency}`.trim());
  }
  return escapeHtml(`${currency} ${priceNum.toFixed(2)}`);
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
}

function productDisplayImageUrl(url, size) {
  const resize = window.productData?.productImageUrlForDisplay;
  if (typeof resize === "function") {
    return resize(url, size);
  }
  return String(url || "").trim();
}

function buildProductThumbsHtml(productThumbTemplate, products) {
  return products
    .map((product) => {
      const priceAud = product.priceAud;
      const priceDisplay =
        product.priceRow && typeof formatProductPriceDisplay === "function"
          ? formatProductPriceDisplay(product.priceRow)
          : priceAud != null
            ? escapeHtml(`AUD$${priceAud.toFixed(2)}`)
            : "";
      const priceAudAttr = priceAud != null ? escapeHtml(String(priceAud)) : "";
      const imageUrl =
        product.image && product.image !== "shared-assets/images/branding/favicon.jpg"
          ? productDisplayImageUrl(product.image, "grid")
          : product.image || "shared-assets/images/branding/favicon.jpg";
      return applyTemplate(productThumbTemplate, {
        PRODUCT_HREF: escapeHtml(product.href || "shop"),
        PRODUCT_IMAGE_URL: escapeHtml(imageUrl),
        PRODUCT_TITLE: escapeHtml(product.title),
        PRODUCT_PRICE: priceDisplay,
        PRODUCT_PRICE_AUD: priceAudAttr,
      });
    })
    .join("");
}

function normalizeProductSlugKey(raw) {
  const pd = window.productData;
  const segment = String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/^shop\//, "");
  if (pd && typeof pd.normalizeRedirectPath === "function") {
    return pd.normalizeRedirectPath(segment);
  }
  return segment.toLowerCase().replace(/\/+$/, "");
}

function thumbProductFromRow(row, products) {
  const pd = window.productData;
  const resolveTitle = pd?.resolveProductDisplayTitle;
  const getSlug = pd?.getProductSlugForRow;
  const title =
    typeof resolveTitle === "function" ? resolveTitle(row) : String(row.TITLE || "").trim() || "Product";
  const image = String(row.IMAGE1 || "").trim();
  const slug =
    typeof getSlug === "function" ? getSlug(row, products) : slugify(title) || "product";
  const priceNum = parseFloat(String(row.PRICE ?? "").trim());
  return {
    title,
    image,
    href: `shop/${slug}`,
    priceAud: Number.isFinite(priceNum) && priceNum >= 0 ? priceNum : null,
    priceRow: { PRICE: row.PRICE, CURRENCY_CODE: row.CURRENCY_CODE },
  };
}

/**
 * @param {object[]} products
 * @param {string[]} slugs
 */
function resolveThumbProductsBySlugs(products, slugs) {
  const pd = window.productData;
  if (pd && typeof pd.resolveThumbProductsBySlugs === "function") {
    return pd.resolveThumbProductsBySlugs(products, slugs);
  }
  const filter = pd?.filterVisibleProducts;
  const find = pd?.findProductBySlug;
  const list = typeof filter === "function" ? filter(products) : Array.isArray(products) ? products : [];
  const slugList = Array.isArray(slugs) ? slugs : [];
  const out = [];
  const seen = new Set();
  for (const raw of slugList) {
    const key = normalizeProductSlugKey(raw);
    if (!key || seen.has(key)) {
      continue;
    }
    const row = typeof find === "function" ? find(list, key) : null;
    if (!row) {
      continue;
    }
    seen.add(key);
    out.push(thumbProductFromRow(row, list));
  }
  return out;
}

/**
 * @param {object[]} products
 * @param {string[]} slugs
 * @param {string} productThumbTemplate
 * @param {string} productThumbRowTemplate
 */
function buildProductThumbRowHtml(products, slugs, productThumbTemplate, productThumbRowTemplate) {
  const thumbProducts = resolveThumbProductsBySlugs(products, slugs);
  if (!thumbProducts.length || !productThumbTemplate || !productThumbRowTemplate) {
    return "";
  }
  const thumbsHtml = buildProductThumbsHtml(productThumbTemplate, thumbProducts);
  return applyTemplate(productThumbRowTemplate, {
    PRODUCT_THUMBS: thumbsHtml,
  });
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Primary demo video URL from catalog row (`VIDEO1` or legacy `video01`). */
function resolveProductPrimaryVideoUrl(row) {
  const a = String(row.VIDEO1 ?? row.video01 ?? "").trim();
  if (a) {
    return a;
  }
  return String(row.VIDEO_1 ?? "").trim();
}

/**
 * @param {string} raw
 * @returns {string | null} YouTube video id
 */
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
    return null;
  }
  return null;
}

/**
 * @typedef {{ kind: 'image', url: string } | { kind: 'video', videoId: string, watchUrl: string, embedUrl: string, thumbUrl: string }} CarouselItem
 */

/**
 * @param {CarouselItem[]} items
 * @param {string} productTitleRaw
 */
function buildCarouselSlidesHtml(items, productTitleRaw) {
  const altBase = productTitleRaw || "Product";
  const n = items.length;
  return items
    .map((item, index) => {
      const active = index === 0 ? " is-active" : "";
      const hidden = index === 0 ? 'aria-hidden="false"' : 'aria-hidden="true"';
      const ix = index + 1;
      if (item.kind === "image") {
        const safeUrl = escapeHtml(productDisplayImageUrl(item.url, "hero"));
        const altRaw = String(item.alt || "").trim();
        const alt = escapeHtml(altRaw || `${altBase} — image ${ix} of ${n}`);
        const loading = index === 0 ? "eager" : "lazy";
        const fetchPriority = index === 0 ? ' fetchpriority="high"' : "";
        return `<figure class="image-carousel-slide${active}" data-carousel-index="${index}" data-carousel-slide-kind="image" ${hidden}>
  <img class="image-carousel-slide-img" src="${safeUrl}" alt="${alt}" loading="${loading}"${fetchPriority} />
</figure>`;
      }
      const videoTitle = escapeHtml(`${altBase} — product video`);
      const embedSrc = escapeHtml(`${item.embedUrl}?rel=0`);
      return `<figure class="image-carousel-slide image-carousel-slide--video${active}" data-carousel-index="${index}" data-carousel-slide-kind="video" ${hidden}>
  <div class="image-carousel-video-wrap">
    <iframe class="image-carousel-embed" title="${videoTitle}" width="560" height="315" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy" data-embed-src="${embedSrc}"></iframe>
  </div>
</figure>`;
    })
    .join("\n");
}

function parseVariationValuesCell(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * @param {object} row - Product row from productData.json
 * @returns {{ name: string, values: string[], deltas: number[] }[]}
 */
function collectVariationAxesWithDeltas(row) {
  const axes = [];
  for (let i = 1; i <= 2; i += 1) {
    const name = String(row[`VARIATION ${i} NAME`] || "").trim();
    const values = parseVariationValuesCell(row[`VARIATION ${i} VALUES`]);
    if (!name || values.length === 0) {
      continue;
    }
    const parts = String(row[`VARIATION ${i} PRICE DELTA`] ?? "").split(",");
    const deltas = values.map((_, idx) => {
      const n = parseFloat(String(parts[idx] ?? "").trim());
      return Number.isFinite(n) ? n : 0;
    });
    axes.push({ name, values, deltas });
  }
  return axes;
}

/**
 * @param {{ name: string, values: string[] }[]} axes
 */
function buildProductVariationsHtml(axes) {
  if (!axes.length) {
    return "";
  }
  const fields = axes
    .map((axis, idx) => {
      const n = idx + 1;
      const id = `product-variation-${n}`;
      const label = escapeHtml(axis.name);
      const opts = axis.values
        .map((v, i) => {
          const escV = escapeHtml(v);
          const selected = i === 0 ? " selected" : "";
          return `<option value="${escV}"${selected}>${escV}</option>`;
        })
        .join("");
      return `<div class="product-variation-field">
  <label class="product-variation-label" for="${id}">${label}</label>
  <select id="${id}" class="product-variation-select" aria-label="${label}">
    ${opts}
  </select>
</div>`;
    })
    .join("\n");
  return `<div class="product-variations" role="group" aria-label="Options">${fields}</div>`;
}

/**
 * @param {CarouselItem[]} items
 * @param {string} productTitleRaw
 */
function buildCarouselThumbsHtml(items, productTitleRaw) {
  const labelBase = productTitleRaw || "Product";
  const n = items.length;
  return items
    .map((item, index) => {
      const active = index === 0 ? " is-active" : "";
      const ariaCurrent = index === 0 ? ' aria-current="true"' : ' aria-current="false"';
      const ix = index + 1;
      if (item.kind === "image") {
        const safeUrl = escapeHtml(productDisplayImageUrl(item.url, "thumb"));
        const label = escapeHtml(`Show ${labelBase} image ${ix} of ${n}`);
        return `<li class="image-carousel-thumb-item">
  <button type="button" class="image-carousel-thumb${active}" data-carousel-index="${index}" aria-label="${label}"${ariaCurrent}>
    <img class="image-carousel-thumb-img" src="${safeUrl}" alt="" width="72" height="72" loading="eager" decoding="sync" />
  </button>
</li>`;
      }
      const safeThumb = escapeHtml(item.thumbUrl);
      const label = escapeHtml(`Show ${labelBase} YouTube video (${ix} of ${n})`);
      const videoBtnClass = `image-carousel-thumb image-carousel-thumb--video${active}`;
      return `<li class="image-carousel-thumb-item">
  <button type="button" class="${videoBtnClass}" data-carousel-index="${index}" aria-label="${label}"${ariaCurrent}>
    <img class="image-carousel-thumb-img" src="${safeThumb}" alt="" width="72" height="72" loading="eager" decoding="sync" />
  </button>
</li>`;
    })
    .join("\n");
}

/**
 * @param {CarouselItem[]} items
 * @param {string} productTitleRaw
 * @param {string} carouselPartial
 */
async function buildImageCarouselHtml(items, productTitleRaw, carouselPartial) {
  if (!Array.isArray(items) || items.length === 0) {
    return "";
  }
  const id =
    "carousel-" +
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Math.random().toString(36).slice(2, 10);
  const slides = buildCarouselSlidesHtml(items, productTitleRaw);
  const thumbs = buildCarouselThumbsHtml(items, productTitleRaw);
  return applyTemplate(carouselPartial, {
    CAROUSEL_ID: escapeHtml(id),
    CAROUSEL_SLIDES: slides,
    CAROUSEL_THUMB_ITEMS: thumbs,
  });
}

/**
 * @param {unknown} links
 * @returns {Promise<string>}
 */
async function buildProductLinksHtml(links) {
  const sanitize = window.productData?.sanitizeProductLinksForSave;
  const items = typeof sanitize === "function" ? sanitize(links) : [];
  if (!items.length) {
    return "";
  }
  const renderBlock = window.contentBlocks?.renderBlock;
  if (typeof renderBlock !== "function") {
    return "";
  }
  return renderBlock({ type: "buttons", buttons: items }, { lenient: true });
}

/**
 * @param {{ shopData: object, navigationConfig: object, products: object[], catalogProducts?: object[], productSlug: string }} ctx
 * @returns {Promise<{ bodyHtml: string, categoryNames: string[], pageTitle: string }>}
 */
async function generateProductBody(ctx) {
  const fetchText = window.generateAnyPage.fetchText;
  const { products, shopData, productSlug, catalogProducts } = ctx;
  const catalog = Array.isArray(catalogProducts) ? catalogProducts : products;
  const find = window.productData.findProductBySlug;
  if (typeof find !== "function") {
    throw new Error("productData.findProductBySlug is required for product pages.");
  }
  const row = find(catalog, productSlug);
  if (!row || !products.includes(row)) {
    throw new Error(`Product not found: shop/${productSlug}`);
  }

  const [productBodyTemplate, carouselPartial] = await Promise.all([
    fetchText("./templates/partials/productBody.html"),
    fetchText("./templates/partials/imageCarousel.html"),
  ]);

  const categoryName = window.productData.resolveProductCategory(row);
  const categorySlugResolved = slugify(categoryName);
  const title = window.productData.resolveProductDisplayTitle(row);
  const description = String(row.DESCRIPTION || "").trim();
  const titleEsc = escapeHtml(title);
  const images = window.productData.collectProductImageUrls(row);
  const primaryVideoUrl = resolveProductPrimaryVideoUrl(row);
  const youtubeId = parseYoutubeVideoId(primaryVideoUrl);
  /** @type {CarouselItem[]} */
  const carouselItems = images.map((url) => ({ kind: "image", url }));
  if (youtubeId) {
    const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}`;
    const thumbUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    const videoItem = { kind: "video", videoId: youtubeId, watchUrl, embedUrl, thumbUrl };
    if (carouselItems.length > 0) {
      carouselItems.splice(1, 0, videoItem);
    } else {
      carouselItems.push(videoItem);
    }
  }

  const carouselHtml = await buildImageCarouselHtml(carouselItems, title, carouselPartial);
  const linksHtml = await buildProductLinksHtml(row.LINKS);
  const homePageHref = ctx.homePageHref ?? null;
  const shopLandingHref = escapeHtml(
    window.homePage?.resolvePublicHref
      ? window.homePage.resolvePublicHref(homePageHref || "shop", homePageHref)
      : "shop"
  );
  const categoryHref = escapeHtml(
    window.homePage?.resolvePublicHref
      ? window.homePage.resolvePublicHref(`shop/${categorySlugResolved}`, homePageHref)
      : `shop/${categorySlugResolved}`
  );
  const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${shopLandingHref}">Shop</a>
      <span class="breadcrumbs-sep" aria-hidden="true">&rsaquo;</span>
      <a href="${categoryHref}">${escapeHtml(categoryName)}</a>
      <span class="breadcrumbs-sep" aria-hidden="true">&rsaquo;</span>
      <span>${titleEsc}</span>
    </nav>
  `;

  const sku = String(row.SKU || "").trim();
  const variationAxes =
    typeof window.productData?.variationAxesFromRow === "function"
      ? window.productData.variationAxesFromRow(row)
      : collectVariationAxesWithDeltas(row);
  const variationsHtml = buildProductVariationsHtml(variationAxes);
  let basePrice = parseFloat(String(row.PRICE ?? "0"));
  if (!Number.isFinite(basePrice) || basePrice < 0) {
    basePrice = 0;
  }
  let currencyCode = String(row.CURRENCY_CODE || "AUD")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) {
    currencyCode = "AUD";
  }
  const pathSegment =
    typeof window.productData.getProductSlugForRow === "function"
      ? window.productData.getProductSlugForRow(row, catalog)
      : slugify(title);
  const cartBootstrap = {
    sku,
    productPath: `shop/${pathSegment}`,
    basePrice,
    currencyCode,
    variations: variationAxes.map((a) => ({
      name: a.name,
      values: a.values,
      deltas: a.deltas,
    })),
  };
  const bootstrapJson = JSON.stringify(cartBootstrap);
  const productPriceDisplay = formatProductPriceDisplay(row);
  const bodyHtml = applyTemplate(productBodyTemplate, {
    BREADCRUMBS: breadcrumbsHtml,
    PRODUCT_TITLE: titleEsc,
    PRODUCT_PRICE: productPriceDisplay,
    PRODUCT_DESCRIPTION: escapeHtml(description),
    PRODUCT_LINKS_HTML: linksHtml,
    PRODUCT_CAROUSEL: carouselHtml,
    PRODUCT_SKU_ESC: escapeHtml(sku),
    PRODUCT_VARIATIONS_HTML: variationsHtml,
    PRODUCT_CART_BOOTSTRAP_JSON: bootstrapJson,
  });

  const categories = window.productData.getProductsByCategory(products);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  const stripHtml = window.structuredData?.stripHtml;
  const truncateText = window.structuredData?.truncateText;
  const plainDescription = typeof stripHtml === "function" ? stripHtml(description) : description;
  const metaDescription =
    typeof truncateText === "function" ? truncateText(plainDescription, 160) : plainDescription;
  const ogImage = images[0] || "";
  return {
    bodyHtml,
    categoryNames: categories.map((c) => c.name),
    pageTitle: `${shopNameEsc} - ${titleEsc}`,
    seoContext: {
      metaDescription,
      ogImage,
      productRow: row,
      catalogProducts: catalog,
      categoryName,
    },
  };
}

window.generateProductBody = {
  generateProductBody,
  formatProductPriceDisplay,
  buildProductThumbsHtml,
  buildProductThumbRowHtml,
  resolveThumbProductsBySlugs,
  parseYoutubeVideoId,
  buildImageCarouselHtml,
  buildCarouselSlidesHtml,
  buildCarouselThumbsHtml,
};
