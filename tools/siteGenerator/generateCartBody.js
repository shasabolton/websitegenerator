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
  const cartTemplate = await fetchText("./templates/partials/cartBody.html");
  const categories = window.productData.getProductsByCategory(products);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  const checkoutApiBase = String(shopData?.checkout?.apiBase ?? "").trim();
  const bodyHtml = applyTemplate(cartTemplate, {
    CHECKOUT_API_BASE_JSON: JSON.stringify(checkoutApiBase),
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
