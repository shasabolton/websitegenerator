function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
}

function categoryHref(category) {
  return `shop/${slugify(category)}`;
}

const EMPTY_THUMB_ROW = "<p class=\"product-thumb-empty\">No products in this category yet.</p>";

/**
 * Inserts trusted HTML from `shopData.about` (site-owner config only).
 * @param {unknown} about
 * @returns {string}
 */
function buildShopAboutBlock(about) {
  const raw = String(about ?? "").trim();
  if (!raw) {
    return `<p class="shop-browse-lead">${escapeHtml(
      "Browse the categories below to explore products."
    )}</p>`;
  }
  return `<div class="shop-about">${raw}</div>`;
}

/**
 * @param {object} [shopData]
 * @returns {string}
 */
function buildShopIntroSection(shopData) {
  const aboutBlock = buildShopAboutBlock(shopData?.about);
  return `
    <section class="page-content shop-intro" aria-labelledby="shop-heading">
      <h1 id="shop-heading">Shop</h1>
      ${aboutBlock}
      <h2 class="shop-browse-heading">Browse categories</h2>
    </section>
  `;
}

function buildProductThumbsHtml(productThumbTemplate, products) {
  return products
    .map((product) =>
      applyTemplate(productThumbTemplate, {
        PRODUCT_HREF: escapeHtml(product.href || "shop"),
        PRODUCT_IMAGE_URL: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
        PRODUCT_TITLE: escapeHtml(product.title),
      })
    )
    .join("");
}

async function buildCategoryPreviewsHtml(products, shopData) {
  const introHtml = buildShopIntroSection(shopData);
  const categories = window.productData.getProductsByCategory(products);
  if (categories.length === 0) {
    return {
      html: `${introHtml}<section class="page-content"><p>No categories found in product data.</p></section>`,
      categoryNames: [],
    };
  }

  const fetchText = window.generateAnyPage.fetchText;
  const [productThumbTemplate, productThumbRowTemplate, categoryPreviewTemplate] = await Promise.all([
    fetchText("./templates/partials/productThumb.html"),
    fetchText("./templates/partials/productThumbRow.html"),
    fetchText("./templates/partials/categoryPreview.html"),
  ]);

  const categorySections = categories
    .map((category) => {
      const slice = category.products.slice(0, 3);
      const thumbsHtml = buildProductThumbsHtml(productThumbTemplate, slice);
      const rowHtml = applyTemplate(productThumbRowTemplate, {
        PRODUCT_THUMBS: thumbsHtml || EMPTY_THUMB_ROW,
      });

      return applyTemplate(categoryPreviewTemplate, {
        CATEGORY_ID: escapeHtml(`shop-category-${category.slug || "other"}`),
        CATEGORY_NAME: escapeHtml(category.name),
        CATEGORY_TITLE: escapeHtml(category.name),
        CATEGORY_LINK: escapeHtml(categoryHref(category.name)),
        PRODUCT_THUMB_ROW: rowHtml,
      });
    })
    .join("");

  const html = `${introHtml}${categorySections}`;
  return { html, categoryNames: categories.map((category) => category.name) };
}

/**
 * Shop landing main column + nav category list metadata.
 * @param {{ shopData: object, navigationConfig: object, products: object[] }} ctx
 * @returns {Promise<{ bodyHtml: string, categoryNames: string[], pageTitle: string }>}
 */
async function generateShopBody(ctx) {
  const { products, shopData } = ctx;
  const { html, categoryNames } = await buildCategoryPreviewsHtml(products, shopData);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
  const stripHtml = window.structuredData?.stripHtml;
  const truncateText = window.structuredData?.truncateText;
  const aboutText =
    typeof stripHtml === "function" ? stripHtml(shopData?.about) : String(shopData?.about || "").trim();
  const metaDescription =
    typeof truncateText === "function"
      ? truncateText(
          aboutText ||
            "Browse mechanical wooden kits, automata, puzzle boxes, and contraptions.",
          160,
        )
      : aboutText;
  return {
    bodyHtml: html,
    categoryNames,
    pageTitle: `${shopNameEsc} - Shop`,
    seoContext: {
      metaDescription,
      products,
      catalogProducts: products,
    },
  };
}

window.generateShopBody = {
  generateShopBody,
};
