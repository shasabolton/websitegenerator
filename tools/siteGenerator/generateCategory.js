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

function buildProductThumbsHtml(productThumbTemplate, products) {
  return products
    .map((product) =>
      applyTemplate(productThumbTemplate, {
        PRODUCT_IMAGE: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
        PRODUCT_IMAGE_URL: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
        PRODUCT_TITLE: escapeHtml(product.title),
      })
    )
    .join("");
}

async function generateCategoryHtml(categoryName) {
  const fetchText = window.generatePage.fetchText;
  const nameFilter = String(categoryName || "").toLowerCase().trim();

  return window.generatePage.generatePage({
    buildBody: async ({ products, shopData }) => {
      const categories = window.productData.getProductsByCategory(products);
      const target = categories.find(
        (category) => category.name.toLowerCase() === nameFilter
      );
      if (!target) {
        throw new Error(`Category not found: ${categoryName}`);
      }

      const [productThumbTemplate, productThumbRowTemplate, categoryPageTemplate] = await Promise.all([
        fetchText("./templates/partials/productThumb.html"),
        fetchText("./templates/partials/productThumbRow.html"),
        fetchText("./templates/partials/categoryPage.html"),
      ]);

      const thumbsHtml = buildProductThumbsHtml(productThumbTemplate, target.products);
      const rowHtml = applyTemplate(productThumbRowTemplate, {
        PRODUCT_THUMBS: thumbsHtml || EMPTY_CATEGORY_THUMB_ROW,
      });

      const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="shop/">Shop</a>
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
      return {
        bodyHtml,
        categoryNames: categories.map((category) => category.name),
        pageTitle: `${shopNameEsc} - ${escapeHtml(target.name)}`,
      };
    },
  });
}

window.generateCategory = {
  generateCategoryHtml,
};
