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
 * @param {object | null | undefined} shopData
 * @param {string} categorySlug
 * @param {string} fallbackName
 * @returns {{ displayName: string, description: string }}
 */
function resolveCategoryPageCopy(shopData, categorySlug, fallbackName) {
  const slug = String(categorySlug || "").trim();
  const fallback = String(fallbackName || "").trim();
  const entry =
    shopData?.categories && typeof shopData.categories === "object" ? shopData.categories[slug] : null;
  const configuredName = String(entry?.name ?? "").trim();
  const description = String(entry?.description ?? "").trim();
  return {
    displayName: configuredName || fallback,
    description,
  };
}

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
  const categoryCopy = resolveCategoryPageCopy(shopData, target.slug, target.name);
  const displayName = categoryCopy.displayName || target.name;
  const categoryDescription = String(categoryCopy.description || "").trim();
  const introText = categoryDescription || "All products in this category.";

  const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="${shopLandingHref}">Shop</a>
      <span class="breadcrumbs-sep" aria-hidden="true">&rsaquo;</span>
      <span>${escapeHtml(displayName)}</span>
    </nav>
  `;

  const bodyHtml = applyTemplate(categoryPageTemplate, {
    BREADCRUMBS: breadcrumbsHtml,
    CATEGORY_TITLE: escapeHtml(displayName),
    CATEGORY_INTRO: escapeHtml(introText),
    PRODUCT_THUMB_ROW: rowHtml,
  });

  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  const truncateText = window.structuredData?.truncateText;
  const metaDescription = categoryDescription
    ? typeof truncateText === "function"
      ? truncateText(categoryDescription, 160)
      : categoryDescription
    : typeof truncateText === "function"
      ? truncateText(`Shop ${displayName} products at ${shopData?.shopName || "our store"}.`, 160)
      : `Shop ${displayName} products.`;
  return {
    bodyHtml,
    categoryNames: categories.map((category) => category.name),
    pageTitle: `${shopNameEsc} - ${escapeHtml(displayName)}`,
    seoContext: {
      metaDescription,
      categoryName: displayName,
      categoryProductRows: products.filter((row) => window.productData.rowMatchesCategory(row, target.name)),
      catalogProducts: products,
    },
  };
}

window.generateCategoryBody = {
  generateCategoryBody,
};
