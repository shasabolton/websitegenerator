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

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
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

function getProductsByCategory(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  const categoryIndex = headers.findIndex((header) => header.trim().toUpperCase() === "CATEGORY");
  const titleIndex = headers.findIndex((header) => header.trim().toUpperCase() === "TITLE");
  const imageIndex = headers.findIndex((header) => header.trim().toUpperCase() === "IMAGE1");
  if (categoryIndex === -1) {
    return [];
  }

  const categories = new Map();
  rows.slice(1).forEach((row) => {
    const category = (row[categoryIndex] || "").trim();
    if (!category) {
      return;
    }
    const key = category.toLowerCase();
    if (!categories.has(key)) {
      categories.set(key, {
        name: category,
        slug: slugify(category),
        products: [],
      });
    }
    const title = (row[titleIndex] || "Untitled Product").trim() || "Untitled Product";
    const image = (row[imageIndex] || "").trim();
    categories.get(key).products.push({ title, image });
  });

  return Array.from(categories.values());
}

async function buildCategoryPreviewsHtml(csvText) {
  const categories = getProductsByCategory(csvText);
  if (categories.length === 0) {
    return "<section class=\"page-content\"><p>No categories found in product data.</p></section>";
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
  const [shopData, navigationConfig, pageTemplate, csvText] = await Promise.all([
    fetchJson("../../shared-assets/config/shopData.json"),
    fetchJson("../../shared-assets/config/navigation.json"),
    fetchText("./templates/pages/homepage.html"),
    fetchText("../../shared-assets/config/product data.csv"),
  ]);

  const { html: categoryPreviewsHtml, categoryNames } = await buildCategoryPreviewsHtml(csvText);
  const { headerHtml, footerHtml, shopName, faviconPath, siteCssPath } =
    await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig, { categoryNames });

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: `${escapeHtml(shopName)} - Shop`,
    FAVICON_PATH: escapeHtml(faviconPath),
    SITE_CSS_PATH: escapeHtml(siteCssPath),
    HEADER: headerHtml,
    BODY_CONTENT: categoryPreviewsHtml,
    FOOTER: footerHtml,
  });
}

async function prepareShopPreviewHtml() {
  return generateShopHtml();
}

window.generateShop = {
  prepareShopPreviewHtml,
  generateShopHtml,
};
