function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
}

const EMPTY_CATEGORY_THUMB_ROW =
  "<p class=\"product-thumb-empty\">No products in this category yet.</p>";

/**
 * Single category page main column + full category list for nav.
 * @param {{ shopData: object, navigationConfig: object, products: object[], categoryName: string }} ctx
 * @returns {Promise<{ bodyHtml: string, categoryNames: string[], pageTitle: string }>}
 */
async function generateCategoryBody(ctx) {
  const fetchText = window.generateAnyPage.fetchText;
  const { products, shopData, categoryName } = ctx;
  const nameFilter = String(categoryName || "").toLowerCase().trim();

  const categories = window.productData.getProductsByCategory(products);
  const target = categories.find((category) => category.name.toLowerCase() === nameFilter);
  if (!target) {
    throw new Error(`Category not found: ${categoryName}`);
  }

  const [productThumbTemplate, productThumbRowTemplate, categoryPageTemplate] = await Promise.all([
    fetchText("./templates/partials/productThumb.html"),
    fetchText("./templates/partials/productThumbRow.html"),
    fetchText("./templates/partials/categoryPage.html"),
  ]);

  const buildThumbs = window.generateProductBody?.buildProductThumbsHtml;
  if (typeof buildThumbs !== "function") {
    throw new Error("generateProductBody.js must be loaded before generateCategoryBody.");
  }
  const thumbsHtml = buildThumbs(productThumbTemplate, target.products);
  const rowHtml = applyTemplate(productThumbRowTemplate, {
    PRODUCT_THUMBS: thumbsHtml || EMPTY_CATEGORY_THUMB_ROW,
  });

  const homePageHref = ctx.homePageHref ?? null;
  const shopLandingHref = escapeHtml(
    window.homePage?.resolvePublicHref
      ? window.homePage.resolvePublicHref(homePageHref || "shop", homePageHref)
      : "shop"
  );
  const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${shopLandingHref}">Shop</a>
      <span class="breadcrumbs-sep" aria-hidden="true">&rsaquo;</span>
      <span>${escapeHtml(target.name)}</span>
    </nav>
  `;

  const bodyHtml = applyTemplate(categoryPageTemplate, {
    BREADCRUMBS: breadcrumbsHtml,
    CATEGORY_TITLE: escapeHtml(target.name),
    CATEGORY_INTRO: escapeHtml("All products in this category."),
    PRODUCT_THUMB_ROW: rowHtml,
  });

  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  const truncateText = window.structuredData?.truncateText;
  const metaDescription =
    typeof truncateText === "function"
      ? truncateText(`Shop ${target.name} products at ${shopData?.shopName || "our store"}.`, 160)
      : `Shop ${target.name} products.`;
  return {
    bodyHtml,
    categoryNames: categories.map((category) => category.name),
    pageTitle: `${shopNameEsc} - ${escapeHtml(target.name)}`,
    seoContext: {
      metaDescription,
      categoryName: target.name,
      categoryProductRows: products.filter((row) => window.productData.rowMatchesCategory(row, target.name)),
      catalogProducts: products,
    },
  };
}

window.generateCategoryBody = {
  generateCategoryBody,
};
