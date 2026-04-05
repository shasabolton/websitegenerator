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

/** Keep in sync with `setBase.js` (GitHub project Pages). */
const GITHUB_PAGES_REPO = "websitegenerator";

/**
 * Path prefix for site root on this host (e.g. "/" or "/websitegenerator/").
 * Matches logic in inlined `setBase.js`.
 */
function getPublishedPathPrefix() {
  if (typeof window === "undefined" || !window.location) {
    return "/";
  }
  const h = window.location.hostname;
  if (h === "github.io" || h.endsWith(".github.io")) {
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const first = segments[0];
      return first === GITHUB_PAGES_REPO ? `/${GITHUB_PAGES_REPO}/` : `/${first}/`;
    }
  }
  return "/";
}

/**
 * Turn a repo-root-relative asset path into an absolute URL (or ../../… under file://)
 * so favicon/CSS/images work from `tools/siteGenerator/preview.html` without relying on `<base>`.
 * Pass-through for http(s) and data URLs.
 */
function resolveRootAssetUrl(relativePath) {
  const raw = String(relativePath || "").trim();
  if (!raw) {
    return "";
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }
  const clean = raw.replace(/^\/+/, "");
  const loc = typeof window !== "undefined" ? window.location : null;
  if (!loc || loc.protocol === "file:") {
    return `../../${clean}`;
  }
  const base = `${loc.origin}${getPublishedPathPrefix()}`;
  try {
    return new URL(clean, base).href;
  } catch {
    return `${base}${clean}`;
  }
}

function resolveOptionalProductImageUrl(imagePath) {
  const fallback = "shared-assets/images/branding/favicon.jpg";
  const raw = String(imagePath || "").trim();
  if (!raw) {
    return resolveRootAssetUrl(fallback);
  }
  if (/^https?:\/\//i.test(raw) || raw.startsWith("data:")) {
    return raw;
  }
  return resolveRootAssetUrl(raw.replace(/^\/+/, ""));
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

function buildNavigationHtml(navigationConfig, categoryNames = []) {
  const items = Array.isArray(navigationConfig?.items) ? navigationConfig.items : [];
  return items
    .map((item) => {
      const label = escapeHtml(item.label || "");
      const href = escapeHtml(item.href || "#");
      const isShopItem = String(item?.label || "").trim().toLowerCase() === "shop";
      let children = Array.isArray(item.children) ? item.children : [];
      if (isShopItem && Array.isArray(categoryNames) && categoryNames.length > 0) {
        children = categoryNames.map((category) => ({
          label: category,
          href: buildShopCategoryHref(category),
        }));
      }
      if (children.length === 0) {
        return `<li class="nav-item"><a href="${href}">${label}</a></li>`;
      }
      const childrenHtml = children
        .map((child) => {
          const childLabel = escapeHtml(child.label || "");
          const childHref = escapeHtml(child.href || "#");
          return `<li><a href="${childHref}">${childLabel}</a></li>`;
        })
        .join("");
      if (isShopItem) {
        return `
          <li class="nav-item nav-item-has-children">
            <details class="nav-dropdown">
              <summary>${label}</summary>
              <ul class="submenu">${childrenHtml}</ul>
            </details>
          </li>
        `;
      }
      return `
        <li class="nav-item nav-item-has-children">
          <a href="${href}">${label}</a>
          <ul class="submenu">${childrenHtml}</ul>
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

async function generateHeaderAndFooter(shopData, navigationConfig, options = {}) {
  const [headerTemplate, footerTemplate] = await Promise.all([
    fetchTemplate("./templates/partials/header.html"),
    fetchTemplate("./templates/partials/footer.html"),
  ]);

  const categoryNames = Array.isArray(options.categoryNames) ? options.categoryNames : [];
  const navHtml = buildNavigationHtml(navigationConfig, categoryNames);
  const shopName = escapeHtml(shopData?.shopName || "Shop");
  const faviconPath = escapeHtml(resolveRootAssetUrl(buildFaviconPath(shopData)));
  const siteCssPath = escapeHtml(resolveRootAssetUrl(buildSiteCssPath()));

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
  };
}

window.generateHeaderAndFooter = {
  escapeHtml,
  slugify,
  buildShopCategoryHref,
  generateHeaderAndFooter,
  getPublishedPathPrefix,
  resolveRootAssetUrl,
  resolveOptionalProductImageUrl,
};
