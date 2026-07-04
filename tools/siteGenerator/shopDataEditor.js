(function () {
  const SHOP_DATA_URL = "../../shared-assets/config/shopData.json";

  /** In-memory unsaved shop data edits (session-only). */
  let shopDataOverlay = null;

  /** Last loaded shopData.json (before overlay); used for image public URL resolution. */
  let resolvedShopDataCache = null;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function stripHtml(html) {
    return String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getDeployVersion(shopData) {
    const v = Number(shopData?.deployVersion);
    return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  }

  function bumpDeployVersion(shopData) {
    const base = shopData && typeof shopData === "object" ? shopData : {};
    return { ...base, deployVersion: getDeployVersion(base) + 1 };
  }

  function defaultShopData() {
    return {
      deployVersion: 1,
      shopName: "",
      owner: "",
      about: "",
      shopFocus: [],
      websites: { primary: "", images: "", imagesRepo: "", etsy: "", newsletterSignup: "" },
      paypal: { clientId: "", environment: "sandbox", buyerCountry: "" },
      analytics: { measurementId: "" },
      branding: { faviconPath: "" },
      blog: { title: "Blog", description: "" },
      newsletter: { label: "" },
      categories: {},
      contact: {
        email: "",
        phone: "",
        address: { line1: "", city: "", state: "", postalCode: "", country: "" },
      },
      social: {
        instagram: { handle: "", url: "", verified: false, notes: "" },
        facebook: { handle: "", url: "", verified: false, notes: "" },
      },
    };
  }

  function normalizeCategories(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return {};
    }
    const out = {};
    for (const [slug, entry] of Object.entries(raw)) {
      const key = String(slug || "").trim();
      if (!key) {
        continue;
      }
      const obj = entry && typeof entry === "object" ? entry : {};
      const name = String(obj.name ?? "").trim();
      const description = String(obj.description ?? "").trim();
      if (!name && !description) {
        continue;
      }
      out[key] = { name, description };
    }
    return out;
  }

  /**
   * Display name and SEO intro for a shop category page.
   * @param {object | null | undefined} shopData
   * @param {string} categorySlug
   * @param {string} fallbackName - from product CATEGORY field
   * @returns {{ displayName: string, description: string }}
   */
  function resolveCategoryPageCopy(shopData, categorySlug, fallbackName) {
    const slug = String(categorySlug || "").trim();
    const fallback = String(fallbackName || "").trim();
    const entry =
      shopData?.categories && typeof shopData.categories === "object" ? shopData.categories[slug] : null;
    const configuredName = String(entry?.name ?? "").trim();
    const description = String(entry?.description ?? "").trim();
    return {
      displayName: configuredName || fallback,
      description,
    };
  }

  function normalizeShopData(raw) {
    const base = defaultShopData();
    const input = raw && typeof raw === "object" ? raw : {};
    const next = cloneJson(base);
    const deployVersion = Number(input.deployVersion);
    if (Number.isFinite(deployVersion) && deployVersion > 0) {
      next.deployVersion = Math.floor(deployVersion);
    } else {
      delete next.deployVersion;
    }
    next.shopName = String(input.shopName ?? "").trim();
    next.owner = String(input.owner ?? "").trim();
    next.about = aboutToPlainText(input.about);
    next.shopFocus = Array.isArray(input.shopFocus)
      ? input.shopFocus.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    next.websites = { ...next.websites, ...(input.websites && typeof input.websites === "object" ? input.websites : {}) };
    next.websites.primary = String(next.websites.primary ?? "").trim();
    next.websites.images = normalizeImagesBaseUrl(next.websites.images);
    next.websites.imagesRepo = normalizeImagesRepoFullName(next.websites.imagesRepo);
    next.websites.etsy = String(next.websites.etsy ?? "").trim();
    next.websites.newsletterSignup = String(next.websites.newsletterSignup ?? "").trim();
    next.paypal = { ...next.paypal, ...(input.paypal && typeof input.paypal === "object" ? input.paypal : {}) };
    next.analytics = {
      ...next.analytics,
      ...(input.analytics && typeof input.analytics === "object" ? input.analytics : {}),
    };
    next.analytics.measurementId = String(next.analytics.measurementId ?? "").trim();
    next.branding = {
      ...next.branding,
      ...(input.branding && typeof input.branding === "object" ? input.branding : {}),
    };
    next.blog = { ...next.blog, ...(input.blog && typeof input.blog === "object" ? input.blog : {}) };
    next.newsletter = {
      ...next.newsletter,
      ...(input.newsletter && typeof input.newsletter === "object" ? input.newsletter : {}),
    };
    next.newsletter.label = String(next.newsletter.label ?? "").trim();
    next.categories = normalizeCategories(input.categories);
    next.contact = {
      ...next.contact,
      ...(input.contact && typeof input.contact === "object" ? input.contact : {}),
      address: {
        ...next.contact.address,
        ...(input.contact?.address && typeof input.contact.address === "object" ? input.contact.address : {}),
      },
    };
    for (const key of ["instagram", "facebook"]) {
      const social = input.social?.[key];
      if (social && typeof social === "object") {
        next.social[key] = { ...next.social[key], ...social };
      }
    }
    return next;
  }

  /** Plain text for the editor; legacy HTML is stripped on load. */
  function aboutToPlainText(about) {
    const raw = String(about ?? "").trim();
    if (!raw) {
      return "";
    }
    if (raw.includes("<")) {
      return stripHtml(raw);
    }
    return raw.replace(/\s+/g, " ").trim();
  }

  function normalizeImagesBaseUrl(url) {
    return String(url ?? "").trim().replace(/\/+$/, "");
  }

  function normalizeImagesRepoFullName(fullName) {
    const s = String(fullName ?? "").trim();
    if (!s) {
      return "";
    }
    const parsed = window.githubAuth?.parseRepoFullName?.(s);
    if (parsed) {
      return `${parsed.owner}/${parsed.repo}`;
    }
    try {
      const u = new URL(s.includes("://") ? s : `https://${s}`);
      const host = u.hostname.toLowerCase();
      const parts = u.pathname.split("/").filter(Boolean);
      if (host === "github.com" && parts.length >= 2) {
        return `${parts[0]}/${parts[1]}`;
      }
      const projectPages = host.match(/^([^.]+)\.github\.io$/i);
      if (projectPages && parts.length >= 1) {
        return `${projectPages[1]}/${parts[0]}`;
      }
    } catch {
      /* not a URL */
    }
    return s.replace(/^\/+|\/+$/g, "");
  }

  function reposMatchConfigured(owner, repo, configuredFullName) {
    const configured = normalizeImagesRepoFullName(configuredFullName);
    if (!configured) {
      return false;
    }
    const parsed = window.githubAuth?.parseRepoFullName?.(configured);
    if (!parsed || !owner || !repo) {
      return false;
    }
    return (
      String(owner).toLowerCase() === String(parsed.owner).toLowerCase() &&
      String(repo) === String(parsed.repo)
    );
  }

  function getEffectiveShopDataForUrls() {
    const base = resolvedShopDataCache || defaultShopData();
    return applyShopDataOverlay(base);
  }

  /**
   * Public image URL for a file in a GitHub repo. Uses websites.images when the repo matches websites.imagesRepo.
   * @param {string} owner
   * @param {string} repo
   * @param {string} filePath
   * @param {string} [branch]
   * @param {object} [shopData]
   * @returns {string}
   */
  function buildImagePublicUrl(owner, repo, filePath, branch, shopData) {
    const path = String(filePath || "").trim().replace(/^\/+/, "");
    if (!path || !owner || !repo) {
      return "";
    }
    const shop = shopData ? normalizeShopData(shopData) : getEffectiveShopDataForUrls();
    const baseUrl = normalizeImagesBaseUrl(shop.websites?.images);
    const imagesRepo = normalizeImagesRepoFullName(shop.websites?.imagesRepo);

    if (baseUrl && reposMatchConfigured(owner, repo, imagesRepo)) {
      const encodedPath = path.split("/").map((segment) => encodeURIComponent(segment)).join("/");
      return `${baseUrl}/${encodedPath}`;
    }

    if (window.githubAuth?.buildBlobRawContentUrl) {
      return window.githubAuth.buildBlobRawContentUrl(owner, repo, filePath, branch);
    }
    return "";
  }

  async function ensureShopDataCacheForUrls() {
    if (!resolvedShopDataCache) {
      await fetchShopDataJson();
    }
    return getEffectiveShopDataForUrls();
  }

  function readShopDataOverlay() {
    return shopDataOverlay && typeof shopDataOverlay === "object" ? shopDataOverlay : null;
  }

  function writeShopDataOverlay(data) {
    shopDataOverlay = normalizeShopData(data);
  }

  function clearShopDataOverlay() {
    shopDataOverlay = null;
  }

  function hasShopDataOverlay() {
    return readShopDataOverlay() !== null;
  }

  function applyShopDataOverlay(base) {
    const overlay = readShopDataOverlay();
    if (!overlay) {
      return normalizeShopData(base);
    }
    return normalizeShopData({ ...normalizeShopData(base), ...overlay });
  }

  async function fetchShopDataJson() {
    const data =
      typeof window.githubAuth?.loadJson === "function"
        ? await window.githubAuth.loadJson(SHOP_DATA_URL)
        : await (async () => {
            const resolved = new URL(SHOP_DATA_URL, window.location.href).href;
            const response = await fetch(resolved, { cache: "no-store" });
            if (!response.ok) {
              throw new Error(`Failed to load shop data: ${SHOP_DATA_URL} (${response.status})`);
            }
            return response.json();
          })();
    resolvedShopDataCache = normalizeShopData(data);
    return applyShopDataOverlay(resolvedShopDataCache);
  }

  function shopFocusFromText(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function shopFocusToText(list) {
    return (Array.isArray(list) ? list : [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function categoriesFromForm(form) {
    const out = {};
    if (!form) {
      return out;
    }
    for (const block of form.querySelectorAll("[data-shop-category-slug]")) {
      const slug = String(block.getAttribute("data-shop-category-slug") || "").trim();
      if (!slug) {
        continue;
      }
      const nameEl = block.querySelector("[data-shop-category-name]");
      const descEl = block.querySelector("[data-shop-category-description]");
      const name = String(nameEl?.value ?? "").trim();
      const description = String(descEl?.value ?? "").trim();
      if (name || description) {
        out[slug] = { name, description };
      }
    }
    return out;
  }

  function shopDataFromForm(form) {
    const get = (name) => {
      const el = form.elements.namedItem(name);
      if (!el) {
        return "";
      }
      if (el.type === "checkbox") {
        return el.checked;
      }
      return String(el.value ?? "").trim();
    };

    return normalizeShopData({
      shopName: get("shopName"),
      owner: get("owner"),
      about: get("about"),
      shopFocus: shopFocusFromText(get("shopFocus")),
      websites: {
        primary: get("websitesPrimary"),
        images: get("websitesImages"),
        imagesRepo: get("websitesImagesRepo"),
        etsy: get("websitesEtsy"),
        newsletterSignup: get("websitesNewsletter"),
      },
      paypal: {
        clientId: get("paypalClientId"),
        environment: get("paypalEnvironment") || "sandbox",
        buyerCountry: get("paypalBuyerCountry"),
      },
      analytics: {
        measurementId: get("analyticsMeasurementId"),
      },
      branding: {
        faviconPath: get("faviconPath"),
      },
      blog: {
        title: get("blogTitle"),
        description: get("blogDescription"),
      },
      newsletter: {
        label: get("newsletterLabel"),
      },
      contact: {
        email: get("contactEmail"),
        phone: get("contactPhone"),
        address: {
          line1: get("addressLine1"),
          city: get("addressCity"),
          state: get("addressState"),
          postalCode: get("addressPostalCode"),
          country: get("addressCountry"),
        },
      },
      social: {
        instagram: {
          handle: get("instagramHandle"),
          url: get("instagramUrl"),
          verified: get("instagramVerified") === true,
          notes: get("instagramNotes"),
        },
        facebook: {
          handle: get("facebookHandle"),
          url: get("facebookUrl"),
          verified: get("facebookVerified") === true,
          notes: get("facebookNotes"),
        },
      },
      categories: categoriesFromForm(form),
    });
  }

  function fillCategoryFields(form, categoriesConfig) {
    if (!form) {
      return;
    }
    const config = categoriesConfig && typeof categoriesConfig === "object" ? categoriesConfig : {};
    for (const block of form.querySelectorAll("[data-shop-category-slug]")) {
      const slug = String(block.getAttribute("data-shop-category-slug") || "").trim();
      const entry = config[slug] || {};
      const nameEl = block.querySelector("[data-shop-category-name]");
      const descEl = block.querySelector("[data-shop-category-description]");
      if (nameEl) {
        nameEl.value = String(entry.name ?? "").trim();
      }
      if (descEl) {
        descEl.value = String(entry.description ?? "").trim();
      }
    }
  }

  function fillForm(form, data) {
    const shop = normalizeShopData(data);
    const set = (name, value) => {
      const el = form.elements.namedItem(name);
      if (!el) {
        return;
      }
      if (el.type === "checkbox") {
        el.checked = Boolean(value);
        return;
      }
      el.value = value == null ? "" : String(value);
    };

    set("shopName", shop.shopName);
    set("owner", shop.owner);
    set("about", shop.about);
    set("shopFocus", shopFocusToText(shop.shopFocus));
    set("websitesPrimary", shop.websites?.primary);
    set("websitesImages", shop.websites?.images);
    set("websitesImagesRepo", shop.websites?.imagesRepo);
    set("websitesEtsy", shop.websites?.etsy);
    set("websitesNewsletter", shop.websites?.newsletterSignup);
    set("paypalClientId", shop.paypal?.clientId);
    set("paypalEnvironment", shop.paypal?.environment || "sandbox");
    set("paypalBuyerCountry", shop.paypal?.buyerCountry);
    set("analyticsMeasurementId", shop.analytics?.measurementId);
    set("faviconPath", shop.branding?.faviconPath);
    set("blogTitle", shop.blog?.title);
    set("blogDescription", shop.blog?.description);
    set("newsletterLabel", shop.newsletter?.label);
    set("contactEmail", shop.contact?.email);
    set("contactPhone", shop.contact?.phone);
    set("addressLine1", shop.contact?.address?.line1);
    set("addressCity", shop.contact?.address?.city);
    set("addressState", shop.contact?.address?.state);
    set("addressPostalCode", shop.contact?.address?.postalCode);
    set("addressCountry", shop.contact?.address?.country);
    set("instagramHandle", shop.social?.instagram?.handle);
    set("instagramUrl", shop.social?.instagram?.url);
    set("instagramVerified", shop.social?.instagram?.verified);
    set("instagramNotes", shop.social?.instagram?.notes);
    set("facebookHandle", shop.social?.facebook?.handle);
    set("facebookUrl", shop.social?.facebook?.url);
    set("facebookVerified", shop.social?.facebook?.verified);
    set("facebookNotes", shop.social?.facebook?.notes);
    fillCategoryFields(form, shop.categories);
  }

  function buildCategoryPagesSection(catalogCategories) {
    const catSection = section("Category pages");
    const hint = document.createElement("p");
    hint.className = "shop-data-hint";
    hint.textContent =
      "Display name and intro paragraph for each shop category (from product data). Shown on category pages and used for SEO meta descriptions.";
    catSection.appendChild(hint);

    const list = Array.isArray(catalogCategories) ? catalogCategories : [];
    if (list.length === 0) {
      const empty = document.createElement("p");
      empty.className = "shop-data-hint";
      empty.textContent = "No categories found in product data.";
      catSection.appendChild(empty);
      return catSection;
    }

    for (const category of list) {
      const slug = String(category.slug || "").trim();
      if (!slug) {
        continue;
      }
      const block = document.createElement("fieldset");
      block.className = "shop-data-category-block";
      block.setAttribute("data-shop-category-slug", slug);

      const legend = document.createElement("legend");
      const productName = String(category.name || "").trim();
      legend.textContent = productName ? `${productName} · ${slug}` : slug;
      block.appendChild(legend);

      const nameWrap = document.createElement("div");
      nameWrap.className = "shop-data-field";
      const nameLabel = document.createElement("label");
      nameLabel.className = "shop-data-label";
      nameLabel.textContent = "Display name";
      const nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.setAttribute("data-shop-category-name", "");
      nameInput.placeholder = productName || slug;
      nameLabel.setAttribute("for", `shop-category-name-${slug}`);
      nameInput.id = `shop-category-name-${slug}`;
      nameWrap.appendChild(nameLabel);
      nameWrap.appendChild(nameInput);
      block.appendChild(nameWrap);

      const descWrap = document.createElement("div");
      descWrap.className = "shop-data-field";
      const descLabel = document.createElement("label");
      descLabel.className = "shop-data-label";
      descLabel.textContent = "Intro paragraph (SEO)";
      const descInput = document.createElement("textarea");
      descInput.rows = 3;
      descInput.setAttribute("data-shop-category-description", "");
      descLabel.setAttribute("for", `shop-category-desc-${slug}`);
      descInput.id = `shop-category-desc-${slug}`;
      descWrap.appendChild(descLabel);
      descWrap.appendChild(descInput);
      block.appendChild(descWrap);

      catSection.appendChild(block);
    }

    return catSection;
  }

  function field(labelText, name, options = {}) {
    const id = `shop-data-${name}`;
    const wrap = document.createElement("div");
    wrap.className = "shop-data-field";
    const label = document.createElement("label");
    label.className = "shop-data-label";
    label.setAttribute("for", id);
    label.textContent = labelText;
    wrap.appendChild(label);

    let control;
    if (options.type === "textarea") {
      control = document.createElement("textarea");
      control.rows = options.rows || 3;
    } else if (options.type === "select") {
      control = document.createElement("select");
      for (const opt of options.options || []) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        control.appendChild(option);
      }
    } else if (options.type === "checkbox") {
      control = document.createElement("input");
      control.type = "checkbox";
      label.className = "shop-data-label shop-data-label--checkbox";
      label.insertBefore(control, label.firstChild);
      control.id = id;
      control.name = name;
      wrap.appendChild(label);
      if (options.hint) {
        const hint = document.createElement("p");
        hint.className = "shop-data-hint";
        hint.textContent = options.hint;
        wrap.appendChild(hint);
      }
      return wrap;
    } else {
      control = document.createElement("input");
      control.type = options.inputType || "text";
    }

    control.id = id;
    control.name = name;
    if (options.placeholder) {
      control.placeholder = options.placeholder;
    }
    if (!options.type || options.type !== "checkbox") {
      wrap.appendChild(control);
    }
    if (options.hint) {
      const hint = document.createElement("p");
      hint.className = "shop-data-hint";
      hint.textContent = options.hint;
      wrap.appendChild(hint);
    }
    return wrap;
  }

  function section(title) {
    const el = document.createElement("fieldset");
    el.className = "shop-data-section";
    const legend = document.createElement("legend");
    legend.textContent = title;
    el.appendChild(legend);
    return el;
  }

  async function initShopDataEditor(options = {}) {
    const rootId = options.rootId || "shop-data-editor-root";
    const root = document.getElementById(rootId);
    if (!root) {
      return;
    }

    root.innerHTML = "";
    root.classList.add("shop-data-panel");

    const details = document.createElement("details");
    details.className = "shop-data-details";

    const summary = document.createElement("summary");
    summary.className = "shop-data-summary";
    summary.textContent = "Shop data";
    summary.dataset.deploySummary = "true";

    const body = document.createElement("div");
    body.className = "shop-data-body";
    body.innerHTML = `<p class="shop-data-loading">Loading shop data…</p>`;

    details.appendChild(summary);
    details.appendChild(body);
    root.appendChild(details);

    let baseData;
    let catalogCategories = [];
    try {
      const productDataPromise =
        typeof window.productData?.fetchProductDataJson === "function"
          ? window.productData.fetchProductDataJson()
          : Promise.resolve({ products: [] });
      const [shopData, productData] = await Promise.all([fetchShopDataJson(), productDataPromise]);
      baseData = shopData;
      const products = Array.isArray(productData?.products) ? productData.products : [];
      const visible =
        typeof window.productData?.filterVisibleProducts === "function"
          ? window.productData.filterVisibleProducts(products)
          : products;
      if (typeof window.productData?.getProductsByCategory === "function") {
        catalogCategories = window.productData.getProductsByCategory(visible);
      }
    } catch (err) {
      body.innerHTML = `<p class="shop-data-error">${escapeHtml(err?.message || String(err))}</p>`;
      return;
    }

    const deployV = getDeployVersion(baseData);
    summary.textContent = deployV > 0 ? `Shop data · deploy v${deployV}` : "Shop data";

    body.innerHTML = "";

    const intro = document.createElement("p");
    intro.className = "shop-data-intro";
    intro.textContent =
      "Edit shared-assets/config/shopData.json. The shop intro is a single plain-text paragraph on the shop page. Publish the site after saving to update live HTML.";
    body.appendChild(intro);

    const form = document.createElement("form");
    form.className = "shop-data-form";
    form.noValidate = true;

    const shopSection = section("Shop");
    shopSection.appendChild(field("Shop name", "shopName"));
    shopSection.appendChild(field("Owner", "owner"));
    shopSection.appendChild(
      field("Shop intro (short paragraph)", "about", {
        type: "textarea",
        rows: 4,
        hint: "Plain text only — shown as one paragraph on the shop landing page.",
      }),
    );
    shopSection.appendChild(
      field("Shop focus tags (one per line)", "shopFocus", {
        type: "textarea",
        rows: 4,
      }),
    );
    form.appendChild(shopSection);

    form.appendChild(buildCategoryPagesSection(catalogCategories));

    const webSection = section("Websites");
    webSection.appendChild(field("Primary site URL", "websitesPrimary", { inputType: "url" }));
    webSection.appendChild(
      field("Images CDN URL", "websitesImages", {
        inputType: "url",
        placeholder: "https://images.contraptioncart.com",
        hint: "Custom domain for the GitHub Pages images repository (no trailing slash).",
      }),
    );
    webSection.appendChild(
      field("Images repository (owner/repo)", "websitesImagesRepo", {
        placeholder: "shasabolton/my-images-repo",
        hint: "GitHub owner/repo (e.g. shasabolton/images). Also accepts github.com or username.github.io/repo URLs. When the selected images repo matches, Copy URL and saves use the images CDN above.",
      }),
    );
    webSection.appendChild(field("Etsy shop URL", "websitesEtsy", { inputType: "url" }));
    webSection.appendChild(field("Newsletter signup URL", "websitesNewsletter", { inputType: "url" }));
    form.appendChild(webSection);

    const paySection = section("PayPal");
    paySection.appendChild(field("Client ID", "paypalClientId"));
    paySection.appendChild(
      field("Environment", "paypalEnvironment", {
        type: "select",
        options: [
          { value: "sandbox", label: "sandbox" },
          { value: "live", label: "live" },
        ],
      }),
    );
    paySection.appendChild(field("Buyer country (ISO)", "paypalBuyerCountry", { placeholder: "AU" }));
    form.appendChild(paySection);

    const analyticsSection = section("Google Analytics (GA4)");
    analyticsSection.appendChild(
      field("Measurement ID", "analyticsMeasurementId", {
        placeholder: "G-XXXXXXXXXX",
        hint: "From GA4 Admin → Data streams → your web stream. Leave blank to disable analytics on generated pages.",
      }),
    );
    form.appendChild(analyticsSection);

    const brandSection = section("Branding");
    brandSection.appendChild(field("Favicon path", "faviconPath"));
    form.appendChild(brandSection);

    const blogSection = section("Blog");
    blogSection.appendChild(field("Blog title", "blogTitle"));
    blogSection.appendChild(field("Blog description", "blogDescription", { type: "textarea", rows: 2 }));
    form.appendChild(blogSection);

    const newsletterSection = section("Newsletter");
    newsletterSection.appendChild(
      field("Email signup message", "newsletterLabel", {
        type: "textarea",
        rows: 3,
        hint: "Shown above the footer subscribe form. Leave blank to use “Newsletter”.",
      }),
    );
    form.appendChild(newsletterSection);

    const contactSection = section("Contact");
    contactSection.appendChild(field("Email", "contactEmail", { inputType: "email" }));
    contactSection.appendChild(field("Phone", "contactPhone", { inputType: "tel" }));
    contactSection.appendChild(field("Address line 1", "addressLine1"));
    contactSection.appendChild(field("City", "addressCity"));
    contactSection.appendChild(field("State / region", "addressState"));
    contactSection.appendChild(field("Postal code", "addressPostalCode"));
    contactSection.appendChild(field("Country", "addressCountry"));
    form.appendChild(contactSection);

    const socialSection = section("Social");
    socialSection.appendChild(field("Instagram handle", "instagramHandle"));
    socialSection.appendChild(field("Instagram URL", "instagramUrl", { inputType: "url" }));
    socialSection.appendChild(field("Instagram verified", "instagramVerified", { type: "checkbox" }));
    socialSection.appendChild(field("Instagram notes", "instagramNotes", { type: "textarea", rows: 2 }));
    socialSection.appendChild(field("Facebook handle", "facebookHandle"));
    socialSection.appendChild(field("Facebook URL", "facebookUrl", { inputType: "url" }));
    socialSection.appendChild(field("Facebook verified", "facebookVerified", { type: "checkbox" }));
    socialSection.appendChild(field("Facebook notes", "facebookNotes", { type: "textarea", rows: 2 }));
    form.appendChild(socialSection);

    fillForm(form, baseData);

    const footer = document.createElement("div");
    footer.className = "shop-data-footer";

    const status = document.createElement("span");
    status.className = "shop-data-status";
    status.setAttribute("aria-live", "polite");

    const saveLocalBtn = document.createElement("button");
    saveLocalBtn.type = "button";
    saveLocalBtn.className = "shop-data-btn";
    saveLocalBtn.textContent = "Apply to preview";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "shop-data-btn shop-data-btn--muted";
    resetBtn.textContent = "Discard local edits";

    const pushBtn = document.createElement("button");
    pushBtn.type = "button";
    pushBtn.className = "shop-data-btn shop-data-btn--primary";
    pushBtn.textContent = "Save shop data to GitHub";

    footer.appendChild(saveLocalBtn);
    footer.appendChild(resetBtn);
    footer.appendChild(pushBtn);
    footer.appendChild(status);

    form.appendChild(footer);
    body.appendChild(form);

    function setStatus(message, kind) {
      status.textContent = message || "";
      status.classList.remove("shop-data-status--ok", "shop-data-status--error");
      if (kind === "ok") {
        status.classList.add("shop-data-status--ok");
      } else if (kind === "error") {
        status.classList.add("shop-data-status--error");
      }
    }

    saveLocalBtn.addEventListener("click", () => {
      writeShopDataOverlay(shopDataFromForm(form));
      setStatus("Preview uses these values until you discard or push.", "ok");
    });

    resetBtn.addEventListener("click", async () => {
      clearShopDataOverlay();
      try {
        const resolved = new URL(SHOP_DATA_URL, window.location.href).href;
        const response = await fetch(resolved, { cache: "no-store" });
        const data = await response.json();
        fillForm(form, normalizeShopData(data));
        setStatus("Local edits discarded.", "ok");
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      }
    });

    pushBtn.addEventListener("click", async () => {
      const payload = shopDataFromForm(form);
      pushBtn.disabled = true;
      setStatus("Saving…", null);
      try {
        if (!window.githubAuth?.pushShopData) {
          throw new Error("GitHub shop data push is not available.");
        }
        await window.githubAuth.pushShopData(payload);
        clearShopDataOverlay();
        const refreshed = await fetchShopDataJson();
        fillForm(form, refreshed);
        const newV = getDeployVersion(refreshed);
        summary.textContent = newV > 0 ? `Shop data · deploy v${newV}` : "Shop data";
        setStatus("Saved to GitHub. Publish the site to update live HTML.", "ok");
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      } finally {
        pushBtn.disabled = false;
      }
    });
  }

  window.shopDataEditor = {
    fetchShopDataJson,
    normalizeShopData,
    normalizeCategories,
    resolveCategoryPageCopy,
    getDeployVersion,
    bumpDeployVersion,
    aboutToPlainText,
    hasShopDataOverlay,
    clearShopDataOverlay,
    buildImagePublicUrl,
    ensureShopDataCacheForUrls,
    initShopDataEditor,
  };
})();
