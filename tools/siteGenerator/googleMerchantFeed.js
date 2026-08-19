/**
 * Google Merchant Center product feed (tab-delimited .txt) from productData + shopData.
 * Generated on site publish and committed at feeds/google-merchant.txt.
 */
(function initGoogleMerchantFeed() {
  const FEED_PATH = "feeds/google-merchant.txt";

  const FEED_COLUMNS = [
    "id",
    "title",
    "description",
    "link",
    "image_link",
    "additional_image_link",
    "availability",
    "condition",
    "price",
    "brand",
    "identifier_exists",
    "mpn",
    "product_type",
    "shipping_weight",
    "shipping",
    "return_policy_label",
  ];

  function getProductDataApi() {
    return window.productData || null;
  }

  function getSiteOrigin(shopData) {
    const raw = shopData?.websites?.primary;
    if (!raw || typeof raw !== "string") {
      return "";
    }
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  }

  function stripHtml(html) {
    if (typeof window.structuredData?.stripHtml === "function") {
      return window.structuredData.stripHtml(html);
    }
    return String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function truncateText(text, maxLen) {
    if (typeof window.structuredData?.truncateText === "function") {
      return window.structuredData.truncateText(text, maxLen);
    }
    const s = String(text || "").trim();
    if (!s || s.length <= maxLen) {
      return s;
    }
    return `${s.slice(0, maxLen - 1).trim()}…`;
  }

  function toAbsoluteAssetUrl(siteOrigin, assetPath) {
    const p = String(assetPath || "").trim();
    if (!p) {
      return "";
    }
    if (/^https?:\/\//i.test(p)) {
      return p;
    }
    if (!siteOrigin) {
      return p;
    }
    return `${siteOrigin}/${p.replace(/^\/+/, "")}`;
  }

  function resolveProductLink(siteOrigin, slug, homePageHref) {
    const treePath = `shop/${slug}`;
    if (typeof window.structuredData?.resolveAbsoluteUrl === "function") {
      return window.structuredData.resolveAbsoluteUrl(siteOrigin, treePath, homePageHref);
    }
    if (!siteOrigin) {
      return `/${treePath}`;
    }
    return `${siteOrigin}/${treePath}`;
  }

  function sanitizeFeedId(raw) {
    return String(raw || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^A-Za-z0-9._~-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
  }

  function escapeTsvCell(value) {
    return String(value ?? "")
      .replace(/\r\n/g, " ")
      .replace(/[\r\n\t]/g, " ")
      .trim();
  }

  function formatPrice(row) {
    const priceNum = parseFloat(String(row?.PRICE ?? "").trim());
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      return "";
    }
    const currency = String(row?.CURRENCY_CODE || "AUD")
      .trim()
      .toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      return "";
    }
    return `${priceNum.toFixed(2)} ${currency}`;
  }

  function formatAvailability(row) {
    const qty = parseFloat(String(row?.QUANTITY ?? "").trim());
    if (Number.isFinite(qty) && qty <= 0) {
      return "out_of_stock";
    }
    return "in_stock";
  }

  function formatShippingWeight(row) {
    if (row?.DIGITAL === true) {
      return "";
    }
    const kg = parseFloat(String(row?.WEIGHT_KG ?? "").trim());
    if (!Number.isFinite(kg) || kg <= 0) {
      return "";
    }
    return `${kg} kg`;
  }

  function resolveBuyerCountry(shopData) {
    const fromPaypal = String(shopData?.paypal?.buyerCountry || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{2}$/.test(fromPaypal)) {
      return fromPaypal;
    }
    return "AU";
  }

  function formatShipping(row, shopData) {
    const country = resolveBuyerCountry(shopData);
    const currency = String(row?.CURRENCY_CODE || "AUD")
      .trim()
      .toUpperCase();
    const code = /^[A-Z]{3}$/.test(currency) ? currency : "AUD";
    if (row?.DIGITAL === true) {
      return `${country}:::0.00 ${code}`;
    }
    // Physical shipping rates live in Merchant Center; feed omits a rate.
    return "";
  }

  function resolveTitle(row) {
    const pd = getProductDataApi();
    if (typeof pd?.resolveProductDisplayTitle === "function") {
      return pd.resolveProductDisplayTitle(row, "");
    }
    const shortTitle = String(row?.SHORT_TITLE ?? "").trim();
    if (shortTitle) {
      return shortTitle;
    }
    return String(row?.TITLE ?? "").trim();
  }

  function resolveSlug(row, products) {
    const pd = getProductDataApi();
    if (typeof pd?.getProductSlugForRow === "function") {
      return pd.getProductSlugForRow(row, products);
    }
    return String(row?.SLUG || "").trim();
  }

  function collectImages(row) {
    const pd = getProductDataApi();
    if (typeof pd?.collectProductImageUrls === "function") {
      return pd.collectProductImageUrls(row);
    }
    const out = [];
    for (let i = 1; i <= 10; i += 1) {
      const u = String(row?.[`IMAGE${i}`] || "").trim();
      if (u) {
        out.push(u);
      }
    }
    return out;
  }

  function productsForMerchantFeed(products) {
    const pd = getProductDataApi();
    let list = Array.isArray(products) ? products : [];
    if (typeof pd?.filterVisibleProducts === "function") {
      list = pd.filterVisibleProducts(list);
    } else {
      list = list.filter((row) => row && row.HIDE !== true && String(row.HIDE ?? "").trim().toLowerCase() !== "true");
    }
    if (typeof pd?.isProductRowDraft === "function") {
      list = list.filter((row) => !pd.isProductRowDraft(row));
    } else {
      list = list.filter((row) => row && row.DRAFT !== true && String(row.DRAFT ?? "").trim().toLowerCase() !== "true");
    }
    return list;
  }

  /**
   * @param {object} row
   * @param {object[]} products
   * @param {object} shopData
   * @param {string} [homePageHref]
   * @returns {Record<string, string> | null}
   */
  function buildFeedRow(row, products, shopData, homePageHref) {
    if (!row || typeof row !== "object") {
      return null;
    }
    const siteOrigin = getSiteOrigin(shopData);
    const slug = resolveSlug(row, products);
    const title = truncateText(resolveTitle(row), 150);
    const price = formatPrice(row);
    const images = collectImages(row)
      .map((url) => toAbsoluteAssetUrl(siteOrigin, url))
      .filter(Boolean);
    const id = sanitizeFeedId(slug) || sanitizeFeedId(row.SKU);
    if (!id || !title || !price || !siteOrigin || !images.length) {
      return null;
    }
    const brand = String(shopData?.shopName || "")
      .trim()
      .slice(0, 70);
    const mpn = sanitizeFeedId(row.SKU).slice(0, 70);
    const description = truncateText(stripHtml(String(row.DESCRIPTION || "").trim()), 5000);
    const productType = String(row.CATEGORY || "")
      .trim()
      .replace(/-/g, " ");
    return {
      id,
      title,
      description,
      link: resolveProductLink(siteOrigin, slug, homePageHref),
      image_link: images[0],
      additional_image_link: images.slice(1, 10).join(","),
      availability: formatAvailability(row),
      condition: "new",
      price,
      brand,
      identifier_exists: "no",
      mpn,
      product_type: productType,
      shipping_weight: formatShippingWeight(row),
      shipping: formatShipping(row, shopData),
      return_policy_label: row?.DIGITAL === true ? "digital" : "default",
    };
  }

  /**
   * @param {object[]} products
   * @param {object} shopData
   * @param {{ homePageHref?: string }} [options]
   * @returns {string}
   */
  function buildGoogleMerchantFeedTxt(products, shopData, options = {}) {
    const catalog = Array.isArray(products) ? products : [];
    const rows = productsForMerchantFeed(catalog)
      .map((row) => buildFeedRow(row, catalog, shopData, options.homePageHref))
      .filter(Boolean);
    rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const lines = [FEED_COLUMNS.join("\t")];
    for (const row of rows) {
      lines.push(FEED_COLUMNS.map((col) => escapeTsvCell(row[col])).join("\t"));
    }
    return `${lines.join("\n")}\n`;
  }

  window.googleMerchantFeed = {
    FEED_PATH,
    FEED_COLUMNS,
    productsForMerchantFeed,
    buildFeedRow,
    buildGoogleMerchantFeedTxt,
  };
})();
