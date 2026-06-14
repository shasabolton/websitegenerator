/**
 * Full page pipeline: shared fetches, `allPages.html` merge, header/footer.
 * Body markup comes from `generateCartBody`, `generateShopBody`, `generateCategoryBody`, or `generateProductBody` (`{ bodyHtml, categoryNames, pageTitle }`).
 */

function resolveFetchUrl(url) {
  const raw = String(url || "").trim();
  if (!raw || /^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }
  // Resolve against the document URL so `<base>` (added in edit/preview) does not break generator fetches.
  return new URL(raw, window.location.href).href;
}

async function fetchJson(url) {
  const resolved = resolveFetchUrl(url);
  const response = await fetch(resolved, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${url} (${response.status})`);
  }
  return response.json();
}

async function fetchText(url) {
  const resolved = resolveFetchUrl(url);
  const response = await fetch(resolved, { cache: "no-store" });
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
  bodyPayload,
  homePageHref = null,
  treePath = ""
) {
  const { bodyHtml, categoryNames, pageTitle, seoContext } = bodyPayload;
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
    homePageHref,
  });

  // Cart init only; ShoppingCart/productData stay loadable when `window` is reused (preview). Guards live inside those files.
  const shopNameJson = JSON.stringify(shopData?.shopName || "");
  const siteCartInitScript = wrapInlineScript(`window.siteCart = new ShoppingCart(${shopNameJson});`);

  const seo =
    typeof window.structuredData?.buildForPage === "function"
      ? window.structuredData.buildForPage({
          treePath,
          shopData,
          homePageHref,
          pageTitle,
          seoContext: seoContext && typeof seoContext === "object" ? seoContext : {},
        })
      : { headSeoHtml: "", structuredDataHtml: "" };

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: pageTitle,
    HEAD_SEO: seo.headSeoHtml || "",
    STRUCTURED_DATA: seo.structuredDataHtml || "",
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
 * @param {{ digital?: boolean | null, isNew?: boolean }} [options] - When `digital` is set, overrides the `digital` query param for shop listing filters. When `isNew` is set, uses default content page data instead of loading JSON.
 * @returns {Promise<string>} Complete HTML document.
 * Named `runGenerateAnyPage` so we do not create `window.generateAnyPage` as a function before assigning the API object (which would break `previewAnyPage`’s call to the generator).
 */
async function runGenerateAnyPage(treePath, options = {}) {
  let html = "";
  const path = normalizeTreePath(treePath);
  const publishContext =
    options.publishContext && typeof options.publishContext === "object" ? options.publishContext : null;

  const [shopData, pageTemplate, setBaseSource] = await Promise.all([
    typeof window.shopDataEditor?.fetchShopDataJson === "function"
      ? window.shopDataEditor.fetchShopDataJson()
      : fetchJson("../../shared-assets/config/shopData.json"),
    fetchText("./templates/pages/allPages.html"),
    fetchText("./setBase.js"),
  ]);

  let navigationConfig;
  let fileTreeConfig;
  let productData;
  if (publishContext) {
    navigationConfig =
      publishContext.navigation && typeof publishContext.navigation === "object"
        ? publishContext.navigation
        : { items: [] };
    fileTreeConfig =
      publishContext.fileTree && typeof publishContext.fileTree === "object"
        ? publishContext.fileTree
        : { items: [] };
    productData = { products: Array.isArray(publishContext.products) ? publishContext.products : [] };
  } else {
    [navigationConfig, fileTreeConfig, productData] = await Promise.all([
      fetchJson("../../shared-assets/config/navigation.json"),
      fetchJson("../../shared-assets/config/fileTree.json"),
      window.productData.fetchProductDataJson(),
    ]);
  }

  let effectiveFileTree = fileTreeConfig;
  let effectiveNavigation = navigationConfig;
  if (!publishContext && typeof window.displayFileTree?.applyFileTreeOverlay === "function") {
    effectiveFileTree = window.displayFileTree.applyFileTreeOverlay(fileTreeConfig);
    if (typeof window.githubAuth?.syncNavigationFromFileTree === "function") {
      effectiveNavigation = window.githubAuth.syncNavigationFromFileTree(effectiveFileTree, navigationConfig);
    }
  }
  const homePageHref = window.homePage?.getHomePageHref
    ? window.homePage.getHomePageHref(effectiveFileTree)
    : null;
  const productsFull = Array.isArray(productData?.products) ? productData.products : [];
  const contentPages = publishContext?.contentPages;
  const previewParams = window.previewTarget.parsePreviewTarget(window.location.search);
  const digitalFilter = Object.prototype.hasOwnProperty.call(options, "digital")
    ? options.digital
    : previewParams?.digital ?? null;
  const isNewPage = Object.prototype.hasOwnProperty.call(options, "isNew")
    ? options.isNew === true
    : previewParams?.isNew === true;
  const productsForShop = window.productData.filterVisibleProducts(
    window.productData.filterProductsByDigital(productsFull, digitalFilter),
  );
  const ctxBase = { shopData, navigationConfig: effectiveNavigation, products: productsForShop, homePageHref };

  if (path === "cart") {
    const gen = window.generateCartBody?.buildCartBody;
    if (typeof gen !== "function") {
      throw new Error("generateCartBody.js must be loaded before preview.");
    }
    const bodyPayload = await gen({ ...ctxBase, products: productsFull });
    html = await mergeBodyIntoFullHtml(
      shopData,
      effectiveNavigation,
      pageTemplate,
      setBaseSource,
      bodyPayload,
      homePageHref,
      path
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
      effectiveNavigation,
      pageTemplate,
      setBaseSource,
      bodyPayload,
      homePageHref,
      path
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
        effectiveNavigation,
        pageTemplate,
        setBaseSource,
        bodyPayload,
        homePageHref,
        path
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
      effectiveNavigation,
      pageTemplate,
      setBaseSource,
      bodyPayload,
      homePageHref,
      path
    );
    return html;
  }

  if (path === "blog") {
    const gen = window.generateContentBody?.generateBlogIndexBody;
    if (typeof gen !== "function") {
      throw new Error("generateContentBody.js must be loaded before preview.");
    }
    const bodyPayload = await gen({
      ...ctxBase,
      fileTree: effectiveFileTree,
      contentPages,
    });
    html = await mergeBodyIntoFullHtml(
      shopData,
      effectiveNavigation,
      pageTemplate,
      setBaseSource,
      bodyPayload,
      homePageHref,
      path
    );
    return html;
  }

  const isContentPath = window.generateContentBody?.isContentPagePath;
  if (typeof isContentPath === "function" && isContentPath(path)) {
    const pagePath = path;
    const fromData = window.generateContentBody?.generateContentPageBodyFromData;
    const fromPath = window.generateContentBody?.generateContentPageBody;
    const createDefault = window.generateContentBody?.createDefaultPageData;
    if (typeof fromData !== "function" || typeof fromPath !== "function") {
      throw new Error("generateContentBody.js must be loaded before preview.");
    }
    const pendingHint =
      isNewPage && typeof window.displayFileTree?.getPendingNewPage === "function"
        ? window.displayFileTree.getPendingNewPage(pagePath)
        : null;
    const contextPageData =
      contentPages && typeof contentPages.get === "function" ? contentPages.get(path) : null;
    const bodyPayload = contextPageData
      ? await fromData({ ...ctxBase, pagePath, pageData: contextPageData })
      : isNewPage
        ? await fromData({
            ...ctxBase,
            pagePath,
            pageData:
              typeof createDefault === "function"
                ? createDefault(pagePath, {
                    title: pendingHint?.title || "",
                    slug: pendingHint?.slug || "",
                    pageType: pendingHint?.pageType || undefined,
                  })
                : { meta: {}, blocks: [] },
          })
        : await fromPath({ ...ctxBase, pagePath });
    html = await mergeBodyIntoFullHtml(
      shopData,
      effectiveNavigation,
      pageTemplate,
      setBaseSource,
      bodyPayload,
      homePageHref,
      path
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
  mergeBodyIntoFullHtml,
  fetchJson,
  fetchText,
  applyTemplate,
};
