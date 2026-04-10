/**
 * Full page pipeline: shared fetches, `allPages.html` merge, header/footer.
 * Body markup comes from `generateCartBody`, `generateShopBody`, `generateCategoryBody`, or `generateProductBody` (`{ bodyHtml, categoryNames, pageTitle }`).
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
  const {
    headerHtml,
    footerHtml,
    faviconPath,
    siteCssPath,
    siteJsPath,
    productDataScriptPath,
    shoppingCartScriptPath,
    productInstructionVideosScriptPath,
  } = await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig, {
    categoryNames,
  });

  // Cart init only; ShoppingCart/productData stay loadable when `window` is reused (preview). Guards live inside those files.
  const shopNameJson = JSON.stringify(shopData?.shopName || "");
  const siteCartInitScript = wrapInlineScript(`window.siteCart = new ShoppingCart(${shopNameJson});`);

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: pageTitle,
    FAVICON_PATH: faviconPath,
    SITE_CSS_PATH: siteCssPath,
    SITE_JS_PATH: siteJsPath,
    PRODUCT_DATA_SCRIPT_PATH: productDataScriptPath,
    SHOPPING_CART_SCRIPT_PATH: shoppingCartScriptPath,
    PRODUCT_INSTRUCTION_VIDEOS_SCRIPT_PATH: productInstructionVideosScriptPath,
    SITE_CART_INIT_SCRIPT: siteCartInitScript,
    SET_BASE_SCRIPT: wrapInlineScript(setBaseSource),
    HEADER: headerHtml,
    BODY_CONTENT: bodyHtml,
    FOOTER: footerHtml,
  });
}

/**
 * @param {string} treePath - Same shape as file-tree `href` (e.g. `shop`, `shop/my-category`, `shop/product-slug`).
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
  const productsFull = Array.isArray(productData?.products) ? productData.products : [];
  const previewParams = window.previewTarget.parsePreviewTarget(window.location.search);
  const digitalFilter = previewParams?.digital ?? null;
  const productsForShop = window.productData.filterProductsByDigital(productsFull, digitalFilter);
  const ctxBase = { shopData, navigationConfig, products: productsForShop };

  if (path === "cart") {
    const gen = window.generateCartBody?.buildCartBody;
    if (typeof gen !== "function") {
      throw new Error("generateCartBody.js must be loaded before preview.");
    }
    const bodyPayload = await gen({ ...ctxBase, products: productsFull });
    html = await mergeBodyIntoFullHtml(
      shopData,
      navigationConfig,
      pageTemplate,
      setBaseSource,
      bodyPayload
    );
    return html;
  }

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
    const rest = path.slice("shop/".length);
    if (!rest) {
      throw new Error('Invalid path: expected "shop/<product-slug>" or "shop/<category-slug>".');
    }
    const segments = rest.split("/").filter(Boolean);
    if (segments.length !== 1) {
      throw new Error(
        `Invalid shop path: ${treePath} — use shop/<product-slug> or shop/<category-slug> (single segment only).`
      );
    }
    const segment = segments[0];
    const findProduct = window.productData?.findProductBySlug;
    if (typeof findProduct !== "function") {
      throw new Error("productData.findProductBySlug is required for shop paths.");
    }
    const rowFull = findProduct(productsFull, segment);
    if (rowFull) {
      if (!productsForShop.includes(rowFull)) {
        throw new Error(`Product not found: shop/${segment}`);
      }
      const gen = window.generateProductBody?.generateProductBody;
      if (typeof gen !== "function") {
        throw new Error("generateProductBody.js must be loaded before preview.");
      }
      const bodyPayload = await gen({
        ...ctxBase,
        catalogProducts: productsFull,
        productSlug: segment,
      });
      html = await mergeBodyIntoFullHtml(
        shopData,
        navigationConfig,
        pageTemplate,
        setBaseSource,
        bodyPayload
      );
      return html;
    }
    const categoryName = resolveCategoryNameFromSlug(segment, productsForShop);
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
