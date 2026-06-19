function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function applyTemplate(template, values) {
  return Object.entries(values).reduce((current, [key, value]) => {
    const token = new RegExp(`__${key}__`, "g");
    return current.replace(token, () => String(value));
  }, template);
}

function renderInlineMarkdown(text) {
  let s = escapeHtml(text);
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const safeUrl = escapeHtml(String(url || "").trim());
    return `<a href="${safeUrl}">${label}</a>`;
  });
  return s;
}

function markdownToHtml(md) {
  const raw = String(md || "").trim();
  if (!raw) {
    return "";
  }
  return raw
    .split(/\n\s*\n/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${renderInlineMarkdown(para.replace(/\n/g, " "))}</p>`)
    .join("\n");
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

/**
 * @param {unknown[]} items
 * @param {(raw: string) => string | null} parseYoutubeVideoId
 */
function normalizeCarouselItems(items, parseYoutubeVideoId) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }
  return items.map((item, index) => {
    const kind = String(item?.kind || "").trim().toLowerCase();
    if (kind === "image") {
      const url = String(item.url || item.src || "").trim();
      if (!url) {
        throw new Error(`Carousel item ${index + 1}: image requires url.`);
      }
      const out = { kind: "image", url };
      const alt = String(item.alt || "").trim();
      if (alt) {
        out.alt = alt;
      }
      const caption = String(item.caption || "").trim();
      if (caption) {
        out.caption = caption;
      }
      const width = String(item.width || "").trim().toLowerCase();
      if (width === "wide" || width === "full") {
        out.width = width;
      }
      return out;
    }
    if (kind === "video") {
      let videoId = String(item.videoId || "").trim();
      if (!videoId) {
        videoId = parseYoutubeVideoId(String(item.url || "").trim()) || "";
      }
      if (!/^[\w-]{11}$/.test(videoId)) {
        throw new Error(`Carousel item ${index + 1}: invalid YouTube video.`);
      }
      const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const embedUrl = `https://www.youtube.com/embed/${videoId}`;
      const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      return { kind: "video", videoId, watchUrl, embedUrl, thumbUrl };
    }
    throw new Error(`Carousel item ${index + 1}: unknown kind "${kind}".`);
  });
}

/**
 * @param {object} block
 * @param {(raw: string) => string | null} parseYoutubeVideoId
 */
function resolveVideoEmbed(block, parseYoutubeVideoId) {
  let videoId = String(block.videoId || "").trim();
  if (!videoId) {
    videoId = parseYoutubeVideoId(String(block.url || "").trim()) || "";
  }
  if (!/^[\w-]{11}$/.test(videoId)) {
    throw new Error("Video block requires a valid YouTube videoId or url.");
  }
  const title = escapeHtml(String(block.title || block.caption || "Video").trim() || "Video");
  const embedSrc = escapeHtml(`https://www.youtube.com/embed/${videoId}?rel=0`);
  const caption = String(block.caption || "").trim();
  const captionHtml = caption
    ? `<figcaption class="content-video-caption">${escapeHtml(caption)}</figcaption>`
    : "";
  return `<figure class="content-video">
  <div class="content-video-wrap">
    <iframe class="content-video-embed" title="${title}" width="560" height="315" src="${embedSrc}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>
  </div>
  ${captionHtml}
</figure>`;
}

/**
 * @param {object} block
 * @param {object} ctx
 * @param {string} ctx.carouselPartial
 * @param {(raw: string) => string | null} ctx.parseYoutubeVideoId
 * @param {(items: object[], label: string, partial: string) => Promise<string>} ctx.buildImageCarouselHtml
 */
function editPlaceholder(message) {
  return `<p class="content-edit-placeholder">${escapeHtml(message)}</p>`;
}

