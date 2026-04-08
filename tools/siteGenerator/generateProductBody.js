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

function buildCarouselSlidesHtml(images, productTitleRaw) {
  const altBase = productTitleRaw || "Product";
  return images
    .map((url, index) => {
      const safeUrl = escapeHtml(url);
      const alt = escapeHtml(`${altBase} — image ${index + 1} of ${images.length}`);
      const active = index === 0 ? " is-active" : "";
      const loading = index === 0 ? "eager" : "lazy";
      const fetchPriority = index === 0 ? ' fetchpriority="high"' : "";
      const hidden = index === 0 ? 'aria-hidden="false"' : 'aria-hidden="true"';
      return `<figure class="image-carousel-slide${active}" data-carousel-index="${index}" ${hidden}>
  <img class="image-carousel-slide-img" src="${safeUrl}" alt="${alt}" loading="${loading}"${fetchPriority} />
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
 * @returns {{ name: string, values: string[] }[]}
 */
function collectVariationAxes(row) {
  const axes = [];
  for (let i = 1; i <= 2; i += 1) {
    const name = String(row[`VARIATION ${i} NAME`] || "").trim();
    const values = parseVariationValuesCell(row[`VARIATION ${i} VALUES`]);
    if (name && values.length > 0) {
      axes.push({ name, values });
    }
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

function buildCarouselThumbsHtml(images, productTitleRaw) {
  const labelBase = productTitleRaw || "Product";
  return images
    .map((url, index) => {
      const safeUrl = escapeHtml(url);
      const active = index === 0 ? " is-active" : "";
      const ariaCurrent = index === 0 ? ' aria-current="true"' : ' aria-current="false"';
      const label = escapeHtml(`Show ${labelBase} image ${index + 1} of ${images.length}`);
      return `<li class="image-carousel-thumb-item">
  <button type="button" class="image-carousel-thumb${active}" data-carousel-index="${index}" aria-label="${label}"${ariaCurrent}>
    <img class="image-carousel-thumb-img" src="${safeUrl}" alt="" width="72" height="72" loading="eager" decoding="sync" />
  </button>
</li>`;
    })
    .join("\n");
}

/**
 * @param {string[]} images
 * @param {string} productTitleRaw
 * @param {string} carouselPartial
 */
async function buildImageCarouselHtml(images, productTitleRaw, carouselPartial) {
  if (!Array.isArray(images) || images.length === 0) {
    return "";
  }
  const id =
    "carousel-" +
    Math.random().toString(36).slice(2, 10) +
    "-" +
    Math.random().toString(36).slice(2, 10);
  const slides = buildCarouselSlidesHtml(images, productTitleRaw);
  const thumbs = buildCarouselThumbsHtml(images, productTitleRaw);
  return applyTemplate(carouselPartial, {
    CAROUSEL_ID: escapeHtml(id),
    CAROUSEL_SLIDES: slides,
    CAROUSEL_THUMB_ITEMS: thumbs,
  });
}

/**
 * @param {{ shopData: object, navigationConfig: object, products: object[], categorySlug: string, productSlug: string }} ctx
 * @returns {Promise<{ bodyHtml: string, categoryNames: string[], pageTitle: string }>}
 */
async function generateProductBody(ctx) {
  const fetchText = window.generateAnyPage.fetchText;
  const { products, shopData, categorySlug, productSlug } = ctx;
  const find = window.productData.findProductByShopPath;
  if (typeof find !== "function") {
    throw new Error("productData.findProductByShopPath is required for product pages.");
  }
  const row = find(products, categorySlug, productSlug);
  if (!row) {
    throw new Error(`Product not found: shop/${categorySlug}/${productSlug}`);
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

  const carouselHtml = await buildImageCarouselHtml(images, title, carouselPartial);

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
  const variationAxes = collectVariationAxes(row);
  const variationsHtml = buildProductVariationsHtml(variationAxes);
  const cartBootstrap = {
    sku,
    productPath: `shop/${categorySlugResolved}/${productSlug}`,
    variations: variationAxes.map((a) => ({ name: a.name, values: a.values })),
  };
  const bootstrapJson = JSON.stringify(cartBootstrap);
  const productPriceDisplay = formatProductPriceDisplay(row);
  const bodyHtml = applyTemplate(productBodyTemplate, {
    BREADCRUMBS: breadcrumbsHtml,
    PRODUCT_TITLE: titleEsc,
    PRODUCT_PRICE: productPriceDisplay,
    PRODUCT_DESCRIPTION: escapeHtml(description),
    PRODUCT_CAROUSEL: carouselHtml,
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
};
