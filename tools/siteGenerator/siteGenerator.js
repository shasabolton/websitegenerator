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

async function fetchTemplate(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load template: ${url} (${response.status})`);
  }
  return response.text();
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    return current.replace(token, String(value));
  }, template);
}

function buildNavigationHtml(navigationConfig) {
  const items = Array.isArray(navigationConfig?.items) ? navigationConfig.items : [];
  return items
    .map((item) => {
      const label = escapeHtml(item.label || "");
      const href = escapeHtml(item.href || "#");
      const children = Array.isArray(item.children) ? item.children : [];
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
  return shopData?.branding?.faviconPath || "./shop/assets/favicon.jpg";
}

function buildSiteCssPath() {
  return "./shop/assets/css/site.css";
}

function resolveAssetPath(path, useAbsoluteAssetPaths) {
  if (!useAbsoluteAssetPaths) {
    return path;
  }
  return new URL(path, window.location.href).href;
}

function homepageBodyContent(shopData) {
  const about = shopData?.about ? escapeHtml(shopData.about) : "We are preparing this page. Please check back soon.";
  return `
    <section class="page-content">
      <h1>Coming soon</h1>
      <p>${about}</p>
    </section>
  `;
}

async function generateHomepageHtml(options = {}) {
  const useAbsoluteAssetPaths = Boolean(options.absoluteAssetPaths);
  const [shopData, navigationConfig, headerTemplate, footerTemplate, pageTemplate] = await Promise.all([
    fetchJson("./shop/config/shopData.json"),
    fetchJson("./shop/config/navigation.json"),
    fetchTemplate("./templates/partials/header.html"),
    fetchTemplate("./templates/partials/footer.html"),
    fetchTemplate("./templates/pages/homepage.html"),
  ]);

  const navHtml = buildNavigationHtml(navigationConfig);
  const shopName = escapeHtml(shopData?.shopName || "Shop");
  const faviconPath = escapeHtml(resolveAssetPath(buildFaviconPath(shopData), useAbsoluteAssetPaths));
  const siteCssPath = escapeHtml(resolveAssetPath(buildSiteCssPath(), useAbsoluteAssetPaths));

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

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: `${shopName} - Home`,
    FAVICON_PATH: faviconPath,
    SITE_CSS_PATH: siteCssPath,
    HEADER: headerHtml,
    BODY_CONTENT: homepageBodyContent(shopData),
    FOOTER: footerHtml,
  });
}

function downloadFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function openGeneratedPage(content) {
  const blob = new Blob([content], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function renderHomepagePreview(targetElementId = "preview-root") {
  const root = document.getElementById(targetElementId);
  if (!root) {
    throw new Error(`Preview target element not found: #${targetElementId}`);
  }

  const homepageHtml = await generateHomepageHtml({ absoluteAssetPaths: true });
  root.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.title = "Generated homepage preview";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "none";
  iframe.srcdoc = homepageHtml;
  root.appendChild(iframe);
}

window.siteGenerator = {
  generateHomepageHtml,
  downloadFile,
  openGeneratedPage,
  renderHomepagePreview,
};
