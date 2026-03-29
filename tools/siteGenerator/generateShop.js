function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url);
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

function getCategoryLabelsHtml(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return "<p>No product rows found.</p>";
  }

  const headers = rows[0];
  const categoryIndex = headers.findIndex((header) => header.trim().toUpperCase() === "CATEGORY");
  if (categoryIndex === -1) {
    return "<p>No CATEGORY column found in CSV.</p>";
  }

  const categories = [];
  const seen = new Set();

  rows.slice(1).forEach((row) => {
    const value = (row[categoryIndex] || "").trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      categories.push(value);
    }
  });

  if (categories.length === 0) {
    return "<p>No categories found in CSV rows.</p>";
  }

  const labels = categories
    .map((category) => `<span class="category-label">${escapeHtml(category)}</span>`)
    .join("");

  return `
    <section class="page-content">
      <h1>Shop Categories</h1>
      <p>Categories found in product data:</p>
      <div class="category-labels">${labels}</div>
    </section>
  `;
}

async function generateShopHtml() {
  const [shopData, navigationConfig, pageTemplate, csvText] = await Promise.all([
    fetchJson("../../shared-assets/config/shopData.json"),
    fetchJson("../../shared-assets/config/navigation.json"),
    fetchText("./templates/pages/homepage.html"),
    fetchText("../../shared-assets/config/product data.csv"),
  ]);

  const { headerHtml, footerHtml, shopName, faviconPath, siteCssPath } =
    await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig);

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: `${escapeHtml(shopName)} - Shop`,
    FAVICON_PATH: escapeHtml(faviconPath),
    SITE_CSS_PATH: escapeHtml(siteCssPath),
    HEADER: headerHtml,
    BODY_CONTENT: getCategoryLabelsHtml(csvText),
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
