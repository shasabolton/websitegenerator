function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {{ shopData: object, navigationConfig: object, products: object[] }} ctx
 * @returns {Promise<{ bodyHtml: string, categoryNames: string[], pageTitle: string }>}
 */
async function buildCartBody(ctx) {
  const fetchText = window.generateAnyPage.fetchText;
  const applyTemplate = window.generateAnyPage.applyTemplate;
  const { shopData, products } = ctx;
  const [cartTemplate, shippingRatesText, discountCodesText] = await Promise.all([
    fetchText("./templates/partials/cartBody.html"),
    fetchText("../../shared-assets/config/shippingRates.json"),
    fetchText("../../shared-assets/config/discountCodes.json"),
  ]);
  let shippingRatesData = { version: 0, currency: "AUD", rates: [] };
  try {
    shippingRatesData = JSON.parse(shippingRatesText);
  } catch {
    /* keep default */
  }
  let discountCodesData = { version: 0, currency: "AUD", codes: [] };
  try {
    discountCodesData = JSON.parse(discountCodesText);
  } catch {
    /* keep default */
  }
  const categories = window.productData.getProductsByCategory(products);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  const paypalClientId = String(shopData?.paypal?.clientId ?? "").trim();
  const paypalEnvironment = String(shopData?.paypal?.environment ?? "sandbox")
    .trim()
    .toLowerCase();
  const paypalBuyerCountry = String(shopData?.paypal?.buyerCountry ?? "AU").trim().toUpperCase();
  const bodyHtml = applyTemplate(cartTemplate, {
    PAYPAL_CLIENT_ID_JSON: JSON.stringify(paypalClientId),
    PAYPAL_ENV_JSON: JSON.stringify(paypalEnvironment === "live" ? "live" : "sandbox"),
    PAYPAL_BUYER_COUNTRY_JSON: JSON.stringify(/^[A-Z]{2}$/.test(paypalBuyerCountry) ? paypalBuyerCountry : "AU"),
    SHIPPING_RATES_JSON: JSON.stringify(shippingRatesData),
    DISCOUNT_CODES_JSON: JSON.stringify(discountCodesData),
  });
  const truncateText = window.structuredData?.truncateText;
  const metaDescription =
    typeof truncateText === "function"
      ? truncateText(`Review items in your ${shopData?.shopName || "shop"} shopping cart.`, 160)
      : "Review items in your shopping cart.";
  return {
    bodyHtml,
    categoryNames: categories.map((c) => c.name),
    pageTitle: `${shopNameEsc} - Cart`,
    seoContext: {
      metaDescription,
    },
  };
}

window.generateCartBody = {
  buildCartBody,
  generateCartBody: buildCartBody,
};
