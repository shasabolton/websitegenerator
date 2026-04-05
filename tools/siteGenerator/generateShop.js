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

async function buildCategoryPreviewsHtml(products) {
  const categories = window.productData.getProductsByCategory(products);
  if (categories.length === 0) {
    return {
      html: "<section class=\"page-content\"><p>No categories found in product data.</p></section>",
      categoryNames: [],
    };
  }

  const fetchText = window.generatePage.fetchText;
  const [productIconTemplate, categoryPreviewTemplate] = await Promise.all([
    fetchText("./templates/partials/productIcon.html"),
    fetchText("./templates/partials/categoryPreview.html"),
  ]);

  const categorySections = categories
    .map((category) => {
      const iconsHtml = category.products
        .slice(0, 3)
        .map((product) =>
          applyTemplate(productIconTemplate, {
            PRODUCT_IMAGE: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
            PRODUCT_IMAGE_URL: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
            PRODUCT_TITLE: escapeHtml(product.title),
          })
        )
        .join("");

      return applyTemplate(categoryPreviewTemplate, {
        CATEGORY_ID: escapeHtml(`shop-category-${category.slug || "other"}`),
        CATEGORY_NAME: escapeHtml(category.name),
        CATEGORY_TITLE: escapeHtml(category.name),
        PRODUCT_ICONS: iconsHtml || "<p class=\"product-icon-empty\">No products in this category yet.</p>",
        CATEGORY_LINK: escapeHtml(categoryHref(category.name)),
      });
    })
    .join("");

  const html = `
    <section class="page-content">
      <h1>Shop</h1>
      <p>Browse categories from your product data.</p>
    </section>
    ${categorySections}
  `;
  return { html, categoryNames: categories.map((category) => category.name) };
}

async function generateShopHtml() {
  return window.generatePage.generatePage({
    buildBody: async ({ products, shopData }) => {
      const { html, categoryNames } = await buildCategoryPreviewsHtml(products);
      const shopNameEsc = escapeHtml(shopData?.shopName || "Shop");
      return {
        bodyHtml: html,
        categoryNames,
        pageTitle: `${shopNameEsc} - Shop`,
      };
    },
  });
}

async function prepareShopPreviewHtml() {
  return generateShopHtml();
}

window.generateShop = {
  prepareShopPreviewHtml,
  generateShopHtml,
};
