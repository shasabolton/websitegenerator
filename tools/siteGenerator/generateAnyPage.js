/**
 * Full page pipeline: shared fetches, `allPages.html` merge, header/footer.
 * Body markup comes from `generateShopBody` / `generateCategoryBody` (`{ bodyHtml, categoryNames, pageTitle }`).
 */

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
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
}

/**
 * @param {string} js
 */
function wrapInlineScript(js) {
  const safe = js.replace(/<\/script>/gi, "<\\/script>");
  return `<script>\n${safe}\n</script>`;
}

function normalizeTreePath(raw) {
  const trimmed = String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/")
    .toLowerCase();
}

function resolveCategoryNameFromSlug(slug, products) {
  const categories = window.productData.getProductsByCategory(products);
  const key = String(slug || "").trim().toLowerCase();
  const target = categories.find((c) => c.slug === key);
  if (!target) {
    throw new Error(`Category not found for path segment: ${slug}`);
  }
  return target.name;
}

/**
 * @param {object} bodyPayload
 * @param {string} bodyPayload.bodyHtml
 * @param {string[]} bodyPayload.categoryNames
 * @param {string} bodyPayload.pageTitle
 */
async function mergeBodyIntoFullHtml(
  shopData,
  navigationConfig,
  pageTemplate,
  setBaseSource,
  bodyPayload
) {
  const { bodyHtml, categoryNames, pageTitle } = bodyPayload;
  const { headerHtml, footerHtml, faviconPath, siteCssPath } =
    await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig, {
      categoryNames,
    });

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: pageTitle,
    FAVICON_PATH: faviconPath,
    SITE_CSS_PATH: siteCssPath,
    SET_BASE_SCRIPT: wrapInlineScript(setBaseSource),
    HEADER: headerHtml,
    BODY_CONTENT: bodyHtml,
    FOOTER: footerHtml,
  });
}

/**
 * @param {string} treePath - Same shape as file-tree `href` (e.g. `shop`, `shop/my-category`).
 * @returns {Promise<string>} Complete HTML document.
 * Named `runGenerateAnyPage` so we do not create `window.generateAnyPage` as a function before assigning the API object (which would break `previewAnyPage`’s call to the generator).
 */
async function runGenerateAnyPage(treePath) {
  let html = "";
  const path = normalizeTreePath(treePath);

  const [shopData, navigationConfig, pageTemplate, setBaseSource, productData] = await Promise.all([
    fetchJson("../../shared-assets/config/shopData.json"),
    fetchJson("../../shared-assets/config/navigation.json"),
    fetchText("./templates/pages/allPages.html"),
    fetchText("./setBase.js"),
    window.productData.fetchProductDataJson(),
  ]);
  const products = Array.isArray(productData?.products) ? productData.products : [];
  const ctxBase = { shopData, navigationConfig, products };

  if (path === "shop") {
    const gen = window.generateShopBody?.generateShopBody;
    if (typeof gen !== "function") {
      throw new Error("generateShopBody.js must be loaded before preview.");
    }
    const bodyPayload = await gen(ctxBase);
    html = await mergeBodyIntoFullHtml(
      shopData,
      navigationConfig,
      pageTemplate,
      setBaseSource,
      bodyPayload
    );
    return html;
  }

  if (path.startsWith("shop/")) {
    const slug = path.slice("shop/".length);
    if (!slug) {
      throw new Error('Invalid path: expected "shop/<category-slug>".');
    }
    const categoryName = resolveCategoryNameFromSlug(slug, products);
    const gen = window.generateCategoryBody?.generateCategoryBody;
    if (typeof gen !== "function") {
      throw new Error("generateCategoryBody.js must be loaded before preview.");
    }
    const bodyPayload = await gen({ ...ctxBase, categoryName });
    html = await mergeBodyIntoFullHtml(
      shopData,
      navigationConfig,
      pageTemplate,
      setBaseSource,
      bodyPayload
    );
    return html;
  }

  throw new Error(`No preview generator for path: ${treePath}`);
}

function replaceDocumentWithHtml(html) {
  document.open();
  document.write(html);
  document.close();
}

async function previewAnyPage(treePath) {
  const html = await runGenerateAnyPage(treePath);
  replaceDocumentWithHtml(html);
}

window.generateAnyPage = {
  generateAnyPage: runGenerateAnyPage,
  previewAnyPage,
  fetchJson,
  fetchText,
  applyTemplate,
};
