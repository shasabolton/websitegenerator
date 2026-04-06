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
  const { shopData, products } = ctx;
  const cartTemplate = await fetchText("./templates/partials/cartBody.html");
  const categories = window.productData.getProductsByCategory(products);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  return {
    bodyHtml: cartTemplate,
    categoryNames: categories.map((c) => c.name),
    pageTitle: `${shopNameEsc} - Cart`,
  };
}

window.generateCartBody = {
  buildCartBody,
  generateCartBody: buildCartBody,
};
