/**
 * @typedef {object} CartLineItem
 * @property {string} sku
 * @property {string} title
 * @property {number} quantity
 * @property {number} unitPrice
 * @property {number} [unitWeightKg] - Mass per unit in kilograms (from product WEIGHT_KG).
 * @property {string} [imageUrl]
 * @property {string} [productPath]
 * @property {string} [lineId] - When set, cart rows merge by this key instead of by `sku` alone (e.g. per variation).
 * @property {string} [variationSummary] - Human-readable options for display and checkout (e.g. "Size: M; Color: Red").
 */

const DEFAULT_UNIT_WEIGHT_KG = 0.25;

(function initShoppingCart() {
  if (window.ShoppingCart && typeof window.skuToLineItem === "function") {
    return;
  }

/**
 * Stable row key for merge / quantity updates (persisted cart lines without `lineId` use `sku`).
 * @param {Pick<CartLineItem, "sku" | "lineId">} item
 * @returns {string}
 */
function cartLineKey(item) {
  const id = String(item.lineId ?? "").trim();
  if (id) {
    return id;
  }
  return String(item.sku ?? "").trim();
}

/**
 * @param {unknown} raw
 * @returns {CartLineItem | null} `null` when `sku` is missing.
 */
function normalizeCartLineInput(raw) {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const o = /** @type {Record<string, unknown>} */ (raw);
  const sku = String(o.sku ?? "").trim();
  if (!sku) {
    return null;
  }
  const title = String(o.title ?? "").trim() || "Item";
  let quantity = Number(o.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    quantity = 1;
  }
  quantity = Math.floor(quantity);
  let unitPrice = Number(o.unitPrice);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    unitPrice = 0;
  }
  let unitWeightKg = Number(o.unitWeightKg);
  if (!Number.isFinite(unitWeightKg) || unitWeightKg < 0) {
    unitWeightKg = DEFAULT_UNIT_WEIGHT_KG;
  }
  /** @type {CartLineItem} */
  const line = { sku, title, quantity, unitPrice, unitWeightKg };
  const lineId = o.lineId != null ? String(o.lineId).trim() : "";
  if (lineId) {
    line.lineId = lineId;
  }
  const variationSummary = o.variationSummary != null ? String(o.variationSummary).trim() : "";
  if (variationSummary) {
    line.variationSummary = variationSummary;
  }
  const imageUrl = o.imageUrl != null ? String(o.imageUrl).trim() : "";
  if (imageUrl) {
    line.imageUrl = imageUrl;
  }
  const productPath = o.productPath != null ? String(o.productPath).trim() : "";
  if (productPath) {
    line.productPath = productPath;
  }
  return line;
}

/**
 * Builds a {@link CartLineItem} from a product row matching `sku` in `products` (e.g. `productData.json` rows).
 * @param {unknown} sku
 * @param {unknown} products
 * @returns {CartLineItem | null}
 */
function skuToLineItem(sku, products) {
  const skuKey = String(sku ?? "").trim();
  if (!skuKey || !Array.isArray(products)) {
    return null;
  }
  const row = products.find((p) => p && String(p.SKU ?? "").trim() === skuKey);
  if (!row) {
    return null;
  }
  const priceRaw = parseFloat(String(row.PRICE ?? "0"));
  const unitPrice = Number.isFinite(priceRaw) && priceRaw >= 0 ? priceRaw : 0;
  const weightRaw = parseFloat(String(row.WEIGHT_KG ?? ""));
  const unitWeightKg =
    Number.isFinite(weightRaw) && weightRaw >= 0 ? weightRaw : DEFAULT_UNIT_WEIGHT_KG;
  /** @type {CartLineItem} */
  const line = {
    sku: skuKey,
    title:
      (typeof window.productData?.resolveProductDisplayTitle === "function"
        ? window.productData.resolveProductDisplayTitle(row, "Item")
        : String(row.TITLE || "").trim()) || "Item",
    quantity: 1,
    unitPrice,
    unitWeightKg,
  };
  const img = String(row.IMAGE1 || "").trim();
  if (img) {
    const resize = window.productData?.productImageUrlForDisplay;
    line.imageUrl = typeof resize === "function" ? resize(img, "thumb") : img;
  }
  return line;
}

function slugifyStorageKeyPart(value) {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "shop";
}

/**
 * Client-side cart model (in-memory). Use {@link ShoppingCart#saveToLocalStorage} / {@link ShoppingCart#loadFromLocalStorage} to persist.
 * @param {string} [shopName] - From `shopData.shopName`; used to build the `localStorage` key.
 * Immediately calls {@link ShoppingCart#loadFromLocalStorage} so the cart restores saved `data` when present.
 */
class ShoppingCart {
  constructor(shopName = "") {
    this.shopName = String(shopName || "").trim();
    /** @type {{ items: CartLineItem[], currencyCode: string, updatedAt: string | null }} */
    this.data = {
      items: [],
      currencyCode: "AUD",
      updatedAt: null,
    };
    this.loadFromLocalStorage();
  }

  getStorageKey() {
    return `${slugifyStorageKeyPart(this.shopName)}-shopping-cart`;
  }

  /**
   * Shows the current cart payload (for quick debugging).
   */
  alertCurrentData() {
    window.alert(JSON.stringify(this.data, null, 2));
  }

  /**
   * @returns {number} Total cart mass in kilograms (sum of quantity × unitWeightKg per line).
   */
  getTotalWeightKg() {
    let total = 0;
    for (const item of this.data.items) {
      let w = Number(item.unitWeightKg);
      if (!Number.isFinite(w) || w < 0) {
        w = DEFAULT_UNIT_WEIGHT_KG;
      }
      let q = Number(item.quantity);
      if (!Number.isFinite(q) || q < 1) {
        q = 1;
      }
      q = Math.floor(q);
      total += w * q;
    }
    return total;
  }

  /**
   * @returns {number} Sum of line quantities (total units in cart).
   */
  getTotalItemCount() {
    let total = 0;
    for (const item of this.data.items) {
      let q = Number(item.quantity);
      if (!Number.isFinite(q) || q < 1) {
        q = 1;
      }
      total += Math.floor(q);
    }
    return total;
  }

  /**
   * Adds a line or merges quantity into an existing line with the same `sku`, then {@link ShoppingCart#saveToLocalStorage}.
   * @param {unknown} cartLineItem
   * @returns {boolean} `false` when `sku` is missing or invalid.
   */
  addLineItemToCart(cartLineItem) {
    const line = normalizeCartLineInput(cartLineItem);
    if (!line) {
      return false;
    }
    const key = cartLineKey(line);
    const existing = this.data.items.find((i) => cartLineKey(i) === key);
    if (existing) {
      const prev = Number(existing.quantity);
      const prevQ = Number.isFinite(prev) && prev >= 1 ? Math.floor(prev) : 0;
      existing.quantity = prevQ + line.quantity;
      if (existing.quantity < 1) {
        existing.quantity = 1;
      }
      if (!String(existing.title || "").trim()) {
        existing.title = line.title;
      }
      existing.unitPrice = line.unitPrice;
      existing.unitWeightKg = line.unitWeightKg;
      if (line.imageUrl && !existing.imageUrl) {
        existing.imageUrl = line.imageUrl;
      }
      if (line.productPath && !existing.productPath) {
        existing.productPath = line.productPath;
      }
      if (line.variationSummary && !existing.variationSummary) {
        existing.variationSummary = line.variationSummary;
      }
    } else {
      this.data.items.push(line);
    }
    this.saveToLocalStorage();
    return true;
  }

  /**
   * Resolves `sku` via {@link skuToLineItem} using `window.productData.fetchProductDataJson()`, then {@link ShoppingCart#addLineItemToCart}.
   * @param {unknown} sku
   * @param {unknown} quantity
   * @param {{ lineId?: unknown, variationSummary?: unknown, productPath?: unknown, unitPrice?: unknown }} [options]
   * @returns {Promise<boolean>}
   */
  async addToCartFromSku(sku, quantity, options) {
    const fetchCatalog = window.productData?.fetchProductDataJson;
    if (typeof fetchCatalog !== "function") {
      return false;
    }
    const { products } = await fetchCatalog();
    const list = Array.isArray(products) ? products : [];
    const line = skuToLineItem(sku, list);
    if (!line) {
      return false;
    }
    let q = Number(quantity);
    if (!Number.isFinite(q) || q < 1) {
      q = 1;
    }
    line.quantity = Math.floor(q);
    const opt = options && typeof options === "object" ? options : {};
    const lineId = String(opt.lineId ?? "").trim();
    if (lineId) {
      line.lineId = lineId;
    }
    const variationSummary = String(opt.variationSummary ?? "").trim();
    if (variationSummary) {
      line.variationSummary = variationSummary;
    }
    const productPath = String(opt.productPath ?? "").trim();
    if (productPath) {
      line.productPath = productPath;
    }
    const unitPriceOpt = Number(opt.unitPrice);
    if (Number.isFinite(unitPriceOpt) && unitPriceOpt >= 0) {
      line.unitPrice = Math.round(unitPriceOpt * 100) / 100;
    }
    return this.addLineItemToCart(line);
  }

  /**
   * @param {unknown} lineKey - {@link cartLineKey} for the row (`lineId` when set, otherwise `sku`).
   * @returns {number}
   */
  findLineIndex(lineKey) {
    const key = String(lineKey ?? "").trim();
    if (!key) {
      return -1;
    }
    return this.data.items.findIndex((i) => cartLineKey(i) === key);
  }

  /**
   * @param {unknown} lineKey
   * @returns {boolean}
   */
  removeLineItem(lineKey) {
    const idx = this.findLineIndex(lineKey);
    if (idx < 0) {
      return false;
    }
    this.data.items.splice(idx, 1);
    this.saveToLocalStorage();
    return true;
  }

  /**
   * Sets quantity for a line; values below 1 remove the line.
   * @param {unknown} lineKey
   * @param {unknown} quantity
   * @returns {boolean} `false` if the line was not found or `quantity` is not a finite number.
   */
  setLineItemQuantity(lineKey, quantity) {
    const idx = this.findLineIndex(lineKey);
    if (idx < 0) {
      return false;
    }
    let q = Number(quantity);
    if (!Number.isFinite(q)) {
      return false;
    }
    q = Math.floor(q);
    if (q < 1) {
      return this.removeLineItem(lineKey);
    }
    this.data.items[idx].quantity = q;
    this.saveToLocalStorage();
    return true;
  }

  /**
   * Serializes {@link ShoppingCart#data} to `localStorage`.
   */
  saveToLocalStorage() {
    this.data.updatedAt = new Date().toISOString();
    window.localStorage.setItem(this.getStorageKey(), JSON.stringify(this.data));
    window.dispatchEvent(
      new CustomEvent("cartchange", { detail: { count: this.getTotalItemCount() } }),
    );
  }

  /**
   * Replaces {@link ShoppingCart#data} from `localStorage` when a valid JSON payload exists for {@link ShoppingCart#getStorageKey}.
   * Missing, empty, or invalid entries leave the current `data` unchanged.
   */
  loadFromLocalStorage() {
    const raw = window.localStorage.getItem(this.getStorageKey());
    if (raw == null || raw === "") {
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") {
      return;
    }
    const items = Array.isArray(parsed.items) ? parsed.items : [];
    const currencyCode =
      typeof parsed.currencyCode === "string" ? parsed.currencyCode : this.data.currencyCode;
    const updatedAt = parsed.updatedAt == null ? null : String(parsed.updatedAt);
    this.data = { items, currencyCode, updatedAt };
  }
}

  window.ShoppingCart = ShoppingCart;
  window.skuToLineItem = skuToLineItem;
})();

