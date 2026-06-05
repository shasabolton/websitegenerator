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
  const currency = String(row.CURRENCY_CODE || "")
    .trim()
    .toUpperCase();
  const priceNum = parseFloat(String(row.PRICE ?? "").trim());
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    return "";
  }
  if (!/^[A-Z]{3}$/.test(currency)) {
    return escapeHtml(`${String(row.PRICE ?? "").trim()} ${currency}`.trim());
  }
  try {
    return escapeHtml(
      new Intl.NumberFormat(undefined, { style: "currency", currency }).format(priceNum),
    );
  } catch {
    return escapeHtml(`${currency} ${priceNum}`);
  }
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
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
        const safeUrl = escapeHtml(item.url);
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
        const safeUrl = escapeHtml(item.url);
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
 * @param {{ title: string, description: string, embedUrl: string, watchUrl: string, thumbnailUrl: string }} p
 */
function buildVideoObjectJsonLdScript(p) {
  const name = String(p.title || "").trim().slice(0, 200) || "Product video";
  const description = String(p.description || "").trim().slice(0, 5000);
  const obj = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name,
    description: description || name,
    thumbnailUrl: [p.thumbnailUrl],
    embedUrl: p.embedUrl,
    url: p.watchUrl,
  };
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, "\\u003c")}</script>`;
}

/**
 * @param {CarouselItem[]} items
 * @param {string} productTitleRaw
 * @param {string} carouselPartial
 * @param {{ watchUrl: string } | null} youtubeMeta
 */
async function buildImageCarouselHtml(items, productTitleRaw, carouselPartial, youtubeMeta) {
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
  const carouselInner = applyTemplate(carouselPartial, {
    CAROUSEL_ID: escapeHtml(id),
    CAROUSEL_SLIDES: slides,
    CAROUSEL_THUMB_ITEMS: thumbs,
  });
  if (!youtubeMeta?.watchUrl) {
    return carouselInner;
  }
  const w = escapeHtml(youtubeMeta.watchUrl);
  const crawl = `<p class="product-video-youtube-link"><a href="${w}" rel="noopener noreferrer">Watch this product video on YouTube</a></p>`;
  return `${carouselInner}\n${crawl}`;
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

  const categoryName = String(row.CATEGORY || "").trim();
  const categorySlugResolved = slugify(categoryName);
  const title = String(row.TITLE || "Untitled Product").trim() || "Untitled Product";
  const description = String(row.DESCRIPTION || "").trim();
  const titleEsc = escapeHtml(title);
  const images = window.productData.collectProductImageUrls(row);
  const primaryVideoUrl = resolveProductPrimaryVideoUrl(row);
  const youtubeId = parseYoutubeVideoId(primaryVideoUrl);
  /** @type {CarouselItem[]} */
  const carouselItems = images.map((url) => ({ kind: "image", url }));
  let youtubeMetaForLd = null;
  if (youtubeId) {
    const watchUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
    const embedUrl = `https://www.youtube.com/embed/${youtubeId}`;
    const thumbUrl = `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
    const videoItem = { kind: "video", videoId: youtubeId, watchUrl, embedUrl, thumbUrl };
    youtubeMetaForLd = { watchUrl, embedUrl, thumbnailUrl: thumbUrl };
    if (carouselItems.length > 0) {
      carouselItems.splice(1, 0, videoItem);
    } else {
      carouselItems.push(videoItem);
    }
  }

  const carouselHtml = await buildImageCarouselHtml(
    carouselItems,
    title,
    carouselPartial,
    youtubeMetaForLd ? { watchUrl: youtubeMetaForLd.watchUrl } : null,
  );
  const videoJsonLd = youtubeMetaForLd
    ? buildVideoObjectJsonLdScript({
        title,
        description,
        embedUrl: youtubeMetaForLd.embedUrl,
        watchUrl: youtubeMetaForLd.watchUrl,
        thumbnailUrl: youtubeMetaForLd.thumbnailUrl,
      })
    : "";

  const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="shop/">Shop</a>
      <span class="breadcrumbs-sep" aria-hidden="true">&rsaquo;</span>
      <a href="shop/${escapeHtml(categorySlugResolved)}">${escapeHtml(categoryName)}</a>
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
    PRODUCT_CAROUSEL: carouselHtml,
    PRODUCT_VIDEO_JSON_LD: videoJsonLd || "",
    PRODUCT_SKU_ESC: escapeHtml(sku),
    PRODUCT_VARIATIONS_HTML: variationsHtml,
    PRODUCT_CART_BOOTSTRAP_JSON: bootstrapJson,
  });

  const categories = window.productData.getProductsByCategory(products);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  return {
    bodyHtml,
    categoryNames: categories.map((c) => c.name),
    pageTitle: `${shopNameEsc} - ${titleEsc}`,
  };
}

window.generateProductBody = {
  generateProductBody,
  parseYoutubeVideoId,
  buildImageCarouselHtml,
  buildCarouselSlidesHtml,
  buildCarouselThumbsHtml,
};
