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

function homepageBodyContent(shopData) {
  const about = shopData?.about ? escapeHtml(shopData.about) : "We are preparing this page. Please check back soon.";
  return `
    <section class="page-content">
      <h1>Coming soon</h1>
      <p>${about}</p>
    </section>
  `;
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, "g");
    return current.replace(token, String(value));
  }, template);
}

async function generateHomepageHtml(options = {}) {
  const { hrefPrefix = "" } = options;
  const prefix = hrefPrefix ? `${hrefPrefix}` : "";
  const [shopData, navigationConfig, pageTemplate] = await Promise.all([
    fetchJson(`${prefix}../../shared-assets/config/shopData.json`),
    fetchJson(`${prefix}../../shared-assets/config/navigation.json`),
    fetchTemplate("./templates/pages/homepage.html"),
  ]);
  const { headerHtml, footerHtml, shopName, faviconPath, siteCssPath } =
    await window.generateHeaderAndFooter.generateHeaderAndFooter(shopData, navigationConfig);

  return applyTemplate(pageTemplate, {
    PAGE_TITLE: `${escapeHtml(shopName)} - Home`,
    FAVICON_PATH: escapeHtml(faviconPath),
    SITE_CSS_PATH: escapeHtml(siteCssPath),
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

  const homepageHtml = await generateHomepageHtml();
  root.innerHTML = homepageHtml;
}

window.siteGenerator = {
  generateHomepageHtml,
  downloadFile,
  openGeneratedPage,
  renderHomepagePreview,
};
