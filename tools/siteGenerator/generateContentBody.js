const CONTENT_PAGES_BASE = "../../shared-assets/content/pages";
const BLOG_INDEX_URL = "../../shared-assets/content/blog-index.json";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDisplayDate(isoDate) {
  const s = String(isoDate || "").trim();
  if (!s) {
    return "";
  }
  const d = new Date(`${s}T12:00:00`);
  if (Number.isNaN(d.getTime())) {
    return escapeHtml(s);
  }
  try {
    return escapeHtml(
      new Intl.DateTimeFormat(undefined, { year: "numeric", month: "long", day: "numeric" }).format(d),
    );
  } catch {
    return escapeHtml(s);
  }
}

function buildPageTitle(shopData, pageTitle) {
  const shopNameEsc = escapeHtml(shopData?.shopName || "Site");
  const titleEsc = escapeHtml(String(pageTitle || "Page").trim() || "Page");
  return `${shopNameEsc} - ${titleEsc}`;
}

function getCategoryNames(products) {
  const categories = window.productData.getProductsByCategory(products);
  return categories.map((c) => c.name);
}

async function loadContentPageJson(pagePath) {
  const fetchJson = window.generateAnyPage.fetchJson;
  const normalized = String(pagePath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Invalid content page path: ${pagePath}`);
  }
  return fetchJson(`${CONTENT_PAGES_BASE}/${normalized}.json`);
}

async function buildBlockRenderContext() {
  const fetchText = window.generateAnyPage.fetchText;
  const parseYoutubeVideoId = window.generateProductBody?.parseYoutubeVideoId;
  const buildImageCarouselHtml = window.generateProductBody?.buildImageCarouselHtml;
  if (typeof parseYoutubeVideoId !== "function" || typeof buildImageCarouselHtml !== "function") {
    throw new Error("generateProductBody carousel helpers must be loaded before content pages.");
  }
  const carouselPartial = await fetchText("./templates/partials/imageCarousel.html");
  return {
    carouselPartial,
    parseYoutubeVideoId,
    buildImageCarouselHtml,
  };
}

/**
 * @param {{ shopData: object, products: object[], pageData: object, pagePath?: string }} ctx
 */
async function generateContentPageBodyFromData(ctx) {
  const { shopData, products, pageData } = ctx;
  const page = pageData && typeof pageData === "object" ? pageData : {};
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const meta = page.meta && typeof page.meta === "object" ? page.meta : {};
  const pageType = String(page.pageType || "page").trim().toLowerCase();
  const pageTitle = String(meta.title || page.slug || "Page").trim() || "Page";

  const [contentPageTemplate, blockCtx] = await Promise.all([
    window.generateAnyPage.fetchText("./templates/partials/contentPage.html"),
    buildBlockRenderContext(),
  ]);

  const blocksHtml = await window.contentBlocks.renderBlocks(blocks, blockCtx);
  const metaHtml = window.contentBlocks.buildContentMetaHtml(meta, pageType);
  const bodyHtml = window.contentBlocks.applyTemplate(contentPageTemplate, {
    CONTENT_META: metaHtml,
    CONTENT_BLOCKS: blocksHtml,
  });

  return {
    bodyHtml,
    categoryNames: getCategoryNames(products),
    pageTitle: buildPageTitle(shopData, pageTitle),
  };
}

/**
 * @param {{ shopData: object, navigationConfig: object, products: object[], pagePath: string }} ctx
 */
async function generateContentPageBody(ctx) {
  const { pagePath } = ctx;
  const page = await loadContentPageJson(pagePath);
  return generateContentPageBodyFromData({ ...ctx, pageData: page });
}

function buildBlogIndexCard(post) {
  const slug = escapeHtml(String(post.slug || "").trim());
  const title = escapeHtml(String(post.title || "Untitled").trim() || "Untitled");
  const excerpt = escapeHtml(String(post.excerpt || "").trim());
  const href = escapeHtml(`blog/${slug}`);
  const cover = String(post.cover || "").trim();
  const coverHtml = cover
    ? `<img class="blog-card-cover" src="${escapeHtml(cover)}" alt="" loading="lazy" />`
    : `<div class="blog-card-cover blog-card-cover--placeholder" aria-hidden="true"></div>`;
  const date = formatDisplayDate(post.date);
  const dateHtml = date ? `<time class="blog-card-date" datetime="${escapeHtml(String(post.date || ""))}">${date}</time>` : "";
  return `<article class="blog-card">
  <a class="blog-card-link" href="${href}">
    ${coverHtml}
    <div class="blog-card-body">
      ${dateHtml}
      <h2 class="blog-card-title">${title}</h2>
      ${excerpt ? `<p class="blog-card-excerpt">${excerpt}</p>` : ""}
    </div>
  </a>
</article>`;
}

/**
 * @param {{ shopData: object, navigationConfig: object, products: object[] }} ctx
 */
async function generateBlogIndexBody(ctx) {
  const { shopData, products } = ctx;
  const index = await window.generateAnyPage.fetchJson(BLOG_INDEX_URL);
  const meta = index?.meta && typeof index.meta === "object" ? index.meta : {};
  const posts = Array.isArray(index?.posts) ? index.posts : [];
  const pageTitle = String(meta.title || "Blog").trim() || "Blog";
  const description = String(meta.description || "").trim();

  const cardsHtml = posts.map(buildBlogIndexCard).join("\n");
  const descriptionHtml = description
    ? `<p class="content-subtitle blog-index-lead">${escapeHtml(description)}</p>`
    : "";

  const bodyHtml = `<section class="page-content content-page blog-index">
  <h1 class="content-title">Blog</h1>
  ${descriptionHtml}
  <div class="blog-index-list">
    ${cardsHtml || '<p class="blog-index-empty">No posts yet.</p>'}
  </div>
</section>`;

  return {
    bodyHtml,
    categoryNames: getCategoryNames(products),
    pageTitle: buildPageTitle(shopData, pageTitle),
  };
}

window.generateContentBody = {
  generateContentPageBody,
  generateContentPageBodyFromData,
  generateBlogIndexBody,
  loadContentPageJson,
  buildBlockRenderContext,
};
