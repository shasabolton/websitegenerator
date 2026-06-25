function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchTemplate(url) {
  const raw = String(url || "").trim();
  const resolved =
    !raw || /^https?:\/\//i.test(raw) ? raw : new URL(raw, window.location.href).href;
  const response = await fetch(resolved, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load template: ${url} (${response.status})`);
  }
  return response.text();
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildShopCategoryHref(categoryName) {
  return `shop/${slugify(categoryName)}`;
}

function resolveNavHref(href, homePageHref) {
  const raw = String(href ?? "").trim();
  if (!raw || raw === "#") {
    return "#";
  }
  if (window.homePage?.resolvePublicHref) {
    return window.homePage.resolvePublicHref(raw, homePageHref);
  }
  return raw;
}

function buildNavigationHtml(navigationConfig, categoryNames = [], homePageHref = null) {
  const items = Array.isArray(navigationConfig?.items) ? navigationConfig.items : [];
  return items
    .map((item) => {
      const label = escapeHtml(item.label || "");
      const href = escapeHtml(resolveNavHref(item.href, homePageHref));
      const isShopItem = String(item?.label || "").trim().toLowerCase() === "shop";
      let children = Array.isArray(item.children) ? item.children : [];
      if (isShopItem && Array.isArray(categoryNames) && categoryNames.length > 0) {
        const autoChildren = categoryNames.map((category) => ({
          label: category,
          href: buildShopCategoryHref(category),
        }));
        children = [...children, ...autoChildren];
      }
      if (children.length === 0) {
        return `<li class="nav-item"><a href="${href}">${label}</a></li>`;
      }
      const childrenHtml = children
        .map((child) => {
          const childLabel = escapeHtml(child.label || "");
          const childHref = escapeHtml(resolveNavHref(child.href, homePageHref));
          return `<li><a href="${childHref}">${childLabel}</a></li>`;
        })
        .join("");

      return `
        <li class="nav-item nav-item-has-children">
          <a href="${href}">${label}</a>
          <ul class="submenu">${childrenHtml}</ul>
        </li>
      `;
    })
    .join("");
}

const instagramIconSvg = `<svg class="footer-social-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" y1="6.5" x2="17.51" y2="6.5" /></svg>`;

const facebookIconSvg = `<svg class="footer-social-svg" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /></svg>`;

function buildSocialLinksHtml(shopData) {
  const links = [];
  const instagram = shopData?.social?.instagram;
  const facebook = shopData?.social?.facebook;

  if (instagram?.url) {
    const url = escapeHtml(instagram.url);
    links.push(
      `<li class="footer-social-item"><a class="footer-social-link" href="${url}" target="_blank" rel="noreferrer noopener" aria-label="Instagram">${instagramIconSvg}</a></li>`
    );
  }

  if (facebook?.url) {
    const url = escapeHtml(facebook.url);
    links.push(
      `<li class="footer-social-item"><a class="footer-social-link" href="${url}" target="_blank" rel="noreferrer noopener" aria-label="Facebook">${facebookIconSvg}</a></li>`
    );
  }

  if (links.length === 0) {
    return '<ul class="footer-social-list"><li class="footer-social-item footer-social-item-text">Social links coming soon</li></ul>';
  }

  return `<ul class="footer-social-list">${links.join("")}</ul>`;
}

function buildFooterContactHtml(shopData) {
  const email = shopData?.contact?.email;
  if (!email) {
    return "";
  }

  const safeEmail = escapeHtml(email);
  return `Contact: <a href="mailto:${safeEmail}">${safeEmail}</a>`;
}

function buildFaviconPath(shopData) {
  return shopData?.branding?.faviconPath || "shared-assets/images/branding/favicon.jpg";
}

function buildGoogleSiteSearchHostname(shopData) {
  const raw = shopData?.websites?.primary;
  if (!raw || typeof raw !== "string") {
    return "";
  }
  try {
    return new URL(raw).hostname;
  } catch {
    return "";
  }
}

function buildSiteCssPath() {
  return "tools/siteGenerator/templates/css/site.css";
}

function buildSiteJsPath() {
  return "tools/siteGenerator/templates/js/image-carousel.js";
}

function buildProductDataScriptPath() {
  return "tools/editData/productData.js";
}

function buildShoppingCartScriptPath() {
  return "shared-assets/script/shoppingCart.js";
}

function buildProductInstructionVideosScriptPath() {
  return "shared-assets/script/productInstructionVideos.js";
}

function buildShipCountriesScriptPath() {
  return "shared-assets/script/shipCountries.js";
}

function buildDisplayCurrencyScriptPath() {
  return "shared-assets/script/displayCurrency.js";
}

function buildSiteSearchScriptPath() {
  return "shared-assets/script/siteSearch.js";
}

async function generateHeaderAndFooter(shopData, navigationConfig, options = {}) {
  const [headerTemplate, footerTemplate] = await Promise.all([
    fetchTemplate("./templates/partials/header.html"),
    fetchTemplate("./templates/partials/footer.html"),
  ]);

  const categoryNames = Array.isArray(options.categoryNames) ? options.categoryNames : [];
  const homePageHref = options.homePageHref ?? null;
  const navHtml = buildNavigationHtml(navigationConfig, categoryNames, homePageHref);
  const shopName = escapeHtml(shopData?.shopName || "Shop");
  const faviconPath = escapeHtml(buildFaviconPath(shopData));
  const siteCssPath = escapeHtml(buildSiteCssPath());
  const siteJsPath = escapeHtml(buildSiteJsPath());
  const productDataScriptPath = escapeHtml(buildProductDataScriptPath());
  const shoppingCartScriptPath = escapeHtml(buildShoppingCartScriptPath());
  const productInstructionVideosScriptPath = escapeHtml(buildProductInstructionVideosScriptPath());
  const shipCountriesScriptPath = escapeHtml(buildShipCountriesScriptPath());
  const displayCurrencyScriptPath = escapeHtml(buildDisplayCurrencyScriptPath());
  const siteSearchScriptPath = escapeHtml(buildSiteSearchScriptPath());

  const headerHtml = applyTemplate(headerTemplate, {
    SHOP_NAME: shopName,
    FAVICON_PATH: faviconPath,
    NAV_ITEMS: navHtml,
  });

  const footerHtml = applyTemplate(footerTemplate, {
    SHOP_NAME: shopName,
    SOCIAL_LINKS: buildSocialLinksHtml(shopData),
    CONTACT_BLOCK: buildFooterContactHtml(shopData),
  });

  return {
    headerHtml,
    footerHtml,
    shopName,
    faviconPath,
    siteCssPath,
    siteJsPath,
    productDataScriptPath,
    shoppingCartScriptPath,
    productInstructionVideosScriptPath,
    shipCountriesScriptPath,
    displayCurrencyScriptPath,
    siteSearchScriptPath,
  };
}

window.generateHeaderAndFooter = {
  escapeHtml,
  slugify,
  buildShopCategoryHref,
  buildGoogleSiteSearchHostname,
  buildSiteJsPath,
  buildProductDataScriptPath,
  buildShoppingCartScriptPath,
  buildProductInstructionVideosScriptPath,
  buildDisplayCurrencyScriptPath,
  buildSiteSearchScriptPath,
  generateHeaderAndFooter,
};
