function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchTemplate(url) {
  const response = await fetch(url, { cache: "no-store" });
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

function normalizeHrefForBase(rawHref) {
  const href = String(rawHref || "").trim();
  if (!href) {
    return "#";
  }
  if (
    href.startsWith("#") ||
    href.startsWith("http://") ||
    href.startsWith("https://") ||
    href.startsWith("mailto:") ||
    href.startsWith("tel:")
  ) {
    return href;
  }
  // Keep URLs base-friendly (GitHub Pages <base href="/repo/">). Root-absolute paths ignore <base>.
  return href.replace(/^\/+/, "");
}

function buildNavigationHtml(navigationConfig, categoryNames = []) {
  const items = Array.isArray(navigationConfig?.items) ? navigationConfig.items : [];
  return items
    .map((item) => {
      const label = escapeHtml(item.label || "");
      const href = escapeHtml(normalizeHrefForBase(item.href || "#"));
      const isShopItem = String(item?.label || "").trim().toLowerCase() === "shop";
      const configuredChildren = Array.isArray(item.children) ? item.children : [];
      let children = configuredChildren;
      if (isShopItem && Array.isArray(categoryNames) && categoryNames.length > 0) {
        const autoChildren = categoryNames.map((category) => ({
          label: category,
          href: buildShopCategoryHref(category),
        }));
        children = [...configuredChildren, ...autoChildren];
      }
      if (children.length === 0) {
        return `<li class="nav-item"><a href="${href}">${label}</a></li>`;
      }

      const submenuId = `submenu-${slugify(item.label || "menu")}-${Math.random()
        .toString(16)
        .slice(2)}`;
      const childrenHtml = children
        .map((child) => {
          const childLabel = escapeHtml(child.label || "");
          const childHref = escapeHtml(normalizeHrefForBase(child.href || "#"));
          return `<li><a href="${childHref}">${childLabel}</a></li>`;
        })
        .join("");
      return `
        <li class="nav-item nav-item-has-children">
          <div class="nav-parent">
            <a class="nav-link" href="${href}">${label}</a>
            <button type="button" class="nav-dropdown-toggle" aria-expanded="false" aria-controls="${submenuId}" aria-label="Open ${label} menu"></button>
          </div>
          <ul class="submenu" id="${submenuId}">${childrenHtml}</ul>
        </li>
      `;
    })
    .join("");
}

function buildSocialLinksHtml(shopData) {
  const links = [];
  const instagram = shopData?.social?.instagram;
  const facebook = shopData?.social?.facebook;
  const newsletter = shopData?.websites?.newsletterSignup;

  if (instagram?.url) {
    links.push(
      `<li><a href="${escapeHtml(instagram.url)}" target="_blank" rel="noreferrer noopener">Instagram</a></li>`
    );
  }

  if (facebook?.url) {
    links.push(
      `<li><a href="${escapeHtml(facebook.url)}" target="_blank" rel="noreferrer noopener">Facebook</a></li>`
    );
  }

  if (newsletter) {
    links.push(
      `<li><a href="${escapeHtml(newsletter)}" target="_blank" rel="noreferrer noopener">Mailing List</a></li>`
    );
  }

  return links.length > 0 ? links.join("") : "<li>Social links coming soon</li>";
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

async function generateHeaderAndFooter(shopData, navigationConfig, options = {}) {
  const [headerTemplate, footerTemplate] = await Promise.all([
    fetchTemplate("./templates/partials/header.html"),
    fetchTemplate("./templates/partials/footer.html"),
  ]);

  const categoryNames = Array.isArray(options.categoryNames) ? options.categoryNames : [];
  const navHtml = buildNavigationHtml(navigationConfig, categoryNames);
  const shopName = escapeHtml(shopData?.shopName || "Shop");
  const faviconPath = escapeHtml(buildFaviconPath(shopData));
  const siteCssPath = escapeHtml(buildSiteCssPath());
  const siteJsPath = escapeHtml(buildSiteJsPath());
  const productDataScriptPath = escapeHtml(buildProductDataScriptPath());
  const shoppingCartScriptPath = escapeHtml(buildShoppingCartScriptPath());

  const headerHtml = applyTemplate(headerTemplate, {
    SHOP_NAME: shopName,
    FAVICON_PATH: faviconPath,
    NAV_ITEMS: navHtml,
  });

  const footerHtml = applyTemplate(footerTemplate, {
    SHOP_NAME: shopName,
    SOCIAL_LINKS: buildSocialLinksHtml(shopData),
    MAILING_LIST_URL: escapeHtml(shopData?.websites?.newsletterSignup || "#"),
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
  };
}

window.generateHeaderAndFooter = {
  escapeHtml,
  slugify,
  buildShopCategoryHref,
  buildSiteJsPath,
  buildProductDataScriptPath,
  buildShoppingCartScriptPath,
  generateHeaderAndFooter,
};
