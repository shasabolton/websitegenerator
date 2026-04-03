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

async function generateCategoryHtml(categoryName) {
  const [shopData, navigationConfig, pageTemplate, { products }, productIconTemplate, categoryPreviewTemplate] =
    await Promise.all([
      fetchJson("../../shared-assets/config/shopData.json"),
      fetchJson("../../shared-assets/config/navigation.json"),
      fetchText("./templates/pages/homepage.html"),
      window.productData.fetchProductDataJson(),
      fetchText("./templates/partials/productIcon.html"),
      fetchText("./templates/partials/categoryPreview.html"),
    ]);

  const categories = window.productData.getProductsByCategory(products);
  const target = categories.find(
    (category) => category.name.toLowerCase() === String(categoryName || "").toLowerCase().trim()
  );
  if (!target) {
    throw new Error(`Category not found: ${categoryName}`);
  }

  const { headerHtml, footerHtml, shopName, faviconPath, siteCssPath } =
    await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig, {
      categoryNames: categories.map((category) => category.name),
    });

  const productIconsHtml = target.products
    .map((product) =>
      applyTemplate(productIconTemplate, {
        PRODUCT_IMAGE: escapeHtml(product.image || "../../shared-assets/images/branding/favicon.jpg"),
        PRODUCT_IMAGE_URL: escapeHtml(product.image || "../../shared-assets/images/branding/favicon.jpg"),
        PRODUCT_TITLE: escapeHtml(product.title),
      })
    )
    .join("");

  const categorySectionHtml = applyTemplate(categoryPreviewTemplate, {
    CATEGORY_ID: `shop-category-${escapeHtml(target.slug || "other")}`,
    CATEGORY_NAME: escapeHtml(target.name),
    CATEGORY_TITLE: escapeHtml(target.name),
    CATEGORY_LINK: `/shop/${escapeHtml(target.slug || "other")}`,
    PRODUCT_ICONS: productIconsHtml || "<p class=\"product-icon-empty\">No products in this category yet.</p>",
  });

  const breadcrumbsHtml = `
    <nav class="breadcrumbs" aria-label="Breadcrumb">
      <a href="/shop">Shop</a>
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

  const pageHtml = applyTemplate(pageTemplate, {
    PAGE_TITLE: `${escapeHtml(shopName)} - ${escapeHtml(target.name)}`,
    FAVICON_PATH: escapeHtml(faviconPath),
    SITE_CSS_PATH: escapeHtml(siteCssPath),
    HEADER: headerHtml,
    BODY_CONTENT: bodyHtml,
    FOOTER: footerHtml,
  });
  return pageHtml;
}

window.generateCategory = {
  generateCategoryHtml,
};
