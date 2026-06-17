function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * @param {{ shopData: object, navigationConfig: object, products: object[], homePageHref?: string | null }} ctx
 */
async function generateNotFoundBody(ctx) {
  const fetchText = window.generateAnyPage.fetchText;
  const applyTemplate = window.generateAnyPage.applyTemplate;
  const { shopData, products } = ctx;
  const bodyTemplate = await fetchText("./templates/partials/notFoundBody.html");
  const bodyHtml = applyTemplate(bodyTemplate, {});
  const shopNameEsc = escapeHtml(shopData?.shopName || "Site");
  const categories = window.productData.getProductsByCategory(products || []);
  return {
    bodyHtml,
    categoryNames: categories.map((c) => c.name),
    pageTitle: `${shopNameEsc} - Page not found`,
    seoContext: {
      isNotFoundPage: true,
      metaDescription: "The requested page could not be found.",
    },
    extraDeferScripts:
      '<script src="shared-assets/script/notFoundProductMatch.js" defer></script>',
  };
}

/**
 * Full HTML document for GitHub Pages `404.html` (root only).
 * @param {{ shopData: object, navigation: object, products: object[], fileTree?: object, homePageHref?: string | null }} publishContext
 */
async function generateNotFoundPage(publishContext) {
  const fetchJson = window.generateAnyPage.fetchJson;
  const fetchText = window.generateAnyPage.fetchText;
  const mergeBodyIntoFullHtml = window.generateAnyPage.mergeBodyIntoFullHtml;

  const [shopData, pageTemplate, setBaseSource] = await Promise.all([
    typeof window.shopDataEditor?.fetchShopDataJson === "function"
      ? window.shopDataEditor.fetchShopDataJson()
      : fetchJson("../../shared-assets/config/shopData.json"),
    fetchText("./templates/pages/allPages.html"),
    fetchText("./setBase.js"),
  ]);

  const navigationConfig =
    publishContext?.navigation && typeof publishContext.navigation === "object"
      ? publishContext.navigation
      : { items: [] };
  const products = Array.isArray(publishContext?.products) ? publishContext.products : [];
  const fileTree =
    publishContext?.fileTree && typeof publishContext.fileTree === "object"
      ? publishContext.fileTree
      : { items: [] };
  const homePageHref = window.homePage?.getHomePageHref
    ? window.homePage.getHomePageHref(fileTree)
    : null;
  const productsForShop = window.productData.filterVisibleProducts(products);
  const bodyPayload = await generateNotFoundBody({
    shopData,
    navigationConfig,
    products: productsForShop,
    homePageHref,
  });

  return mergeBodyIntoFullHtml(
    shopData,
    navigationConfig,
    pageTemplate,
    setBaseSource,
    bodyPayload,
    homePageHref,
    "404",
  );
}

window.generateNotFoundBody = {
  generateNotFoundBody,
  generateNotFoundPage,
};
