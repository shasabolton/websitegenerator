(function initProductData() {
  if (window.productData && typeof window.productData.fetchProductDataJson === "function") {
    return;
  }

function productDataJsonUrl() {
  return document.querySelector("base[data-site-base]")
    ? "shared-assets/config/productData.json"
    : "../../shared-assets/config/productData.json";
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const PRODUCT_HIDE_OVERLAY_KEY = "siteGenerator.productHideOverlay";

function readProductHideOverlay() {
  try {
    const raw = sessionStorage.getItem(PRODUCT_HIDE_OVERLAY_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeProductHideOverlay(overlay) {
  sessionStorage.setItem(PRODUCT_HIDE_OVERLAY_KEY, JSON.stringify(overlay));
}

function isProductRowHidden(row) {
  if (!row || typeof row !== "object") {
    return false;
  }
  return row.HIDE === true || String(row.HIDE ?? "").trim().toLowerCase() === "true";
}

function applyProductHideOverlay(products) {
  const overlay = readProductHideOverlay();
  if (!Object.keys(overlay).length) {
    return products;
  }
  return products.map((row) => {
    const sku = String(row?.SKU ?? "").trim();
    if (!sku || !Object.prototype.hasOwnProperty.call(overlay, sku)) {
      return row;
    }
    if (overlay[sku]) {
      return { ...row, HIDE: true };
    }
    const next = { ...row };
    delete next.HIDE;
    return next;
  });
}

function setProductHideBySku(sku, hide) {
  const key = String(sku ?? "").trim();
  if (!key) {
    return;
  }
  const overlay = readProductHideOverlay();
  if (hide) {
    overlay[key] = true;
  } else {
    delete overlay[key];
  }
  writeProductHideOverlay(overlay);
}

function clearProductHideOverlayForSku(sku) {
  const key = String(sku ?? "").trim();
  if (!key) {
    return;
  }
  const overlay = readProductHideOverlay();
  if (!Object.prototype.hasOwnProperty.call(overlay, key)) {
    return;
  }
  delete overlay[key];
  writeProductHideOverlay(overlay);
}

function filterVisibleProducts(products) {
  return (Array.isArray(products) ? products : []).filter((row) => row && !isProductRowHidden(row));
}

async function fetchProductDataJson() {
  const url = productDataJsonUrl();
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load product data: ${url} (${response.status})`);
  }
  const data = await response.json();
  const products = applyProductHideOverlay(Array.isArray(data?.products) ? data.products : []);
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  return { version: data?.version, columns, products };
}

function getProductsByCategory(products) {
  const list = filterVisibleProducts(products);
  const categories = new Map();

  for (const row of list) {
    const category = String(row.CATEGORY || "").trim();
    if (!category) {
      continue;
    }
    const key = category.toLowerCase();
    if (!categories.has(key)) {
      categories.set(key, {
        name: category,
        slug: slugify(category),
        products: [],
      });
    }
    const title = String(row.TITLE || "Untitled Product").trim() || "Untitled Product";
    const image = String(row.IMAGE1 || "").trim();
    categories.get(key).products.push({ title, image });
  }

  return Array.from(categories.values());
}

/**
 * Stable global URL segment per product row (for `shop/<product-slug>`).
 * Slug uniqueness is enforced across the entire catalog, in array order.
 * @param {object[]} products
 * @returns {Map<object, string>}
 */
function assignProductSlugsGlobally(products) {
  const list = Array.isArray(products) ? products : [];
  const slugByRow = new Map();
  const taken = new Set();
  for (const row of list) {
    const title = String(row.TITLE || "").trim() || "product";
    let s = slugify(title) || "product";
    if (!taken.has(s)) {
      taken.add(s);
      slugByRow.set(row, s);
      continue;
    }
    const sku = String(row.SKU || "").trim();
    if (sku) {
      const withSku = `${s}-${slugify(sku) || sku}`;
      if (!taken.has(withSku)) {
        taken.add(withSku);
        slugByRow.set(row, withSku);
        continue;
      }
    }
    let i = 2;
    let candidate = `${s}-${i}`;
    while (taken.has(candidate)) {
      i += 1;
      candidate = `${s}-${i}`;
    }
    taken.add(candidate);
    slugByRow.set(row, candidate);
  }
  return slugByRow;
}

/**
 * @param {object} row
 * @param {object[]} products
 */
function getProductSlugForRow(row, products) {
  return assignProductSlugsGlobally(products).get(row) || slugify(String(row.TITLE || "").trim()) || "product";
}

/**
 * @param {object[]} products
 * @param {string} productSlug
 * @returns {object | null}
 */
function findProductBySlug(products, productSlug) {
  const list = Array.isArray(products) ? products : [];
  const prodKey = String(productSlug || "").trim().toLowerCase();
  if (!prodKey) {
    return null;
  }
  const slugByRow = assignProductSlugsGlobally(list);
  for (const row of list) {
    const seg = slugByRow.get(row);
    if (seg && String(seg).toLowerCase() === prodKey) {
      return row;
    }
  }
  return null;
}

const IMAGE_COLUMN_KEYS = [
  "IMAGE1",
  "IMAGE2",
  "IMAGE3",
  "IMAGE4",
  "IMAGE5",
  "IMAGE6",
  "IMAGE7",
  "IMAGE8",
  "IMAGE9",
  "IMAGE10",
];

/**
 * Non-empty product image URLs in display order.
 * @param {object} row
 * @returns {string[]}
 */
function collectProductImageUrls(row) {
  const out = [];
  for (const key of IMAGE_COLUMN_KEYS) {
    const u = String(row[key] || "").trim();
    if (u) {
      out.push(u);
    }
  }
  return out;
}

function splitCommaList(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseVariationPriceDeltas(raw, valueCount) {
  const parts = String(raw ?? "").split(",");
  const out = [];
  for (let i = 0; i < valueCount; i += 1) {
    const n = parseFloat(String(parts[i] ?? "").trim());
    out.push(Number.isFinite(n) ? n : 0);
  }
  return out;
}

/**
 * Variation axes with aligned value labels and price deltas (additive to `PRICE`).
 * @param {object} row
 * @returns {{ name: string, values: string[], deltas: number[] }[]}
 */
function variationAxesFromRow(row) {
  const axes = [];
  for (let i = 1; i <= 2; i += 1) {
    const name = String(row[`VARIATION ${i} NAME`] || "").trim();
    const values = splitCommaList(row[`VARIATION ${i} VALUES`]);
    if (!name || values.length === 0) {
      continue;
    }
    const deltas = parseVariationPriceDeltas(row[`VARIATION ${i} PRICE DELTA`], values.length);
    axes.push({ name, values, deltas });
  }
  return axes;
}

/**
 * @param {string} lineId - e.g. `SKU::name=value&name=value` from cart.
 * @returns {Array<[string, string]> | null}
 */
function choicePairsFromLineId(lineId) {
  const s = String(lineId || "").trim();
  const sep = s.indexOf("::");
  if (sep < 0) {
    return null;
  }
  const q = s.slice(sep + 2).trim();
  if (!q) {
    return null;
  }
  /** @type {Array<[string, string]>} */
  const pairs = [];
  for (const part of q.split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    try {
      pairs.push([decodeURIComponent(part.slice(0, eq)), decodeURIComponent(part.slice(eq + 1))]);
    } catch {
      pairs.push([part.slice(0, eq), part.slice(eq + 1)]);
    }
  }
  return pairs.length ? pairs : null;
}

/**
 * Base `PRICE` plus deltas for selected option per axis (matched by variation name and value label).
 * @param {object} row
 * @param {Array<[string, string]>} choicePairs
 * @returns {number}
 */
function unitPriceFromRowAndChoices(row, choicePairs) {
  const map = new Map(choicePairs.map(([n, v]) => [String(n).trim(), String(v).trim()]));
  let base = parseFloat(String(row.PRICE ?? "0"));
  if (!Number.isFinite(base) || base < 0) {
    base = 0;
  }
  for (let i = 1; i <= 2; i += 1) {
    const axisName = String(row[`VARIATION ${i} NAME`] || "").trim();
    if (!axisName) {
      continue;
    }
    const values = splitCommaList(row[`VARIATION ${i} VALUES`]);
    if (values.length === 0) {
      continue;
    }
    const chosen = map.get(axisName);
    if (chosen === undefined) {
      continue;
    }
    const idx = values.findIndex((v) => String(v).trim() === chosen);
    if (idx < 0) {
      continue;
    }
    const deltas = parseVariationPriceDeltas(row[`VARIATION ${i} PRICE DELTA`], values.length);
    const d = deltas[idx];
    if (Number.isFinite(d)) {
      base += d;
    }
  }
  return Math.round(base * 100) / 100;
}

/**
 * Mutates `boot` from live catalog row (same `SKU`).
 * @param {{ sku?: string, basePrice?: number, currencyCode?: string, variations?: unknown[] }} boot
 * @param {object} row
 */
function applyCatalogRowToProductPricingBoot(boot, row) {
  if (!boot || !row) {
    return;
  }
  const sku = String(boot.sku || "").trim();
  if (sku !== String(row.SKU || "").trim()) {
    return;
  }
  let bp = parseFloat(String(row.PRICE ?? "0"));
  if (!Number.isFinite(bp) || bp < 0) {
    bp = 0;
  }
  boot.basePrice = bp;
  boot.currencyCode = String(row.CURRENCY_CODE || "AUD")
    .trim()
    .toUpperCase();
  if (!boot.currencyCode || !/^[A-Z]{3}$/.test(boot.currencyCode)) {
    boot.currencyCode = "AUD";
  }
  boot.variations = variationAxesFromRow(row);
}

/**
 * Refresh line `unitPrice` from catalog (`lineId` choices when present).
 * @param {{ items: object[] }} cartData
 * @param {object[]} products
 * @returns {boolean} whether any line was changed
 */
function repriceCartItemsInPlace(cartData, products) {
  const list = Array.isArray(products) ? products : [];
  const items = cartData && Array.isArray(cartData.items) ? cartData.items : [];
  let changed = false;
  for (const item of items) {
    const skuKey = String(item.sku ?? "").trim();
    if (!skuKey) {
      continue;
    }
    const row = list.find((p) => p && String(p.SKU ?? "").trim() === skuKey);
    if (!row) {
      continue;
    }
    const pairs = item.lineId ? choicePairsFromLineId(String(item.lineId)) : null;
    let next =
      pairs && pairs.length > 0 ? unitPriceFromRowAndChoices(row, pairs) : parseFloat(String(row.PRICE ?? "0"));
    if (!Number.isFinite(next) || next < 0) {
      next = 0;
    }
    next = Math.round(next * 100) / 100;
    const prev = Number(item.unitPrice);
    if (!Number.isFinite(prev) || Math.abs(prev - next) > 0.0005) {
      item.unitPrice = next;
      changed = true;
    }
  }
  return changed;
}

/**
 * @param {object[]} products
 * @param {boolean | null | undefined} digitalFilter - true: DIGITAL only; false: non-digital; null/undefined: all
 * @returns {object[]}
 */
function filterProductsByDigital(products, digitalFilter) {
  const list = Array.isArray(products) ? products : [];
  if (digitalFilter === true) {
    return list.filter((row) => row && row.DIGITAL === true);
  }
  if (digitalFilter === false) {
    return list.filter((row) => row && row.DIGITAL !== true);
  }
  return list;
}

function getCategoriesForFileTree(products, digitalFilter) {
  const list = Array.isArray(products) ? products : [];
  const slugByRow = assignProductSlugsGlobally(list);
  const rows = filterProductsByDigital(list, digitalFilter);
  const categories = new Map();

  for (const row of rows) {
    const categoryName = String(row.CATEGORY || "").trim();
    if (!categoryName) {
      continue;
    }
    const key = categoryName.toLowerCase();
    if (!categories.has(key)) {
      categories.set(key, {
        label: categoryName,
        slug: slugify(categoryName),
        href: `shop/${slugify(categoryName)}`,
        products: [],
      });
    }
    const productTitle = String(row.TITLE || "").trim();
    const segment = slugByRow.get(row);
    if (productTitle && segment) {
      categories.get(key).products.push({
        label: productTitle,
        href: `shop/${segment}`,
      });
    }
  }

  return Array.from(categories.values());
}

  window.productData = {
    fetchProductDataJson,
    getProductsByCategory,
    filterProductsByDigital,
    filterVisibleProducts,
    isProductRowHidden,
    setProductHideBySku,
    clearProductHideOverlayForSku,
    getCategoriesForFileTree,
    assignProductSlugsGlobally,
    getProductSlugForRow,
    findProductBySlug,
    collectProductImageUrls,
    variationAxesFromRow,
    choicePairsFromLineId,
    unitPriceFromRowAndChoices,
    applyCatalogRowToProductPricingBoot,
    repriceCartItemsInPlace,
  };
})();
