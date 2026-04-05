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
 * Wraps setBase.js source for safe inline embedding in HTML.
 * @param {string} js
 */
function wrapInlineScript(js) {
  const safe = js.replace(/<\/script>/gi, "<\\/script>");
  return `<script>\n${safe}\n</script>`;
}

/**
 * Fetches shared config, builds header/footer, runs buildBody, merges into `allPages.html`.
 * Returns one complete HTML string — the same string is used for `document.write` preview and
 * (later) file download.
 * @param {{ buildBody: (ctx: { shopData: object, navigationConfig: object, products: object[] }) => Promise<{ bodyHtml: string, categoryNames: string[], pageTitle: string }> }} options
 */
async function generatePage(options) {
  const { buildBody } = options;
  if (typeof buildBody !== "function") {
    throw new Error("generatePage: buildBody is required");
  }

  const [shopData, navigationConfig, pageTemplate, setBaseSource] = await Promise.all([
    fetchJson("../../shared-assets/config/shopData.json"),
    fetchJson("../../shared-assets/config/navigation.json"),
    fetchText("./templates/pages/allPages.html"),
    fetchText("./setBase.js"),
  ]);

  const { products } = await window.productData.fetchProductDataJson();
  const { bodyHtml, categoryNames, pageTitle } = await buildBody({
    shopData,
    navigationConfig,
    products,
  });

  const { headerHtml, footerHtml, shopName, faviconPath, siteCssPath } =
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

window.generatePage = {
  generatePage,
  fetchJson,
  fetchText,
  applyTemplate,
};
