(function () {
const EDITOR_ROOT = "tools/siteGenerator";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function normalizeProductPath(treePath) {
  return String(treePath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function parseProductSlugFromPath(treePath) {
  const path = normalizeProductPath(treePath);
  if (!path.startsWith("shop/") || path.length <= "shop/".length) {
    return null;
  }
  const slug = path.slice("shop/".length);
  if (!slug || slug.includes("/")) {
    return null;
  }
  return slug;
}

async function isEditableProductPath(treePath, products) {
  const slug = parseProductSlugFromPath(treePath);
  if (!slug) {
    return false;
  }
  const list = Array.isArray(products) ? products : [];
  const find = window.productData?.findProductBySlug;
  if (typeof find !== "function") {
    return false;
  }
  return Boolean(find(list, slug));
}

function getProductState() {
  return window.__productEditorState || null;
}

function getUniqueCategories(products) {
  const names = new Set();
  for (const row of Array.isArray(products) ? products : []) {
    const name = String(row?.CATEGORY || "").trim();
    if (name) {
      names.add(name);
    }
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

function buildProductTopbarHtml(pagePath) {
  const pickerUrl = `${EDITOR_ROOT}/index.html`;
  const previewUrl = `${EDITOR_ROOT}/index.html?path=${encodeURIComponent(pagePath)}`;
  return `<div class="content-edit-topbar" role="toolbar">
  <a href="${pickerUrl}">← Picker</a>
  <a href="${previewUrl}">Preview</a>
  <span data-github-push-root></span>
  <span class="content-edit-topbar-path">Editing product: ${escapeHtml(pagePath)}</span>
</div>`;
}

function readBooleanField(value) {
  if (value === true) {
    return true;
  }
  if (value === false) {
    return false;
  }
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (s === "true" || s === "1" || s === "yes") {
    return true;
  }
  if (s === "false" || s === "0" || s === "no") {
    return false;
  }
  return false;
}

function buildVariationFieldsHtml(index, row) {
  const n = index;
  const prefix = `VARIATION ${n}`;
  const type = String(row[`${prefix} TYPE`] || "");
  const name = String(row[`${prefix} NAME`] || "");
  const values = String(row[`${prefix} VALUES`] || "");
  const deltas = String(row[`${prefix} PRICE DELTA`] || "");
  return `<fieldset class="product-edit-variation">
  <legend>Variation ${n}</legend>
  <div class="content-edit-page-settings-grid">
    <div class="content-edit-field">
      <label for="product-edit-var${n}-type">Type</label>
      <input id="product-edit-var${n}-type" type="text" name="${prefix} TYPE" value="${escapeAttr(type)}" placeholder="Custom Property" />
    </div>
    <div class="content-edit-field">
      <label for="product-edit-var${n}-name">Name</label>
      <input id="product-edit-var${n}-name" type="text" name="${prefix} NAME" value="${escapeAttr(name)}" placeholder="Assembly" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-var${n}-values">Values</label>
      <input id="product-edit-var${n}-values" type="text" name="${prefix} VALUES" value="${escapeAttr(values)}" placeholder="Kit,Assembled" />
      <p class="content-edit-field-hint">Comma-separated option labels</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-var${n}-deltas">Price deltas</label>
      <input id="product-edit-var${n}-deltas" type="text" name="${prefix} PRICE DELTA" value="${escapeAttr(deltas)}" placeholder="0,20" />
      <p class="content-edit-field-hint">Comma-separated additive amounts (one per value)</p>
    </div>
  </div>
</fieldset>`;
}

function buildCategoryFieldHtml(row) {
  const category = String(row.CATEGORY || "").trim();
  const state = getProductState();
  const categories = getUniqueCategories(state?.productsFull || []);
  const categoryInList = category && categories.includes(category);
  const categoryOptions = categories
    .map((name) => {
      const selected = categoryInList && name === category ? " selected" : "";
      return `<option value="${escapeAttr(name)}"${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");
  const newSelected = categoryInList ? "" : " selected";
  const newInputHidden = categoryInList ? ' hidden=""' : "";

  return `<div class="content-edit-field">
  <label for="product-edit-category-select">Category</label>
  <select id="product-edit-category-select" data-product-category-select>
    ${categoryOptions}
    <option value="__new__"${newSelected}>New category…</option>
  </select>
  <input id="product-edit-category-new" class="product-edit-category-new" type="text" data-product-category-new value="${escapeAttr(category)}" placeholder="Enter new category name"${newInputHidden} />
  <p class="content-edit-field-hint">New categories appear in the shop file tree after push.</p>
</div>`;
}

function buildProductSettingsHtml(row, pagePath) {
  const digital = readBooleanField(row.DIGITAL);
  const hideProduct = readBooleanField(row.HIDE);
  const hideInstructions = readBooleanField(row["HIDE INSTRUCTIONS"]);

  return `<fieldset class="content-edit-page-settings product-edit-settings" data-product-edit-settings>
  <legend>Product settings</legend>
  <p class="content-edit-page-path-hint">Updates row in <code>shared-assets/config/productData.json</code> (SKU ${escapeHtml(String(row.SKU || ""))})</p>
  <div class="content-edit-page-settings-grid">
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-title">Title</label>
      <input id="product-edit-title" type="text" name="TITLE" value="${escapeAttr(String(row.TITLE || ""))}" />
      <p class="content-edit-field-hint">Etsy listing title (imported from CSV).</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-short-title">Short title</label>
      <input id="product-edit-short-title" type="text" name="SHORT_TITLE" value="${escapeAttr(String(row.SHORT_TITLE || ""))}" />
      <p class="content-edit-field-hint">Used on the website and navigation when set. Falls back to title when empty.</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-slug">Slug</label>
      <input id="product-edit-slug" type="text" name="SLUG" value="${escapeAttr(String(row.SLUG || ""))}" autocomplete="off" />
      <p class="content-edit-field-hint">Stable URL segment for <code>shop/&lt;slug&gt;</code>. Leave blank to derive from short title or title.</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-description">Description</label>
      <textarea id="product-edit-description" name="DESCRIPTION" rows="8">${escapeHtml(String(row.DESCRIPTION || ""))}</textarea>
    </div>
    <div class="content-edit-field">
      <label for="product-edit-price">Price</label>
      <input id="product-edit-price" type="text" name="PRICE" value="${escapeAttr(String(row.PRICE ?? ""))}" />
    </div>
    <div class="content-edit-field">
      <label for="product-edit-currency">Currency</label>
      <input id="product-edit-currency" type="text" name="CURRENCY_CODE" value="${escapeAttr(String(row.CURRENCY_CODE || "AUD"))}" />
    </div>
    <div class="content-edit-field">
      <label for="product-edit-quantity">Quantity</label>
      <input id="product-edit-quantity" type="text" name="QUANTITY" value="${escapeAttr(String(row.QUANTITY ?? ""))}" />
    </div>
    <div class="content-edit-field">
      <label for="product-edit-weight">Weight (kg)</label>
      <input id="product-edit-weight" type="text" name="WEIGHT_KG" value="${escapeAttr(String(row.WEIGHT_KG ?? ""))}" />
    </div>
    ${buildCategoryFieldHtml(row)}
    <div class="content-edit-field">
      <label for="product-edit-digital">Digital</label>
      <select id="product-edit-digital" name="DIGITAL">
        <option value="false"${digital ? "" : " selected"}>false (physical)</option>
        <option value="true"${digital ? " selected" : ""}>true (digital)</option>
      </select>
      <p class="content-edit-field-hint">Stored as boolean <code>true</code> or <code>false</code> in JSON.</p>
    </div>
    <div class="content-edit-field">
      <label for="product-edit-hide">Hide from shop and navigation</label>
      <select id="product-edit-hide" name="HIDE">
        <option value="false"${hideProduct ? "" : " selected"}>false</option>
        <option value="true"${hideProduct ? " selected" : ""}>true</option>
      </select>
      <p class="content-edit-field-hint">Hidden products stay editable but are omitted from shop listings and nav.</p>
    </div>
    <div class="content-edit-field">
      <label for="product-edit-sku">SKU</label>
      <input id="product-edit-sku" type="text" value="${escapeAttr(String(row.SKU || ""))}" readonly aria-readonly="true" />
      <p class="content-edit-field-hint">SKU is not changed on push (cart identity).</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-materials">Materials</label>
      <input id="product-edit-materials" type="text" name="MATERIALS" value="${escapeAttr(String(row.MATERIALS || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-tags">Tags</label>
      <input id="product-edit-tags" type="text" name="TAGS" value="${escapeAttr(String(row.TAGS || ""))}" />
      <p class="content-edit-field-hint">Comma-separated</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-redirects">Redirects</label>
      <input id="product-edit-redirects" type="text" name="REDIRECTS" value="${escapeAttr(
        Array.isArray(row.REDIRECTS) ? row.REDIRECTS.join(", ") : String(row.REDIRECTS || ""),
      )}" placeholder="shop/old-name, old-name" />
      <p class="content-edit-field-hint">Old paths that should redirect to this product. Comma-separated (e.g. <code>shop/calculator</code> or <code>calculator</code>).</p>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-legacy-url">Legacy shop URL</label>
      <input id="product-edit-legacy-url" type="text" name="LEGACY_SHOP_URL" value="${escapeAttr(String(row.LEGACY_SHOP_URL || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-etsy">Etsy listing URL</label>
      <input id="product-edit-etsy" type="text" name="ETSY_LISTING_URL" value="${escapeAttr(String(row.ETSY_LISTING_URL || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-video3">Video 3 URL</label>
      <input id="product-edit-video3" type="text" name="VIDEO3" value="${escapeAttr(String(row.VIDEO3 || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-etsy-video1">Etsy video 1 URL</label>
      <input id="product-edit-etsy-video1" type="text" name="ETSY_VIDEO1" value="${escapeAttr(String(row.ETSY_VIDEO1 || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-etsy-video2">Etsy video 2 URL</label>
      <input id="product-edit-etsy-video2" type="text" name="ETSY_VIDEO2" value="${escapeAttr(String(row.ETSY_VIDEO2 || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-etsy-video3">Etsy video 3 URL</label>
      <input id="product-edit-etsy-video3" type="text" name="ETSY_VIDEO3" value="${escapeAttr(String(row.ETSY_VIDEO3 || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="product-edit-instruction-videos">Instruction videos</label>
      <input id="product-edit-instruction-videos" type="text" name="INSTRUCTION VIDEOS" value="${escapeAttr(String(row["INSTRUCTION VIDEOS"] || ""))}" />
      <p class="content-edit-field-hint">Comma-separated YouTube or video URLs</p>
    </div>
    <div class="content-edit-field">
      <label for="product-edit-hide-instructions">Hide instructions</label>
      <select id="product-edit-hide-instructions" name="HIDE INSTRUCTIONS">
        <option value="false"${hideInstructions ? "" : " selected"}>false</option>
        <option value="true"${hideInstructions ? " selected" : ""}>true</option>
      </select>
    </div>
    <div class="content-edit-field content-edit-field--wide" data-product-carousel-mount></div>
  </div>
  ${buildVariationFieldsHtml(1, row)}
  ${buildVariationFieldsHtml(2, row)}
</fieldset>`;
}

function collectCategoryFromForm(form) {
  const select = form.querySelector("[data-product-category-select]");
  const input = form.querySelector("[data-product-category-new]");
  if (select?.value === "__new__") {
    return String(input?.value || "").trim();
  }
  return String(select?.value || "").trim();
}

function bindProductFormControls(form) {
  const select = form.querySelector("[data-product-category-select]");
  const input = form.querySelector("[data-product-category-new]");
  if (!select || !input) {
    return;
  }
  const syncCategoryUi = () => {
    const isNew = select.value === "__new__";
    if (isNew) {
      input.removeAttribute("hidden");
    } else {
      input.setAttribute("hidden", "");
      input.value = select.value;
    }
  };
  select.addEventListener("change", syncCategoryUi);
  syncCategoryUi();
}

function collectProductRowFromForm(form) {
  const state = getProductState();
  if (!state?.productRow) {
    throw new Error("Product editor state missing.");
  }
  const base = JSON.parse(JSON.stringify(state.productRow));
  const get = (name) => String(form.querySelector(`[name="${name}"]`)?.value ?? "").trim();

  const slugify = window.productData?.slugify;
  const parseRedirects = window.productData?.parseRedirectsList;

  base.TITLE = get("TITLE");
  base.SHORT_TITLE = get("SHORT_TITLE");
  const slugRaw = get("SLUG");
  base.SLUG = typeof slugify === "function" ? slugify(slugRaw) : slugRaw;
  const redirectsRaw = get("REDIRECTS");
  base.REDIRECTS =
    typeof parseRedirects === "function" ? parseRedirects(redirectsRaw) : redirectsRaw ? [redirectsRaw] : [];
  base.DESCRIPTION = get("DESCRIPTION");
  base.PRICE = get("PRICE");
  base.CURRENCY_CODE = get("CURRENCY_CODE") || "AUD";
  base.QUANTITY = get("QUANTITY");
  base.WEIGHT_KG = get("WEIGHT_KG");
  base.CATEGORY = collectCategoryFromForm(form);
  base.DIGITAL = readBooleanField(form.querySelector('[name="DIGITAL"]')?.value);
  base.HIDE = readBooleanField(form.querySelector('[name="HIDE"]')?.value);
  base.MATERIALS = get("MATERIALS");
  base.TAGS = get("TAGS");
  base.LEGACY_SHOP_URL = get("LEGACY_SHOP_URL");
  base.ETSY_LISTING_URL = get("ETSY_LISTING_URL");
  base.VIDEO3 = get("VIDEO3");
  base.ETSY_VIDEO1 = get("ETSY_VIDEO1");
  base.ETSY_VIDEO2 = get("ETSY_VIDEO2");
  base.ETSY_VIDEO3 = get("ETSY_VIDEO3");
  base["INSTRUCTION VIDEOS"] = get("INSTRUCTION VIDEOS");
  base["HIDE INSTRUCTIONS"] = readBooleanField(form.querySelector('[name="HIDE INSTRUCTIONS"]')?.value);
  base["VARIATION 1 TYPE"] = get("VARIATION 1 TYPE");
  base["VARIATION 1 NAME"] = get("VARIATION 1 NAME");
  base["VARIATION 1 VALUES"] = get("VARIATION 1 VALUES");
  base["VARIATION 1 PRICE DELTA"] = get("VARIATION 1 PRICE DELTA");
  base["VARIATION 2 TYPE"] = get("VARIATION 2 TYPE");
  base["VARIATION 2 NAME"] = get("VARIATION 2 NAME");
  base["VARIATION 2 VALUES"] = get("VARIATION 2 VALUES");
  base["VARIATION 2 PRICE DELTA"] = get("VARIATION 2 PRICE DELTA");

  const carouselApi = window.carouselEditor;
  const mapApi = window.productCarouselMap;
  if (!carouselApi || !mapApi) {
    throw new Error("Carousel editor modules must be loaded before product editor.");
  }
  const items = carouselApi.sanitizeCarouselItemsForSave(carouselApi.getCarouselItemsFromEditor(form));
  return mapApi.carouselItemsToProductRow(items, base);
}

function ensureStylesheet(href, options) {
  const normalized = String(href || "").trim();
  if (!normalized) {
    return;
  }
  const opts = options && typeof options === "object" ? options : {};
  let url = normalized;
  if (opts.cacheBust) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}t=${Date.now()}`;
  }
  const existing = document.querySelector(`link[rel="stylesheet"][data-href-base="${normalized}"]`);
  if (existing) {
    if (opts.cacheBust) {
      existing.href = url;
    }
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.setAttribute("data-href-base", normalized);
  document.head.appendChild(link);
}

async function mountProductEditPage(pagePath, row, headerFooter, shopData) {
  if (window.contentEditor?.ensureDocumentBaseForEdit) {
    await window.contentEditor.ensureDocumentBaseForEdit();
  }

  const { headerHtml, footerHtml, siteCssPath, siteJsPath } = headerFooter;
  ensureStylesheet(siteCssPath);
  ensureStylesheet(`${EDITOR_ROOT}/contentEditor.css`, { cacheBust: true });
  ensureStylesheet(`${EDITOR_ROOT}/imagesBrowser.css`, { cacheBust: true });

  const resolveTitle = window.productData?.resolveProductDisplayTitle;
  const title =
    typeof resolveTitle === "function"
      ? resolveTitle(row, "Product")
      : String(row.TITLE || "Product").trim() || "Product";
  const shopName = escapeHtml(shopData?.shopName || "Site");
  document.title = `${shopName} - Edit ${title}`;
  document.body.className = "content-edit-mode product-edit-mode";
  document.body.style.margin = "0";
  document.body.style.padding = "0";

  const settingsHtml = buildProductSettingsHtml(row, pagePath);
  document.body.innerHTML = `${buildProductTopbarHtml(pagePath)}
${headerHtml}
<main class="site-main product-edit-main">
<form class="product-edit-form" data-product-edit-form>
${settingsHtml}
</form>
</main>
${footerHtml}`;

  const form = document.querySelector("[data-product-edit-form]");
  const mount = form?.querySelector("[data-product-carousel-mount]");
  const carouselItems = window.productCarouselMap.productRowToCarouselItems(row);
  if (form && mount && window.carouselEditor?.mountCarouselEditor) {
    window.carouselEditor.mountCarouselEditor(mount, form, carouselItems, "Product images & video");
  }

  if (form) {
    bindProductFormControls(form);
  }

  if (window.contentEditor?.bindModalControls) {
    window.contentEditor.bindModalControls();
  }

  try {
    const script = document.createElement("script");
    script.src = siteJsPath;
    await new Promise((resolve, reject) => {
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${siteJsPath}`));
      document.body.appendChild(script);
    });
  } catch {
    // Non-fatal for editing.
  }

  if (window.githubAuth?.initEditPushUi) {
    window.githubAuth.initEditPushUi({
      pagePath,
      getPageData: () => collectProductRowFromForm(form),
      pushHandler: (path, data) => window.githubAuth.pushProductRow(path, data),
      publishHandler: (path, data, opts) => window.githubAuth.publishProductPageLive(path, data, opts),
      buildPublishOptions: async (pushResult) => {
        const state = getProductState();
        const products = Array.isArray(pushResult?.products)
          ? pushResult.products
          : state?.productsFull || [];
        return { products };
      },
    });
  }
}

async function bootEditProduct(treePath) {
  const slug = parseProductSlugFromPath(treePath);
  if (!slug) {
    throw new Error(`Edit mode for products requires shop/<product-slug>. Got: ${treePath}`);
  }

  const productData = await window.productData.fetchProductDataJson();
  const productsFull = Array.isArray(productData?.products) ? productData.products : [];
  const row = window.productData.findProductBySlug(productsFull, slug);
  if (!row) {
    throw new Error(`Product not found: shop/${slug}`);
  }

  const previewParams = window.previewTarget.parsePreviewTarget(window.location.search);
  const digitalFilter = previewParams?.digital ?? null;
  const productsForShop = window.productData.filterVisibleProducts(
    window.productData.filterProductsByDigital(productsFull, digitalFilter),
  );

  window.__productEditorState = {
    pagePath: normalizeProductPath(treePath),
    productSlug: slug,
    productRow: JSON.parse(JSON.stringify(row)),
    productsFull,
    products: productsForShop,
    carouselItemEdit: null,
  };

  const [shopData, navigationConfig, fileTreeConfig] = await Promise.all([
    window.generateAnyPage.fetchJson("../../shared-assets/config/shopData.json"),
    window.generateAnyPage.fetchJson("../../shared-assets/config/navigation.json"),
    window.generateAnyPage.fetchJson("../../shared-assets/config/fileTree.json"),
  ]);
  const homePageHref = window.homePage?.getHomePageHref
    ? window.homePage.getHomePageHref(fileTreeConfig)
    : null;

  const categories = window.productData.getProductsByCategory(productsForShop);
  const headerFooter = await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig, {
    categoryNames: categories.map((c) => c.name),
    homePageHref,
  });

  await mountProductEditPage(normalizeProductPath(treePath), row, headerFooter, shopData);
}

window.productEditor = {
  bootEditProduct,
  isEditableProductPath,
  parseProductSlugFromPath,
  collectProductRowFromForm,
};
})();