(function initCartBadge() {
  function formatBadgeCount(count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1) {
      return "";
    }
    return n > 99 ? "99+" : String(Math.floor(n));
  }

  function cartAriaLabel(count) {
    const n = Number(count);
    if (!Number.isFinite(n) || n < 1) {
      return "Shopping cart";
    }
    const units = Math.floor(n);
    return `Shopping cart, ${units} item${units === 1 ? "" : "s"}`;
  }

  function updateCartBadge(count, animate) {
    const link = document.querySelector(".header-cart-link");
    if (!link) {
      return;
    }

    let badge = link.querySelector(".header-cart-count");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "header-cart-count";
      badge.setAttribute("aria-hidden", "true");
      link.appendChild(badge);
    }

    const prev = Number(badge.dataset.count || "0");
    const next = Number.isFinite(Number(count)) && Number(count) > 0 ? Math.floor(Number(count)) : 0;
    badge.dataset.count = String(next);
    badge.textContent = formatBadgeCount(next);
    badge.hidden = next <= 0;
    link.setAttribute("aria-label", cartAriaLabel(next));

    if (animate && next > prev) {
      badge.classList.remove("is-bump");
      void badge.offsetWidth;
      badge.classList.add("is-bump");
    }
  }

  function syncCartBadgeFromSiteCart(animate) {
    const cart = window.siteCart;
    if (!cart || typeof cart.getTotalItemCount !== "function") {
      updateCartBadge(0, false);
      return;
    }
    updateCartBadge(cart.getTotalItemCount(), animate);
  }

  if (!window.__cartBadgeListenersBound) {
    window.__cartBadgeListenersBound = true;

    window.addEventListener("cartchange", function (event) {
      const count = event?.detail?.count;
      updateCartBadge(
        Number.isFinite(Number(count)) ? Number(count) : 0,
        true,
      );
    });

    window.addEventListener("storage", function (event) {
      const cart = window.siteCart;
      if (!cart || typeof cart.getStorageKey !== "function" || event.key !== cart.getStorageKey()) {
        return;
      }
      cart.loadFromLocalStorage();
      syncCartBadgeFromSiteCart(false);
    });
  }

  function onReady() {
    syncCartBadgeFromSiteCart(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
