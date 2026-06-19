const CONTENT_PAGES_BASE = "../../shared-assets/content/pages";
const FILE_TREE_URL = "../../shared-assets/config/fileTree.json";

async function loadFileTreeConfig(fileTreeOverride) {
  if (fileTreeOverride && typeof fileTreeOverride === "object") {
    return fileTreeOverride;
  }
  const fetchJson = window.generateAnyPage.fetchJson;
  const base = await fetchJson(FILE_TREE_URL);
  if (typeof window.displayFileTree?.applyFileTreeOverlay === "function") {
    return window.displayFileTree.applyFileTreeOverlay(base);
  }
  return base;
}

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

function normalizeContentPagePath(pagePath) {
  return String(pagePath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function isReservedSystemPath(pagePath) {
  const path = normalizeContentPagePath(pagePath);
  if (!path) {
    return true;
  }
  if (path === "cart" || path === "shop" || path === "blog") {
    return true;
  }
  return path.startsWith("shop/");
}

function isContentPagePath(pagePath) {
  const path = normalizeContentPagePath(pagePath);
  return Boolean(path) && !isReservedSystemPath(path);
}

async function loadContentPageJson(pagePath) {
  const fetchJson = window.generateAnyPage.fetchJson;
  const normalized = normalizeContentPagePath(pagePath);
  if (!normalized || normalized.includes("..")) {
    throw new Error(`Invalid content page path: ${pagePath}`);
  }
  return fetchJson(`${CONTENT_PAGES_BASE}/${normalized}.json`);
}

/**
 * @param {string} pagePath
 * @param {{ title?: string, slug?: string, pageType?: string }} [hints]
 */
function createDefaultPageData(pagePath, hints = {}) {
  const normalized = normalizeContentPagePath(pagePath);
  const isBlog = normalized.startsWith("blog/") && normalized.length > "blog/".length;
  const slugFromPath = isBlog ? normalized.slice("blog/".length) : normalized === "about" ? "about" : normalized;
  const pageType = String(hints.pageType || (isBlog ? "blog" : "page"))
    .trim()
    .toLowerCase();
  const title = String(hints.title || "").trim();
  const slug = String(hints.slug || slugFromPath).trim() || slugFromPath;
  const today = new Date().toISOString().slice(0, 10);
  const blocks = title
    ? [
        { type: "title", text: title },
        { type: "text", format: "plain", content: "" },
      ]
    : [
        { type: "title", text: "" },
        { type: "text", format: "plain", content: "" },
      ];
  return {
    version: 1,
    slug,
    pageType,
    draft: false,
    meta: {
      title,
      description: "",
      ...(pageType === "blog" ? { date: today, author: "", tags: [] } : {}),
    },
    blocks,
  };
}

async function buildBlockRenderContext(products) {
  const fetchText = window.generateAnyPage.fetchText;
  const parseYoutubeVideoId = window.generateProductBody?.parseYoutubeVideoId;
  const buildImageCarouselHtml = window.generateProductBody?.buildImageCarouselHtml;
  const buildProductThumbRowHtml = window.generateProductBody?.buildProductThumbRowHtml;
  if (typeof parseYoutubeVideoId !== "function" || typeof buildImageCarouselHtml !== "function") {
    throw new Error("generateProductBody carousel helpers must be loaded before content pages.");
  }
  if (typeof buildProductThumbRowHtml !== "function") {
    throw new Error("generateProductBody.buildProductThumbRowHtml must be loaded before content pages.");
  }
  const [carouselPartial, productThumbTemplate, productThumbRowTemplate] = await Promise.all([
    fetchText("./templates/partials/imageCarousel.html"),
    fetchText("./templates/partials/productThumb.html"),
    fetchText("./templates/partials/productThumbRow.html"),
  ]);
  return {
    carouselPartial,
    parseYoutubeVideoId,
    buildImageCarouselHtml,
    buildProductThumbRowHtml: (catalogProducts, slugs) =>
      buildProductThumbRowHtml(catalogProducts, slugs, productThumbTemplate, productThumbRowTemplate),
    products: Array.isArray(products) ? products : [],
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
    buildBlockRenderContext(products),
  ]);

  const blocksHtml = await window.contentBlocks.renderBlocks(blocks, blockCtx);
  const metaHtml = window.contentBlocks.buildContentMetaHtml(meta, pageType);
  const bodyHtml = window.contentBlocks.applyTemplate(contentPageTemplate, {
    CONTENT_META: metaHtml,
    CONTENT_BLOCKS: blocksHtml,
  });

  const truncateText = window.structuredData?.truncateText;
  const metaDescription =
    typeof truncateText === "function"
      ? truncateText(String(meta.description || "").trim(), 160)
      : String(meta.description || "").trim();
  return {
    bodyHtml,
    categoryNames: getCategoryNames(products),
    pageTitle: buildPageTitle(shopData, pageTitle),
    seoContext: {
      metaDescription,
      pageData: page,
    },
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

function deriveCoverFromPageData(pageData) {
  const blocks = Array.isArray(pageData?.blocks) ? pageData.blocks : [];
  for (const block of blocks) {
    if (String(block?.type || "").toLowerCase() === "image" && block?.src) {
      return String(block.src);
    }
    if (String(block?.type || "").toLowerCase() === "carousel" && Array.isArray(block?.items)) {
      const firstImage = block.items.find((item) => String(item?.kind || "").toLowerCase() === "image" && item?.url);
      if (firstImage?.url) {
        return String(firstImage.url);
      }
    }
  }
  return "";
}

function buildBlogPostSummary(pageData, slugFallback) {
  const meta = pageData?.meta && typeof pageData.meta === "object" ? pageData.meta : {};
  const slug = String(pageData?.slug || slugFallback || "")
    .trim()
    .toLowerCase();
  if (!slug) {
    return null;
  }
  return {
    slug,
    title: String(meta.title || pageData?.slug || slug || "Untitled").trim() || "Untitled",
    date: String(meta.date || "").trim(),
    excerpt: String(meta.description || "").trim(),
    cover: deriveCoverFromPageData(pageData),
  };
}

function compareBlogPosts(a, b) {
  const da = String(a?.date || "").trim();
  const db = String(b?.date || "").trim();
  if (da && db && da !== db) {
    return db.localeCompare(da);
  }
  if (da && !db) {
    return -1;
  }
  if (!da && db) {
    return 1;
  }
  return String(a?.slug || "").localeCompare(String(b?.slug || ""));
}

function isTreeNodeHidden(node) {
  if (typeof window.displayFileTree?.isTreeNodeHidden === "function") {
    return window.displayFileTree.isTreeNodeHidden(node);
  }
  return node?.hide === true;
}

function isTreeNodeDraft(node) {
  if (typeof window.displayFileTree?.isTreeNodeDraft === "function") {
    return window.displayFileTree.isTreeNodeDraft(node);
  }
  return node?.draft === true;
}

function getBlogSlugsFromFileTree(fileTree) {
  const items = Array.isArray(fileTree?.items) ? fileTree.items : [];
  const blogNode = items.find((item) => String(item?.href || "").trim().toLowerCase() === "blog");
  const children = Array.isArray(blogNode?.children) ? blogNode.children : [];
  return children
    .filter((child) => !isTreeNodeHidden(child) && !isTreeNodeDraft(child))
    .map((child) => {
      const href = String(child?.href || "")
        .trim()
        .toLowerCase()
        .replace(/^\/+/, "")
        .replace(/\/+$/, "");
      if (!href.startsWith("blog/") || href.length <= "blog/".length) {
        return null;
      }
      return href.slice("blog/".length);
    })
    .filter(Boolean);
}

function resolveContentPageData(pagePath, contentPages) {
  const normalized = normalizeContentPagePath(pagePath);
  if (contentPages && typeof contentPages.get === "function") {
    const fromMap = contentPages.get(normalized);
    if (fromMap && typeof fromMap === "object") {
      return fromMap;
    }
  }
  return null;
}

async function loadBlogPostsFromFileTree(fileTree, contentPages) {
  const slugs = getBlogSlugsFromFileTree(fileTree);
  const summaries = await Promise.all(
    slugs.map(async (slug) => {
      const pagePath = `blog/${slug}`;
      const fromContext = resolveContentPageData(pagePath, contentPages);
      if (fromContext) {
        return buildBlogPostSummary(fromContext, slug);
      }
      try {
        const pageData = await loadContentPageJson(pagePath);
        return buildBlogPostSummary(pageData, slug);
      } catch {
        return null;
      }
    }),
  );
  return summaries.filter(Boolean).sort(compareBlogPosts);
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
  const { shopData, products, fileTree: fileTreeOverride, contentPages } = ctx;
  const blogConfig = shopData?.blog && typeof shopData.blog === "object" ? shopData.blog : {};
  const pageTitle = String(blogConfig.title || "Blog").trim() || "Blog";
  const description = String(blogConfig.description || "").trim();
  const headingEsc = escapeHtml(pageTitle);

  const fileTree = await loadFileTreeConfig(fileTreeOverride);
  const posts = await loadBlogPostsFromFileTree(fileTree, contentPages);

  const cardsHtml = posts.map(buildBlogIndexCard).join("\n");
  const descriptionHtml = description
    ? `<p class="content-subtitle blog-index-lead">${escapeHtml(description)}</p>`
    : "";

  const bodyHtml = `<section class="page-content content-page blog-index">
  <h1 class="content-title">${headingEsc}</h1>
  ${descriptionHtml}
  <div class="blog-index-list">
    ${cardsHtml || '<p class="blog-index-empty">No posts yet.</p>'}
  </div>
</section>`;

  const truncateText = window.structuredData?.truncateText;
  const metaDescription =
    typeof truncateText === "function" ? truncateText(description, 160) : description;
  return {
    bodyHtml,
    categoryNames: getCategoryNames(products),
    pageTitle: buildPageTitle(shopData, pageTitle),
    seoContext: {
      metaDescription,
      blogPosts: posts,
    },
  };
}

window.generateContentBody = {
  generateContentPageBody,
  generateContentPageBodyFromData,
  generateBlogIndexBody,
  loadContentPageJson,
  createDefaultPageData,
  isReservedSystemPath,
  isContentPagePath,
  buildBlockRenderContext,
  deriveCoverFromPageData,
};
