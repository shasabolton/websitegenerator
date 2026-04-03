function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load file: ${url} (${response.status})`);
  }
  return response.text();
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    return current.replace(token, String(value));
  }, template);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function categoryHref(category) {
  return `/shop/${slugify(category)}`;
}

async function buildCategoryPreviewsHtml(products) {
  const categories = window.productData.getProductsByCategory(products);
  if (categories.length === 0) {
    return {
      html: "<section class=\"page-content\"><p>No categories found in product data.</p></section>",
      categoryNames: [],
    };
  }

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
            PRODUCT_IMAGE: escapeHtml(product.image || "../../shared-assets/images/branding/favicon.jpg"),
            PRODUCT_IMAGE_URL: escapeHtml(product.image || "../../shared-assets/images/branding/favicon.jpg"),
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
  const [shopData, navigationConfig, pageTemplate, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/shopData.json"),
    fetchJson("../../shared-assets/config/navigation.json"),
    fetchText("./templates/pages/homepage.html"),
    window.productData.fetchProductDataJson(),
  ]);

  const { html: categoryPreviewsHtml, categoryNames } = await buildCategoryPreviewsHtml(products);
  const { headerHtml, footerHtml, shopName, faviconPath, siteCssPath } =
    await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig, { categoryNames });

  const pageHtml = applyTemplate(pageTemplate, {
    PAGE_TITLE: `${escapeHtml(shopName)} - Shop`,
    FAVICON_PATH: escapeHtml(faviconPath),
    SITE_CSS_PATH: escapeHtml(siteCssPath),
    HEADER: headerHtml,
    BODY_CONTENT: categoryPreviewsHtml,
    FOOTER: footerHtml,
  });
  return pageHtml;
}

async function prepareShopPreviewHtml() {
  return generateShopHtml();
}

window.generateShop = {
  prepareShopPreviewHtml,
  generateShopHtml,
};