async function renderBlock(block, ctx) {
  const lenient = ctx?.lenient === true;
  const type = String(block?.type || "").trim().toLowerCase();
  if (!type) {
    if (lenient) {
      return editPlaceholder("Block missing type.");
    }
    throw new Error("Content block missing type.");
  }

  if (type === "title") {
    const text = escapeHtml(String(block.text || "").trim());
    return text ? `<h1 class="content-title">${text}</h1>` : "";
  }

  if (type === "subtitle") {
    const text = escapeHtml(String(block.text || "").trim());
    return text ? `<p class="content-subtitle">${text}</p>` : "";
  }

  if (type === "text") {
    const format = String(block.format || "plain").trim().toLowerCase();
    const content = String(block.content || "").trim();
    if (!content) {
      return "";
    }
    if (format === "markdown") {
      return `<div class="content-text">${markdownToHtml(content)}</div>`;
    }
    return `<div class="content-text"><p>${renderInlineMarkdown(content)}</p></div>`;
  }

  if (type === "image") {
    const src = String(block.src || block.url || "").trim();
    if (!src) {
      if (lenient) {
        return editPlaceholder("Image block (no src).");
      }
      throw new Error("Image block requires src.");
    }
    const alt = escapeHtml(String(block.alt || "").trim() || "Image");
    const caption = String(block.caption || "").trim();
    const width = String(block.width || "").trim().toLowerCase();
    const widthClass = width === "wide" || width === "full" ? ` content-figure--${width}` : "";
    const captionHtml = caption
      ? `<figcaption class="content-figure-caption">${escapeHtml(caption)}</figcaption>`
      : "";
    return `<figure class="content-figure${widthClass}">
  <img class="content-figure-img" src="${escapeHtml(src)}" alt="${alt}" loading="lazy" />
  ${captionHtml}
</figure>`;
  }

  if (type === "carousel") {
    let items = [];
    try {
      items = normalizeCarouselItems(block.items, ctx.parseYoutubeVideoId);
    } catch (err) {
      if (lenient) {
        return editPlaceholder(`Carousel block: ${err.message || "invalid items"}`);
      }
      throw err;
    }
    if (!items.length) {
      if (lenient) {
        return editPlaceholder("Carousel block (no items).");
      }
      return "";
    }
    const label = String(block.label || block.title || "Gallery").trim() || "Gallery";
    return ctx.buildImageCarouselHtml(items, label, ctx.carouselPartial);
  }

  if (type === "video") {
    try {
      return resolveVideoEmbed(block, ctx.parseYoutubeVideoId);
    } catch (err) {
      if (lenient) {
        return editPlaceholder(`Video block: ${err.message || "invalid video"}`);
      }
      throw err;
    }
  }

  if (type === "html") {
    return String(block.content || "");
  }

  if (type === "divider") {
    return '<hr class="content-divider" />';
  }

  if (type === "callout") {
    const text = escapeHtml(String(block.text || "").trim());
    if (!text) {
      return "";
    }
    const variant = String(block.variant || "note").trim().toLowerCase();
    const safeVariant = /^[a-z-]+$/.test(variant) ? variant : "note";
    const title = String(block.title || "").trim();
    const titleHtml = title ? `<p class="content-callout-title">${escapeHtml(title)}</p>` : "";
    return `<aside class="content-callout content-callout--${safeVariant}">
  ${titleHtml}
  <p class="content-callout-text">${text}</p>
</aside>`;
  }

  if (type === "product_thumbs") {
    const slugs = Array.isArray(block.slugs) ? block.slugs : [];
    if (!slugs.length) {
      if (lenient) {
        return editPlaceholder("Product thumbs block (no products selected).");
      }
      return "";
    }
    const resolve = window.productData?.resolveThumbProductsBySlugs;
    const buildThumbs = ctx.buildProductThumbsHtml;
    const thumbTpl = ctx.productThumbTemplate;
    const rowTpl = ctx.productThumbRowTemplate;
    const products = Array.isArray(ctx.products) ? ctx.products : [];
    if (
      typeof resolve !== "function" ||
      typeof buildThumbs !== "function" ||
      !thumbTpl ||
      !rowTpl
    ) {
      if (lenient) {
        return editPlaceholder("Product thumbs block (catalog helpers unavailable).");
      }
      throw new Error("Product thumbs block requires catalog and thumb templates.");
    }
    const thumbProducts = resolve(products, slugs);
    if (!thumbProducts.length) {
      if (lenient) {
        return editPlaceholder("Product thumbs block (no matching visible products).");
      }
      return "";
    }
    const thumbsHtml = buildThumbs(thumbTpl, thumbProducts);
    return applyTemplate(rowTpl, { PRODUCT_THUMBS: thumbsHtml });
  }

  if (lenient) {
    return editPlaceholder(`Unknown block type: ${type}`);
  }
  throw new Error(`Unknown content block type: ${type}`);
}

/**
 * @param {object[]} blocks
 * @param {object} ctx
 */
async function renderBlocks(blocks, ctx) {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return "";
  }
  const parts = [];
  for (const block of blocks) {
    parts.push(await renderBlock(block, ctx));
  }
  return parts.filter(Boolean).join("\n");
}

/**
 * @param {object} meta
 * @param {string} pageType
 */
function buildContentMetaHtml(meta, pageType) {
  const bits = [];
  const date = formatDisplayDate(meta?.date);
  const author = String(meta?.author || "").trim();
  if (pageType === "blog" && (date || author)) {
    const dateHtml = date ? `<time class="content-meta-date" datetime="${escapeHtml(String(meta.date || ""))}">${date}</time>` : "";
    const authorHtml = author ? `<span class="content-meta-author">${escapeHtml(author)}</span>` : "";
    const sep = date && author ? `<span class="content-meta-sep" aria-hidden="true">·</span>` : "";
    bits.push(`<p class="content-meta">${dateHtml}${sep}${authorHtml}</p>`);
  }
  const tags = Array.isArray(meta?.tags) ? meta.tags.filter(Boolean) : [];
  if (pageType === "blog" && tags.length > 0) {
    const tagHtml = tags
      .map((tag) => `<li class="content-tag">${escapeHtml(String(tag).trim())}</li>`)
      .join("");
    bits.push(`<ul class="content-tags" role="list">${tagHtml}</ul>`);
  }
  return bits.join("\n");
}

window.contentBlocks = {
  escapeHtml,
  applyTemplate,
  renderBlock,
  renderBlocks,
  buildContentMetaHtml,
  normalizeCarouselItems,
  markdownToHtml,
};
