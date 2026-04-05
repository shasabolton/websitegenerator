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
    const token = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    return current.replace(token, String(value));
  }, template);
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

      const [productIconTemplate, categoryPreviewTemplate] = await Promise.all([
        fetchText("./templates/partials/productIcon.html"),
        fetchText("./templates/partials/categoryPreview.html"),
      ]);

      const productIconsHtml = target.products
        .map((product) =>
          applyTemplate(productIconTemplate, {
            PRODUCT_IMAGE: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
            PRODUCT_IMAGE_URL: escapeHtml(product.image || "shared-assets/images/branding/favicon.jpg"),
            PRODUCT_TITLE: escapeHtml(product.title),
          })
        )
        .join("");

      const slugPart = target.slug || "other";
      const categoryLink = escapeHtml(`shop/${slugPart}`);
      const categorySectionHtml = applyTemplate(categoryPreviewTemplate, {
        CATEGORY_ID: escapeHtml(`shop-category-${slugPart}`),
        CATEGORY_NAME: escapeHtml(target.name),
        CATEGORY_TITLE: escapeHtml(target.name),
        CATEGORY_LINK: categoryLink,
        PRODUCT_ICONS: productIconsHtml || "<p class=\"product-icon-empty\">No products in this category yet.</p>",
      });

      const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="shop/">Shop</a>
      <span class="breadcrumbs-sep" aria-hidden="true">&rsaquo;</span>
      <span>${escapeHtml(target.name)}</span>
    </nav>
  `;

      const bodyHtml = `
    <section class="page-content">
      ${breadcrumbsHtml}
      <h1>${escapeHtml(target.name)}</h1>
      <p>All products in this category.</p>
    </section>
    ${categorySectionHtml}
  `;

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
