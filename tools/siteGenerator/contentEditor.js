const BLOCK_SCHEMAS = {
  title: {
    label: "Title",
    fields: [{ key: "text", label: "Text", type: "text" }],
  },
  subtitle: {
    label: "Subtitle",
    fields: [{ key: "text", label: "Text", type: "text" }],
  },
  text: {
    label: "Text",
    fields: [
      {
        key: "format",
        label: "Format",
        type: "select",
        options: [
          { value: "plain", label: "Plain" },
          { value: "markdown", label: "Markdown" },
        ],
      },
      { key: "content", label: "Content", type: "textarea" },
    ],
  },
  image: {
    label: "Image",
    fields: [
      { key: "src", label: "Src / URL", type: "product_media", mediaKind: "image" },
      { key: "alt", label: "Alt text", type: "text" },
      { key: "caption", label: "Caption", type: "text" },
      {
        key: "width",
        label: "Width",
        type: "select",
        options: [
          { value: "", label: "Default" },
          { value: "wide", label: "Wide" },
          { value: "full", label: "Full" },
        ],
      },
    ],
  },
  carousel: {
    label: "Carousel",
    fields: [{ key: "items", label: "Slides", type: "carousel_items" }],
  },
  video: {
    label: "Video",
    fields: [
      { key: "videoId", label: "YouTube video ID", type: "text" },
      { key: "url", label: "YouTube URL (alternative)", type: "product_media", mediaKind: "video" },
      { key: "title", label: "Title", type: "text" },
      { key: "caption", label: "Caption", type: "text" },
    ],
  },
  html: {
    label: "HTML",
    fields: [{ key: "content", label: "HTML content", type: "textarea" }],
  },
  divider: {
    label: "Divider",
    fields: [],
  },
  callout: {
    label: "Callout",
    fields: [
      {
        key: "variant",
        label: "Variant",
        type: "select",
        options: [
          { value: "note", label: "Note" },
          { value: "tip", label: "Tip" },
        ],
      },
      { key: "title", label: "Title (optional)", type: "text" },
      { key: "text", label: "Text", type: "textarea" },
    ],
  },
};

const BLOCK_TYPE_OPTIONS = Object.entries(BLOCK_SCHEMAS).map(([value, schema]) => ({
  value,
  label: schema.label,
}));

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

function isEditableContentPath(treePath) {
  if (typeof window.generateContentBody?.isContentPagePath === "function") {
    return window.generateContentBody.isContentPagePath(treePath);
  }
  const path = String(treePath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (path === "about") {
    return true;
  }
  return path.startsWith("blog/") && path.length > "blog/".length;
}

function defaultBlockForType(type) {
  const t = String(type || "text").trim().toLowerCase();
  switch (t) {
    case "title":
      return { type: "title", text: "" };
    case "subtitle":
      return { type: "subtitle", text: "" };
    case "text":
      return { type: "text", format: "plain", content: "" };
    case "image":
      return { type: "image", src: "", alt: "", caption: "" };
    case "carousel":
      return { type: "carousel", items: [] };
    case "video":
      return { type: "video", videoId: "", url: "", caption: "" };
    case "html":
      return { type: "html", content: "" };
    case "divider":
      return { type: "divider" };
    case "callout":
      return { type: "callout", variant: "note", text: "" };
    default:
      return { type: "text", format: "plain", content: "" };
  }
}

function wrapEditShell(index, total, bodyHtml) {
  const upDisabled = index === 0 ? " disabled" : "";
  const downDisabled = index >= total - 1 ? " disabled" : "";
  const inner = bodyHtml || '<p class="content-edit-placeholder">Empty block.</p>';
  return `<div class="content-edit-block" data-block-index="${index}">
  <div class="content-edit-block-toolbar">
    <button type="button" class="content-edit-btn content-edit-up" data-action="up" aria-label="Move block up"${upDisabled}>↑</button>
    <button type="button" class="content-edit-btn content-edit-down" data-action="down" aria-label="Move block down"${downDisabled}>↓</button>
    <button type="button" class="content-edit-btn content-edit-gear" data-action="edit" aria-label="Edit block settings">&#9881;</button>
    <button type="button" class="content-edit-btn content-edit-delete" data-action="delete" aria-label="Delete block">&#10005;</button>
  </div>
  <div class="content-edit-block-body">${inner}</div>
</div>`;
}

async function renderEditBlocksHtml(blocks, blockCtx) {
  const list = Array.isArray(blocks) ? blocks : [];
  if (!list.length) {
    return '<p class="content-edit-placeholder">No blocks yet. Click “+ Add block”.</p>';
  }
  const parts = [];
  for (let i = 0; i < list.length; i += 1) {
    const blockHtml = await window.contentBlocks.renderBlock(list[i], blockCtx);
    parts.push(wrapEditShell(i, list.length, blockHtml));
  }
  return parts.join("\n");
}

function ensurePageDataShape(pageData) {
  const page = pageData && typeof pageData === "object" ? pageData : {};
  if (!page.meta || typeof page.meta !== "object") {
    page.meta = {};
  }
  if (page.version == null || page.version === "") {
    page.version = 1;
  }
  if (!page.slug) {
    page.slug = "";
  }
  if (!page.pageType) {
    page.pageType = "page";
  }
  if (!Array.isArray(page.blocks)) {
    page.blocks = [];
  }
  return page;
}

function buildPageSettingsEditHtml(pageData, pagePath) {
  const page = ensurePageDataShape(pageData);
  const meta = page.meta;
  const pageType = String(page.pageType || "page").trim().toLowerCase();
  const isBlog = pageType === "blog";
  const tagsStr = Array.isArray(meta.tags) ? meta.tags.join(", ") : "";
  const redirectsStr = Array.isArray(meta.redirects) ? meta.redirects.join(", ") : "";
  const blogOnlyHidden = isBlog ? "" : ' hidden=""';

  return `<fieldset class="content-edit-page-settings" data-content-edit-page-settings>
  <legend>Page settings</legend>
  <p class="content-edit-page-path-hint">Stored as <code>shared-assets/content/pages/${escapeHtml(pagePath)}.json</code></p>
  <div class="content-edit-page-settings-grid">
    <div class="content-edit-field">
      <label for="content-edit-version">Version</label>
      <input id="content-edit-version" type="number" min="1" step="1" data-page-field="version" value="${escapeAttr(String(page.version))}" />
    </div>
    <div class="content-edit-field">
      <label for="content-edit-slug">Slug</label>
      <input id="content-edit-slug" type="text" data-page-field="slug" value="${escapeAttr(String(page.slug || ""))}" autocomplete="off" />
    </div>
    <div class="content-edit-field">
      <label for="content-edit-page-type">Page type</label>
      <select id="content-edit-page-type" data-page-field="pageType">
        <option value="page"${pageType === "page" ? " selected" : ""}>page</option>
        <option value="blog"${pageType === "blog" ? " selected" : ""}>blog</option>
      </select>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="content-edit-meta-title">Meta title</label>
      <input id="content-edit-meta-title" type="text" data-page-field="meta.title" value="${escapeAttr(String(meta.title || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="content-edit-meta-description">Meta description</label>
      <textarea id="content-edit-meta-description" rows="2" data-page-field="meta.description">${escapeHtml(String(meta.description || ""))}</textarea>
    </div>
    <div class="content-edit-field content-edit-field--wide">
      <label for="content-edit-meta-redirects">Redirects</label>
      <input id="content-edit-meta-redirects" type="text" data-page-field="meta.redirects" value="${escapeAttr(redirectsStr)}" placeholder="blog/old-post, about-v1" />
      <p class="content-edit-field-hint">Old paths that should redirect to this page. Comma-separated site paths (no leading slash).</p>
    </div>
    <div class="content-edit-field content-edit-blog-only" data-blog-field${blogOnlyHidden}>
      <label for="content-edit-meta-date">Date</label>
      <input id="content-edit-meta-date" type="date" data-page-field="meta.date" value="${escapeAttr(String(meta.date || ""))}" />
    </div>
    <div class="content-edit-field content-edit-blog-only" data-blog-field${blogOnlyHidden}>
      <label for="content-edit-meta-author">Author</label>
      <input id="content-edit-meta-author" type="text" data-page-field="meta.author" value="${escapeAttr(String(meta.author || ""))}" />
    </div>
    <div class="content-edit-field content-edit-field--wide content-edit-blog-only" data-blog-field${blogOnlyHidden}>
      <label for="content-edit-meta-tags">Tags</label>
      <input id="content-edit-meta-tags" type="text" data-page-field="meta.tags" value="${escapeAttr(tagsStr)}" placeholder="puzzle-box, design" />
      <p class="content-edit-field-hint">Comma-separated</p>
    </div>
  </div>
</fieldset>`;
}

function syncPageDataFromSettingsForm() {
  const state = getState();
  const root = document.querySelector("[data-content-edit-page-settings]");
  if (!state?.pageData || !root) {
    return;
  }
  const page = ensurePageDataShape(state.pageData);
  const versionInput = root.querySelector('[data-page-field="version"]');
  const version = parseInt(String(versionInput?.value || "1"), 10);
  page.version = Number.isFinite(version) && version > 0 ? version : 1;

  page.slug = String(root.querySelector('[data-page-field="slug"]')?.value || "").trim();
  page.pageType = String(root.querySelector('[data-page-field="pageType"]')?.value || "page")
    .trim()
    .toLowerCase();

  if (!page.meta || typeof page.meta !== "object") {
    page.meta = {};
  }
  page.meta.title = String(root.querySelector('[data-page-field="meta.title"]')?.value || "").trim();
  page.meta.description = String(root.querySelector('[data-page-field="meta.description"]')?.value || "").trim();
  const parseRedirects = window.productData?.parseRedirectsList;
  const normalizeRedirect = window.productData?.normalizeRedirectPath;
  const redirectsRaw = String(root.querySelector('[data-page-field="meta.redirects"]')?.value || "");
  const redirects =
    typeof parseRedirects === "function"
      ? parseRedirects(redirectsRaw)
      : redirectsRaw
          .split(",")
          .map((entry) => (typeof normalizeRedirect === "function" ? normalizeRedirect(entry) : entry.trim()))
          .filter(Boolean);
  if (redirects.length) {
    page.meta.redirects = redirects;
  } else {
    delete page.meta.redirects;
  }

  if (page.pageType === "blog") {
    page.meta.date = String(root.querySelector('[data-page-field="meta.date"]')?.value || "").trim();
    page.meta.author = String(root.querySelector('[data-page-field="meta.author"]')?.value || "").trim();
    const tagsRaw = String(root.querySelector('[data-page-field="meta.tags"]')?.value || "");
    page.meta.tags = tagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  } else {
    delete page.meta.date;
    delete page.meta.author;
    delete page.meta.tags;
  }
}

function updateBlogFieldsVisibility() {
  const root = document.querySelector("[data-content-edit-page-settings]");
  if (!root) {
    return;
  }
  const isBlog = String(root.querySelector('[data-page-field="pageType"]')?.value || "").toLowerCase() === "blog";
  root.querySelectorAll("[data-blog-field]").forEach((el) => {
    if (isBlog) {
      el.removeAttribute("hidden");
    } else {
      el.setAttribute("hidden", "");
    }
  });
}

function bindPageSettingsControls() {
  const root = document.querySelector("[data-content-edit-page-settings]");
  if (!root || root.dataset.bound === "true") {
    return;
  }
  root.dataset.bound = "true";

  const onChange = () => {
    syncPageDataFromSettingsForm();
    updateBlogFieldsVisibility();
  };

  root.querySelectorAll("input, select, textarea").forEach((el) => {
    el.addEventListener("change", onChange);
    if (el.tagName === "INPUT" && el.type === "text") {
      el.addEventListener("input", onChange);
    }
    if (el.tagName === "TEXTAREA") {
      el.addEventListener("input", onChange);
    }
  });
}

async function buildEditBodyPayload(pageData, ctx) {
  const { shopData, products, blockCtx, pagePath } = ctx;
  const page = ensurePageDataShape(pageData);
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const meta = page.meta;
  const pageTitle = String(meta.title || page.slug || "Page").trim() || "Page";

  const editTemplate = await window.generateAnyPage.fetchText("./templates/partials/contentPageEdit.html");
  const blocksHtml = await renderEditBlocksHtml(blocks, blockCtx);
  const settingsHtml = buildPageSettingsEditHtml(page, pagePath || "");
  const bodyHtml = window.contentBlocks.applyTemplate(editTemplate, {
    PAGE_SETTINGS: settingsHtml,
    CONTENT_BLOCKS: blocksHtml,
  });

  const categories = window.productData.getProductsByCategory(products);
  const shopNameEsc = escapeHtml(shopData?.shopName || "Site");
  const titleEsc = escapeHtml(pageTitle);
  return {
    bodyHtml,
    categoryNames: categories.map((c) => c.name),
    pageTitle: `${shopNameEsc} - ${titleEsc}`,
  };
}

const EDITOR_ROOT = "tools/siteGenerator";

function buildTopbarHtml(pagePath) {
  const pickerUrl = `${EDITOR_ROOT}/index.html`;
  const previewUrl = `${EDITOR_ROOT}/index.html?path=${encodeURIComponent(pagePath)}`;
  return `<div class="content-edit-topbar" role="toolbar">
  <a href="${pickerUrl}">← Picker</a>
  <a href="${previewUrl}">Preview</a>
  <span data-github-push-root></span>
  <span class="content-edit-topbar-path">Editing: ${escapeHtml(pagePath)}</span>
</div>`;
}

async function ensureDocumentBaseForEdit() {
  if (document.querySelector("base[data-site-base]")) {
    return;
  }
  try {
    await loadScriptOnce(new URL("./setBase.js", window.location.href).href);
  } catch {
    const base = document.createElement("base");
    base.href = "/";
    base.setAttribute("data-site-base", "true");
    document.head.prepend(base);
  }
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

function loadScriptOnce(src) {
  const normalized = String(src || "").trim();
  return new Promise((resolve, reject) => {
    if (!normalized) {
      resolve();
      return;
    }
    if (document.querySelector(`script[src="${normalized}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = normalized;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${normalized}`));
    document.body.appendChild(script);
  });
}

function bindAddBlockButton() {
  const btn = document.querySelector("[data-content-edit-add]");
  if (!btn || btn.dataset.bound === "true") {
    return;
  }
  btn.dataset.bound = "true";
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    addBlock();
  });
}

function bindBlockToolbarControls(scope) {
  const root = scope || document.querySelector("[data-content-edit-blocks]");
  if (!root) {
    return;
  }
  root.querySelectorAll(".content-edit-block").forEach((shell) => {
    const index = parseInt(shell.getAttribute("data-block-index") || "", 10);
    if (!Number.isFinite(index)) {
      return;
    }
    shell.querySelectorAll(".content-edit-block-toolbar [data-action]").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) {
          return;
        }
        handleBlockAction(event, index, btn.getAttribute("data-action"));
      });
    });
  });
}

function bindBlockControls() {
  bindAddBlockButton();
  bindBlockToolbarControls();
}

function bindModalControls() {
  const backdrop = ensureModalDom();
  const cancelBtn = backdrop.querySelector("[data-content-edit-cancel]");
  const okBtn = backdrop.querySelector("[data-content-edit-ok]");
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = "true";
    cancelBtn.addEventListener("click", (event) => {
      event.preventDefault();
      closeModal();
    });
  }
  if (okBtn && !okBtn.dataset.bound) {
    okBtn.dataset.bound = "true";
    okBtn.addEventListener("click", (event) => {
      event.preventDefault();
      saveModal();
    });
  }
  if (!backdrop.dataset.bound) {
    backdrop.dataset.bound = "true";
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) {
        closeModal();
      }
    });
  }
}

async function mountEditPageInPlace(pagePath, bodyPayload, headerFooter) {
  await ensureDocumentBaseForEdit();

  const { headerHtml, footerHtml, siteCssPath, siteJsPath } = headerFooter;
  ensureStylesheet(siteCssPath);
  ensureStylesheet(`${EDITOR_ROOT}/contentEditor.css`, { cacheBust: true });

  document.title = bodyPayload.pageTitle;
  document.body.className = "content-edit-mode";
  document.body.style.margin = "0";
  document.body.style.padding = "0";
  document.body.innerHTML = `${buildTopbarHtml(pagePath)}
${headerHtml}
<main class="site-main">
${bodyPayload.bodyHtml}
</main>
${footerHtml}`;

  bindModalControls();
  bindBlockControls();
  bindPageSettingsControls();

  try {
    await loadScriptOnce(siteJsPath);
  } catch {
    // Carousel blocks may not switch slides; editing still works.
  }

  if (window.githubAuth?.initEditPushUi) {
    window.githubAuth.initEditPushUi({
      pagePath,
      getPageData: () => {
        syncPageDataFromSettingsForm();
        return getState()?.pageData;
      },
      publishHandler: (path, data, opts) => window.githubAuth.publishContentPageLive(path, data, opts),
      buildPublishOptions: async (pushResult) => {
        const state = getState();
        const productsFull = Array.isArray(state?.products) ? state.products : [];
        let fileTree;
        if (pushResult?.nextFileTree) {
          fileTree = pushResult.nextFileTree;
        } else {
          fileTree = await window.generateAnyPage.fetchJson("../../shared-assets/config/fileTree.json");
        }
        let products = productsFull;
        try {
          const productData = await window.productData.fetchProductDataJson();
          products = Array.isArray(productData?.products) ? productData.products : productsFull;
        } catch {
          /* use editor cache */
        }
        return {
          fileTree,
          products,
          pageData: pushResult?.pageData || state?.pageData,
        };
      },
    });
  }
}

function getState() {
  return window.__contentEditorState || window.__productEditorState || null;
}

function fieldValueToInput(block, field) {
  const raw = block[field.key];
  if (field.type === "json") {
    if (Array.isArray(raw) || (raw && typeof raw === "object")) {
      return JSON.stringify(raw, null, 2);
    }
    return "[]";
  }
  if (raw == null) {
    return "";
  }
  return String(raw);
}

function readFieldValueFromInput(input, field) {
  const raw = input.value;
  if (field.type === "json") {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    return JSON.parse(trimmed);
  }
  return raw;
}

const CAROUSEL_IMAGE_ITEM_FIELDS = [
  { key: "url", label: "Src / URL", type: "product_media", mediaKind: "image" },
  { key: "alt", label: "Alt text", type: "text" },
  { key: "caption", label: "Caption", type: "text" },
  {
    key: "width",
    label: "Width",
    type: "select",
    options: [
      { value: "", label: "Default" },
      { value: "wide", label: "Wide" },
      { value: "full", label: "Full" },
    ],
  },
];

const CAROUSEL_VIDEO_ITEM_FIELDS = [
  { key: "videoId", label: "YouTube video ID", type: "text" },
  { key: "url", label: "YouTube URL (alternative)", type: "product_media", mediaKind: "video" },
  { key: "caption", label: "Caption", type: "text" },
];

function defaultCarouselImageItem() {
  return { kind: "image", url: "", alt: "", caption: "", width: "" };
}

function defaultCarouselVideoItem() {
  return { kind: "video", videoId: "", url: "", caption: "" };
}

function normalizeCarouselItemForEdit(item) {
  if (!item || typeof item !== "object") {
    return defaultCarouselImageItem();
  }
  const kind = String(item.kind || "image").trim().toLowerCase();
  if (kind === "video") {
    return {
      kind: "video",
      videoId: String(item.videoId || "").trim(),
      url: String(item.url || "").trim(),
      caption: String(item.caption || "").trim(),
    };
  }
  return {
    kind: "image",
    url: String(item.url || item.src || "").trim(),
    alt: String(item.alt || "").trim(),
    caption: String(item.caption || "").trim(),
    width: String(item.width || "").trim(),
  };
}

function parseCarouselItemsForEdit(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => normalizeCarouselItemForEdit(item));
}

function getCarouselItemPreviewUrl(item) {
  const normalized = normalizeCarouselItemForEdit(item);
  if (normalized.kind === "video") {
    const parseId = getYoutubeVideoIdParser();
    let videoId = normalized.videoId;
    if (!videoId && typeof parseId === "function") {
      videoId = parseId(normalized.url) || "";
    }
    return videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
  }
  return normalized.url;
}

function serializeCarouselItemForSave(item) {
  const normalized = normalizeCarouselItemForEdit(item);
  if (normalized.kind === "video") {
    const parseId = getYoutubeVideoIdParser();
    let videoId = normalized.videoId;
    if (!videoId && typeof parseId === "function") {
      videoId = parseId(normalized.url) || "";
    }
    if (!/^[\w-]{11}$/.test(videoId)) {
      return null;
    }
    const out = { kind: "video", videoId };
    if (normalized.url) {
      out.url = normalized.url;
    }
    if (normalized.caption) {
      out.caption = normalized.caption;
    }
    return out;
  }
  if (!normalized.url) {
    return null;
  }
  const out = { kind: "image", url: normalized.url };
  if (normalized.alt) {
    out.alt = normalized.alt;
  }
  if (normalized.caption) {
    out.caption = normalized.caption;
  }
  if (normalized.width) {
    out.width = normalized.width;
  }
  return out;
}

function sanitizeCarouselItemsForSave(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item) => serializeCarouselItemForSave(item)).filter(Boolean);
}

function getCarouselItemsFromEditor(form) {
  const editor = form?.querySelector("[data-carousel-editor]");
  if (!editor) {
    return [];
  }
  return Array.isArray(editor._carouselItems) ? editor._carouselItems.map((item) => ({ ...item })) : [];
}

function syncCarouselEditorItems(editor, items) {
  const list = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
  editor._carouselItems = list;
  if (list.length === 0) {
    editor._carouselActiveIndex = 0;
  } else if (editor._carouselActiveIndex >= list.length) {
    editor._carouselActiveIndex = list.length - 1;
  } else if (editor._carouselActiveIndex < 0) {
    editor._carouselActiveIndex = 0;
  }
  const hidden = editor.querySelector('[name="items"]');
  if (hidden) {
    hidden.value = JSON.stringify(sanitizeCarouselItemsForSave(list));
  }
}

function collectCarouselItemFromForm(form, kind) {
  const fields = kind === "video" ? CAROUSEL_VIDEO_ITEM_FIELDS : CAROUSEL_IMAGE_ITEM_FIELDS;
  const item = kind === "video" ? defaultCarouselVideoItem() : defaultCarouselImageItem();
  for (const field of fields) {
    const input = form.querySelector(`[name="${field.key}"]`);
    if (!input) {
      continue;
    }
    item[field.key] = readFieldValueFromInput(input, field);
  }
  return item;
}

function collectFormBlockData(form, type) {
  const block = { type };
  const schema = BLOCK_SCHEMAS[type];
  if (!schema) {
    return block;
  }
  for (const field of schema.fields) {
    if (field.type === "carousel_items") {
      block.items = sanitizeCarouselItemsForSave(getCarouselItemsFromEditor(form));
      continue;
    }
    const input = form.querySelector(`[name="${field.key}"]`);
    if (!input) {
      continue;
    }
    block[field.key] = readFieldValueFromInput(input, field);
  }
  return block;
}

function readCurrentFormValues(form) {
  const values = {};
  form.querySelectorAll("[name]").forEach((el) => {
    const name = el.getAttribute("name");
    if (!name) {
      return;
    }
    if (el.tagName === "SELECT" || el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      values[name] = el.value;
    }
  });
  return values;
}

const PRODUCT_VIDEO_COLUMN_KEYS = ["VIDEO1", "VIDEO3", "ETSY_VIDEO1", "ETSY_VIDEO2", "ETSY_VIDEO3"];

function collectProductVideoUrls(row) {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    const u = String(raw || "").trim();
    if (u && !seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  };
  for (const key of PRODUCT_VIDEO_COLUMN_KEYS) {
    add(row[key]);
  }
  const instruction = String(row["INSTRUCTION VIDEOS"] || "").trim();
  if (instruction) {
    for (const part of instruction.split(",")) {
      add(part);
    }
  }
  return out;
}

function searchProductsByTitle(query, products) {
  const q = String(query || "")
    .trim()
    .toLowerCase();
  const list = Array.isArray(products) ? products : [];
  if (!q) {
    return [];
  }
  const resolveTitle = window.productData?.resolveProductDisplayTitle;
  return list
    .filter((row) => {
      const displayTitle =
        typeof resolveTitle === "function"
          ? resolveTitle(row, "")
          : String(row?.TITLE || "").trim();
      const etsyTitle = String(row?.TITLE || "").trim();
      const haystack = `${displayTitle} ${etsyTitle}`.toLowerCase();
      return haystack.includes(q);
    })
    .slice(0, 24);
}

function getYoutubeVideoIdParser() {
  return window.generateProductBody?.parseYoutubeVideoId || null;
}

function applyMediaUrlToForm(form, field, url, mediaKind) {
  const urlInput = form.querySelector(`[name="${field.key}"]`);
  if (urlInput) {
    urlInput.value = url;
  }
  if (mediaKind === "video") {
    const parseId = getYoutubeVideoIdParser();
    const videoIdInput = form.querySelector('[name="videoId"]');
    if (videoIdInput && typeof parseId === "function") {
      videoIdInput.value = parseId(url) || "";
    }
  }
}

function buildProductMediaThumbnails(row, mediaKind) {
  if (mediaKind === "video") {
    const parseId = getYoutubeVideoIdParser();
    return collectProductVideoUrls(row).map((url) => {
      const videoId = typeof parseId === "function" ? parseId(url) : null;
      const thumbUrl = videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : "";
      return { url, thumbUrl, isVideo: true };
    });
  }
  const collectImages = window.productData?.collectProductImageUrls;
  const urls = typeof collectImages === "function" ? collectImages(row) : [];
  return urls.map((url) => ({ url, thumbUrl: url, isVideo: false }));
}

function bindProductMediaPicker({ wrap, field, form, modeSelect, urlInput, picker, products, mediaKind }) {
  const searchInput = picker.querySelector("[data-product-search]");
  const resultsEl = picker.querySelector("[data-product-results]");
  const thumbsEl = picker.querySelector("[data-product-thumbs]");
  function setMode(mode) {
    const useProduct = mode === "product";
    picker.hidden = !useProduct;
    urlInput.hidden = useProduct;
    wrap.classList.toggle("content-edit-field--product-mode", useProduct);
    wrap.classList.toggle("content-edit-field--url-mode", !useProduct);
    if (!useProduct) {
      thumbsEl.hidden = true;
      resultsEl.hidden = false;
    }
  }

  function renderResults(rows) {
    resultsEl.textContent = "";
    if (!rows.length) {
      resultsEl.hidden = false;
      const empty = document.createElement("p");
      empty.className = "content-edit-product-empty";
      empty.textContent = searchInput.value.trim()
        ? "No products match that title."
        : "Type in the search box to find shop listings.";
      resultsEl.appendChild(empty);
      return;
    }
    resultsEl.hidden = false;
    const list = document.createElement("ul");
    list.className = "content-edit-product-list";
    for (const row of rows) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "content-edit-product-list-btn";
      const resolveTitle = window.productData?.resolveProductDisplayTitle;
      btn.textContent =
        typeof resolveTitle === "function"
          ? resolveTitle(row, "Untitled")
          : String(row.TITLE || "Untitled").trim() || "Untitled";
      btn.addEventListener("click", () => {
        resultsEl.hidden = true;
        renderThumbs(row);
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
    resultsEl.appendChild(list);
  }

  function renderThumbs(row) {
    const resolveTitle = window.productData?.resolveProductDisplayTitle;
    const titleText =
      typeof resolveTitle === "function"
        ? resolveTitle(row, "Untitled")
        : String(row.TITLE || "Untitled").trim() || "Untitled";
    const items = buildProductMediaThumbnails(row, mediaKind);
    thumbsEl.hidden = false;
    thumbsEl.replaceChildren();

    const heading = document.createElement("p");
    heading.className = "content-edit-product-thumbs-heading";
    heading.textContent = titleText;
    thumbsEl.appendChild(heading);

    if (!items.length) {
      const empty = document.createElement("p");
      empty.className = "content-edit-product-empty";
      empty.textContent =
        mediaKind === "video" ? "This product has no video URLs in the catalog." : "This product has no images in the catalog.";
      thumbsEl.appendChild(empty);
      return;
    }

    const grid = document.createElement("div");
    grid.className = "content-edit-product-thumb-grid";
    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "content-edit-product-thumb-btn";
      btn.title = item.url;
      if (item.thumbUrl) {
        const img = document.createElement("img");
        img.src = item.thumbUrl;
        img.alt = "";
        img.loading = "lazy";
        btn.appendChild(img);
      } else {
        btn.textContent = "Video";
      }
      btn.addEventListener("click", () => {
        applyMediaUrlToForm(form, field, item.url, mediaKind);
        modeSelect.value = "url";
        setMode("url");
      });
      grid.appendChild(btn);
    }
    thumbsEl.appendChild(grid);

    const back = document.createElement("button");
    back.type = "button";
    back.className = "content-edit-product-back";
    back.textContent = "← Back to results";
    back.addEventListener("click", () => {
      thumbsEl.hidden = true;
      resultsEl.hidden = false;
      renderResults(searchProductsByTitle(searchInput.value, products));
    });
    thumbsEl.appendChild(back);
  }

  modeSelect.addEventListener("change", () => {
    setMode(modeSelect.value);
    if (modeSelect.value === "product") {
      renderResults(searchProductsByTitle(searchInput.value, products));
    }
  });

  searchInput.addEventListener("input", () => {
    thumbsEl.hidden = true;
    resultsEl.hidden = false;
    renderResults(searchProductsByTitle(searchInput.value, products));
  });

  setMode("url");
}

function appendSchemaFields(container, fields, block, form) {
  for (const field of fields) {
    appendFieldInput(container, field, block, form);
  }
}

function renderCarouselEditor(editor, items, activeIndex) {
  const list = Array.isArray(items) ? items : [];
  const active = list.length ? Math.min(Math.max(activeIndex, 0), list.length - 1) : 0;
  editor._carouselActiveIndex = active;

  const stage = editor.querySelector("[data-carousel-stage]");
  const thumbs = editor.querySelector("[data-carousel-thumbs]");
  const empty = editor.querySelector("[data-carousel-empty]");
  if (!stage || !thumbs) {
    return;
  }

  stage.replaceChildren();
  thumbs.replaceChildren();

  if (!list.length) {
    if (empty) {
      empty.hidden = false;
    }
    const placeholder = document.createElement("button");
    placeholder.type = "button";
    placeholder.className = "content-edit-carousel-stage-placeholder";
    placeholder.textContent = "Click to add first slide";
    placeholder.addEventListener("click", () => {
      editor._onAddImage?.();
    });
    stage.appendChild(placeholder);
    return;
  }

  if (empty) {
    empty.hidden = true;
  }

  const activeItem = list[active];
  const previewUrl = getCarouselItemPreviewUrl(activeItem);
  const stageBtn = document.createElement("button");
  stageBtn.type = "button";
  stageBtn.className = "content-edit-carousel-stage-btn";
  stageBtn.setAttribute("aria-label", "Edit active slide");
  if (previewUrl) {
    const img = document.createElement("img");
    img.src = previewUrl;
    img.alt = "";
    img.className = "content-edit-carousel-stage-img";
    stageBtn.appendChild(img);
    if (activeItem.kind === "video") {
      stageBtn.classList.add("content-edit-carousel-stage-btn--video");
    }
  } else {
    stageBtn.classList.add("content-edit-carousel-stage-btn--empty");
    stageBtn.textContent = activeItem.kind === "video" ? "Video (no URL yet)" : "Image (no URL yet)";
  }
  stageBtn.addEventListener("click", () => {
    editor._onEditItem?.(active);
  });
  stage.appendChild(stageBtn);

  list.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "content-edit-carousel-thumb-item";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "content-edit-carousel-thumb";
    if (index === active) {
      btn.classList.add("is-active");
      btn.setAttribute("aria-current", "true");
    } else {
      btn.setAttribute("aria-current", "false");
    }
    btn.setAttribute("aria-label", `Slide ${index + 1}`);
    const thumbUrl = getCarouselItemPreviewUrl(item);
    if (thumbUrl) {
      const img = document.createElement("img");
      img.src = thumbUrl;
      img.alt = "";
      img.className = "content-edit-carousel-thumb-img";
      btn.appendChild(img);
      if (item.kind === "video") {
        btn.classList.add("content-edit-carousel-thumb--video");
      }
    } else {
      btn.classList.add("content-edit-carousel-thumb--empty");
      btn.textContent = item.kind === "video" ? "▶" : "+";
    }
    btn.addEventListener("click", () => {
      editor._carouselActiveIndex = index;
      renderCarouselEditor(editor, editor._carouselItems, index);
    });
    btn.addEventListener("dblclick", (event) => {
      event.preventDefault();
      editor._onEditItem?.(index);
    });
    li.appendChild(btn);
    thumbs.appendChild(li);
  });
}

function bindCarouselEditor(editor, form) {
  const addImageBtn = editor.querySelector("[data-carousel-add-image]");
  const addVideoBtn = editor.querySelector("[data-carousel-add-video]");
  const editBtn = editor.querySelector("[data-carousel-edit]");
  const removeBtn = editor.querySelector("[data-carousel-remove]");
  const leftBtn = editor.querySelector("[data-carousel-move-left]");
  const rightBtn = editor.querySelector("[data-carousel-move-right]");

  editor._onAddImage = () => {
    const items = getCarouselItemsFromEditor(form);
    items.push(defaultCarouselImageItem());
    syncCarouselEditorItems(editor, items);
    renderCarouselEditor(editor, items, items.length - 1);
    openCarouselItemModal(form, editor, items.length - 1);
  };

  editor._onAddVideo = () => {
    const items = getCarouselItemsFromEditor(form);
    items.push(defaultCarouselVideoItem());
    syncCarouselEditorItems(editor, items);
    renderCarouselEditor(editor, items, items.length - 1);
    openCarouselItemModal(form, editor, items.length - 1);
  };

  editor._onEditItem = (index) => {
    openCarouselItemModal(form, editor, index);
  };

  addImageBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    editor._onAddImage();
  });
  addVideoBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    editor._onAddVideo();
  });
  editBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    const items = getCarouselItemsFromEditor(form);
    if (!items.length) {
      return;
    }
    openCarouselItemModal(form, editor, editor._carouselActiveIndex || 0);
  });
  removeBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    const items = getCarouselItemsFromEditor(form);
    if (!items.length) {
      return;
    }
    const index = editor._carouselActiveIndex || 0;
    items.splice(index, 1);
    syncCarouselEditorItems(editor, items);
    renderCarouselEditor(editor, items, Math.min(index, items.length - 1));
  });
  leftBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    const items = getCarouselItemsFromEditor(form);
    const index = editor._carouselActiveIndex || 0;
    if (index <= 0) {
      return;
    }
    const tmp = items[index - 1];
    items[index - 1] = items[index];
    items[index] = tmp;
    syncCarouselEditorItems(editor, items);
    renderCarouselEditor(editor, items, index - 1);
  });
  rightBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    const items = getCarouselItemsFromEditor(form);
    const index = editor._carouselActiveIndex || 0;
    if (index >= items.length - 1) {
      return;
    }
    const tmp = items[index + 1];
    items[index + 1] = items[index];
    items[index] = tmp;
    syncCarouselEditorItems(editor, items);
    renderCarouselEditor(editor, items, index + 1);
  });
}

function appendCarouselItemsFieldInput(container, field, block, form) {
  const items = parseCarouselItemsForEdit(block.items);

  const wrap = document.createElement("div");
  wrap.className = "content-edit-field content-edit-field--wide";

  const label = document.createElement("label");
  label.textContent = field.label;
  wrap.appendChild(label);

  const editor = document.createElement("div");
  editor.className = "content-edit-carousel-editor";
  editor.setAttribute("data-carousel-editor", "");
  editor.innerHTML = `<input type="hidden" name="items" value="[]" />
<div class="content-edit-carousel-stage-wrap">
  <div class="content-edit-carousel-stage" data-carousel-stage></div>
  <p class="content-edit-carousel-empty" data-carousel-empty hidden>No slides yet.</p>
</div>
<ul class="content-edit-carousel-thumbs" data-carousel-thumbs></ul>
<div class="content-edit-carousel-toolbar">
  <button type="button" class="content-edit-carousel-tool" data-carousel-add-image>+ Image</button>
  <button type="button" class="content-edit-carousel-tool" data-carousel-add-video>+ Video</button>
  <button type="button" class="content-edit-carousel-tool" data-carousel-edit>Edit slide</button>
  <button type="button" class="content-edit-carousel-tool content-edit-carousel-tool--danger" data-carousel-remove>Remove</button>
  <button type="button" class="content-edit-carousel-tool" data-carousel-move-left aria-label="Move slide left">←</button>
  <button type="button" class="content-edit-carousel-tool" data-carousel-move-right aria-label="Move slide right">→</button>
</div>
<p class="content-edit-field-hint">Click a slide or thumbnail to select. Double-click or use Edit slide to change src, alt, and caption.</p>`;

  wrap.appendChild(editor);
  container.appendChild(wrap);

  syncCarouselEditorItems(editor, items);
  renderCarouselEditor(editor, items, 0);
  bindCarouselEditor(editor, form);
}

function appendProductMediaFieldInput(container, field, block, form) {
  const state = getState();
  const products = Array.isArray(state?.products) ? state.products : [];
  const mediaKind = field.mediaKind === "video" ? "video" : "image";
  const value = fieldValueToInput(block, field);

  const wrap = document.createElement("div");
  wrap.className = "content-edit-field content-edit-field--wide content-edit-field--url-mode";
  wrap.setAttribute("data-product-media-field", field.key);

  const header = document.createElement("div");
  header.className = "content-edit-media-header";

  const label = document.createElement("label");
  label.setAttribute("for", `cef-${field.key}`);
  label.textContent = field.label;

  const modeSelect = document.createElement("select");
  modeSelect.className = "content-edit-media-mode";
  modeSelect.setAttribute("data-media-mode-select", "");
  modeSelect.setAttribute("aria-label", `${field.label} — how to choose`);
  modeSelect.innerHTML =
    '<option value="url">Enter URL</option><option value="product">Search product catalog</option>';

  header.appendChild(label);
  header.appendChild(modeSelect);
  wrap.appendChild(header);

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.id = `cef-${field.key}`;
  urlInput.name = field.key;
  urlInput.value = value;
  urlInput.className = "content-edit-media-url-input";
  urlInput.autocomplete = "off";
  urlInput.placeholder = mediaKind === "video" ? "https://www.youtube.com/watch?v=…" : "https://…";
  wrap.appendChild(urlInput);

  const picker = document.createElement("div");
  picker.className = "content-edit-product-picker";
  picker.hidden = true;
  picker.innerHTML = `<input type="search" class="content-edit-product-search" data-product-search placeholder="Search by product title…" autocomplete="off" />
<div data-product-results class="content-edit-product-results"></div>
<div data-product-thumbs class="content-edit-product-thumbs" hidden></div>`;
  wrap.appendChild(picker);

  container.appendChild(wrap);
  bindProductMediaPicker({ wrap, field, form, modeSelect, urlInput, picker, products, mediaKind });
}

function appendFieldInput(container, field, block, form) {
  if (field.type === "carousel_items") {
    appendCarouselItemsFieldInput(container, field, block, form);
    return;
  }
  if (field.type === "product_media") {
    appendProductMediaFieldInput(container, field, block, form);
    return;
  }

  const value = fieldValueToInput(block, field);
  const wrap = document.createElement("div");
  wrap.className = "content-edit-field";

  const label = document.createElement("label");
  label.setAttribute("for", `cef-${field.key}`);
  label.textContent = field.label;

  let input;
  if (field.type === "select") {
    input = document.createElement("select");
    input.id = `cef-${field.key}`;
    input.name = field.key;
    for (const opt of field.options || []) {
      const option = document.createElement("option");
      option.value = opt.value;
      option.textContent = opt.label;
      if (String(opt.value) === String(value)) {
        option.selected = true;
      }
      input.appendChild(option);
    }
  } else if (field.type === "textarea" || field.type === "json") {
    input = document.createElement("textarea");
    input.id = `cef-${field.key}`;
    input.name = field.key;
    input.value = value;
  } else {
    input = document.createElement("input");
    input.type = "text";
    input.id = `cef-${field.key}`;
    input.name = field.key;
    input.value = value;
  }

  wrap.appendChild(label);
  wrap.appendChild(input);
  if (field.hint) {
    const hint = document.createElement("p");
    hint.className = "content-edit-field-hint";
    hint.textContent = field.hint;
    wrap.appendChild(hint);
  }
  container.appendChild(wrap);
}

function populateModalFieldsContainer(container, type, block, form) {
  container.textContent = "";
  const schema = BLOCK_SCHEMAS[type] || BLOCK_SCHEMAS.text;
  for (const field of schema.fields) {
    appendFieldInput(container, field, block, form);
  }
}

function populateModalForm(modalBody, type, block) {
  modalBody.textContent = "";
  const form = document.createElement("form");
  form.className = "content-edit-modal-form";
  form.setAttribute("data-content-edit-form", "");

  const typeField = document.createElement("div");
  typeField.className = "content-edit-field";
  const typeLabel = document.createElement("label");
  typeLabel.setAttribute("for", "cef-type");
  typeLabel.textContent = "Block type";
  const typeSelect = document.createElement("select");
  typeSelect.id = "cef-type";
  typeSelect.name = "type";
  for (const opt of BLOCK_TYPE_OPTIONS) {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === type) {
      option.selected = true;
    }
    typeSelect.appendChild(option);
  }
  typeField.appendChild(typeLabel);
  typeField.appendChild(typeSelect);
  form.appendChild(typeField);

  const fieldsWrap = document.createElement("div");
  fieldsWrap.setAttribute("data-content-edit-fields", "");
  populateModalFieldsContainer(fieldsWrap, type, block, form);
  form.appendChild(fieldsWrap);

  let currentBlockType = type;
  typeSelect.addEventListener("change", () => {
    const prevType = String(currentBlockType || "text").trim().toLowerCase();
    const partial = collectFormBlockData(form, prevType);
    const newType = typeSelect.value;
    currentBlockType = newType;
    const merged = { ...defaultBlockForType(newType), ...partial, type: newType };
    populateModalFieldsContainer(fieldsWrap, newType, merged, form);
    updateBlockModalLayout(newType);
  });

  modalBody.appendChild(form);
  updateBlockModalLayout(type);
  return form;
}

function updateBlockModalLayout(blockType) {
  const backdrop = document.querySelector("[data-content-edit-modal]");
  const modal = backdrop?.querySelector(".content-edit-modal");
  if (!modal) {
    return;
  }
  modal.classList.toggle("content-edit-modal--carousel", String(blockType || "").trim().toLowerCase() === "carousel");
}

function showModalBackdrop(backdrop) {
  backdrop.hidden = false;
  backdrop.classList.add("content-edit-modal-backdrop--open");
}

function hideModalBackdrop(backdrop) {
  backdrop.classList.remove("content-edit-modal-backdrop--open");
  backdrop.hidden = true;
}

function ensureCarouselItemModalDom() {
  let backdrop = document.querySelector("[data-carousel-item-modal]");
  if (backdrop) {
    return backdrop;
  }
  backdrop = document.createElement("div");
  backdrop.className = "content-edit-modal-backdrop content-edit-carousel-item-modal-backdrop";
  backdrop.setAttribute("data-carousel-item-modal", "");
  backdrop.hidden = true;
  backdrop.innerHTML = `<div class="content-edit-modal content-edit-modal--item" role="dialog" aria-modal="true" aria-labelledby="content-edit-carousel-item-title">
  <h2 id="content-edit-carousel-item-title">Edit slide</h2>
  <div data-carousel-item-modal-body></div>
  <div class="content-edit-modal-actions">
    <button type="button" class="content-edit-modal-cancel" data-carousel-item-cancel>Cancel</button>
    <button type="button" class="content-edit-modal-ok" data-carousel-item-ok>OK</button>
  </div>
</div>`;
  document.body.appendChild(backdrop);

  const cancelBtn = backdrop.querySelector("[data-carousel-item-cancel]");
  const okBtn = backdrop.querySelector("[data-carousel-item-ok]");
  cancelBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    closeCarouselItemModal();
  });
  okBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    saveCarouselItemModal();
  });
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) {
      closeCarouselItemModal();
    }
  });

  return backdrop;
}

function closeCarouselItemModal() {
  const state = getState();
  if (state) {
    state.carouselItemEdit = null;
  }
  const backdrop = document.querySelector("[data-carousel-item-modal]");
  if (backdrop) {
    hideModalBackdrop(backdrop);
  }
}

function openCarouselItemModal(parentForm, carouselEditor, itemIndex) {
  const items = getCarouselItemsFromEditor(parentForm);
  const item = items[itemIndex];
  if (!item) {
    return;
  }

  const state = getState();
  if (!state) {
    return;
  }
  state.carouselItemEdit = { parentForm, carouselEditor, itemIndex };

  const kind = item.kind === "video" ? "video" : "image";
  const backdrop = ensureCarouselItemModalDom();
  const title = backdrop.querySelector("#content-edit-carousel-item-title");
  const body = backdrop.querySelector("[data-carousel-item-modal-body]");
  if (!body) {
    return;
  }
  if (title) {
    title.textContent = kind === "video" ? "Edit video slide" : "Edit image slide";
  }

  body.textContent = "";
  const form = document.createElement("form");
  form.className = "content-edit-modal-form";
  form.setAttribute("data-carousel-item-form", "");
  const fieldsWrap = document.createElement("div");
  fieldsWrap.setAttribute("data-content-edit-fields", "");
  const fields = kind === "video" ? CAROUSEL_VIDEO_ITEM_FIELDS : CAROUSEL_IMAGE_ITEM_FIELDS;
  appendSchemaFields(fieldsWrap, fields, item, form);
  form.appendChild(fieldsWrap);
  body.appendChild(form);

  showModalBackdrop(backdrop);
}

function saveCarouselItemModal() {
  const state = getState();
  const ctx = state?.carouselItemEdit;
  if (!ctx) {
    return;
  }
  const backdrop = document.querySelector("[data-carousel-item-modal]");
  const form = backdrop?.querySelector("[data-carousel-item-form]");
  if (!form) {
    return;
  }

  const items = getCarouselItemsFromEditor(ctx.parentForm);
  const existing = items[ctx.itemIndex];
  const kind = existing?.kind === "video" ? "video" : "image";
  try {
    const updated = collectCarouselItemFromForm(form, kind);
    updated.kind = kind;
    if (kind === "video" && !serializeCarouselItemForSave(updated)) {
      throw new Error("Video slide requires a valid YouTube URL or video ID.");
    }
    items[ctx.itemIndex] = updated;
    syncCarouselEditorItems(ctx.carouselEditor, items);
    renderCarouselEditor(ctx.carouselEditor, items, ctx.itemIndex);
    closeCarouselItemModal();
  } catch (err) {
    window.alert(err?.message || String(err));
  }
}

function ensureModalDom() {
  let backdrop = document.querySelector("[data-content-edit-modal]");
  if (backdrop) {
    return backdrop;
  }
  backdrop = document.createElement("div");
  backdrop.className = "content-edit-modal-backdrop";
  backdrop.setAttribute("data-content-edit-modal", "");
  backdrop.hidden = true;
  backdrop.innerHTML = `<div class="content-edit-modal" role="dialog" aria-modal="true" aria-labelledby="content-edit-modal-title">
  <h2 id="content-edit-modal-title">Edit block</h2>
  <div data-content-edit-modal-body></div>
  <div class="content-edit-modal-actions">
    <button type="button" class="content-edit-modal-cancel" data-content-edit-cancel>Cancel</button>
    <button type="button" class="content-edit-modal-ok" data-content-edit-ok>OK</button>
  </div>
</div>`;
  document.body.appendChild(backdrop);
  return backdrop;
}

function closeModal() {
  closeCarouselItemModal();
  const state = getState();
  if (state) {
    state.modalIndex = null;
  }
  const backdrop = document.querySelector("[data-content-edit-modal]");
  if (backdrop) {
    hideModalBackdrop(backdrop);
  }
}

function openModal(index) {
  try {
    const state = getState();
    if (!state || !Array.isArray(state.pageData?.blocks)) {
      throw new Error("Editor state not loaded. Reload the page and try again.");
    }
    const block = state.pageData.blocks[index];
    if (!block) {
      return;
    }
    state.modalIndex = index;
    const type = String(block.type || "text").trim().toLowerCase();
    const backdrop = ensureModalDom();
    const modalBody = backdrop.querySelector("[data-content-edit-modal-body]");
    if (!modalBody) {
      throw new Error("Edit dialog failed to initialize.");
    }
    populateModalForm(modalBody, type, block);
    showModalBackdrop(backdrop);
  } catch (err) {
    window.alert(err?.message || String(err));
  }
}

function handleBlockAction(event, index, action) {
  if (event) {
    event.preventDefault();
    event.stopPropagation();
  }
  if (actionBtnDisabled(index, action)) {
    return;
  }
  const n = Number(index);
  if (!Number.isFinite(n)) {
    return;
  }
  if (action === "up") {
    moveBlock(n, -1);
  } else if (action === "down") {
    moveBlock(n, 1);
  } else if (action === "edit") {
    openModal(n);
  } else if (action === "delete") {
    deleteBlock(n);
  }
}

function actionBtnDisabled(index, action) {
  const state = getState();
  const blocks = state?.pageData?.blocks;
  if (!Array.isArray(blocks)) {
    return false;
  }
  if (action === "up") {
    return index <= 0;
  }
  if (action === "down") {
    return index >= blocks.length - 1;
  }
  return false;
}

function saveModal() {
  const state = getState();
  if (!state || state.modalIndex == null) {
    return;
  }
  const backdrop = document.querySelector("[data-content-edit-modal]");
  const form = backdrop?.querySelector("[data-content-edit-form]");
  if (!form) {
    return;
  }
  const type = String(form.querySelector('[name="type"]')?.value || "text").trim().toLowerCase();
  try {
    const block = collectFormBlockData(form, type);
    state.pageData.blocks[state.modalIndex] = block;
    closeModal();
    rerenderAllBlocks().catch((err) => {
      window.alert(err?.message || String(err));
    });
  } catch (err) {
    window.alert(err?.message || String(err));
  }
}

async function rerenderAllBlocks() {
  const state = getState();
  if (!state) {
    return;
  }
  const container = document.querySelector("[data-content-edit-blocks]");
  if (!container) {
    return;
  }
  container.innerHTML = await renderEditBlocksHtml(state.pageData.blocks, state.blockCtx);
  bindBlockToolbarControls(container);
}

function moveBlock(index, delta) {
  const state = getState();
  if (!state || !Array.isArray(state.pageData.blocks)) {
    return;
  }
  const next = index + delta;
  if (next < 0 || next >= state.pageData.blocks.length) {
    return;
  }
  const blocks = state.pageData.blocks;
  const tmp = blocks[index];
  blocks[index] = blocks[next];
  blocks[next] = tmp;
  rerenderAllBlocks().catch((err) => {
    window.alert(err?.message || String(err));
  });
}

function deleteBlock(index) {
  const state = getState();
  if (!state || !Array.isArray(state.pageData.blocks)) {
    return;
  }
  state.pageData.blocks.splice(index, 1);
  closeModal();
  rerenderAllBlocks().catch((err) => {
    window.alert(err?.message || String(err));
  });
}

function addBlock() {
  const state = getState();
  if (!state) {
    return;
  }
  if (!Array.isArray(state.pageData.blocks)) {
    state.pageData.blocks = [];
  }
  const block = defaultBlockForType("text");
  state.pageData.blocks.push(block);
  const newIndex = state.pageData.blocks.length - 1;
  rerenderAllBlocks()
    .then(() => {
      openModal(newIndex);
    })
    .catch((err) => {
      window.alert(err?.message || String(err));
    });
}

function bindEditorEvents() {
  bindBlockControls();
  bindModalControls();
  bindPageSettingsControls();
}

async function initEditorUi() {
  const state = getState();
  if (!state) {
    throw new Error("Editor state missing.");
  }
  if (!state.blockCtx) {
    state.blockCtx = await window.generateContentBody.buildBlockRenderContext();
    state.blockCtx.lenient = true;
  }
  bindEditorEvents();
}

async function bootEditPage(treePath) {
  if (!isEditableContentPath(treePath)) {
    throw new Error(`Edit mode is only available for content pages. Got: ${treePath}`);
  }

  const previewParams = window.previewTarget.parsePreviewTarget(window.location.search);
  const isNew = previewParams?.isNew === true;
  let pageData;
  if (isNew) {
    const pendingHint =
      typeof window.displayFileTree?.getPendingNewPage === "function"
        ? window.displayFileTree.getPendingNewPage(treePath)
        : null;
    pageData = window.generateContentBody.createDefaultPageData(treePath, {
      title: pendingHint?.title || "",
      slug: pendingHint?.slug || "",
      pageType: pendingHint?.pageType || undefined,
    });
  } else {
    pageData = await window.generateContentBody.loadContentPageJson(treePath);
  }
  const blockCtx = await window.generateContentBody.buildBlockRenderContext();
  blockCtx.lenient = true;

  window.__contentEditorState = {
    pagePath: treePath,
    pageData: JSON.parse(JSON.stringify(pageData)),
    blockCtx,
    products: [],
    modalIndex: null,
    eventsBound: false,
    isNew,
  };

  const [shopData, navigationConfig, fileTreeConfig, productData] = await Promise.all([
    window.generateAnyPage.fetchJson("../../shared-assets/config/shopData.json"),
    window.generateAnyPage.fetchJson("../../shared-assets/config/navigation.json"),
    window.generateAnyPage.fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  const homePageHref = window.homePage?.getHomePageHref
    ? window.homePage.getHomePageHref(fileTreeConfig)
    : null;
  const products = Array.isArray(productData?.products) ? productData.products : [];
  const digitalFilter = previewParams?.digital ?? null;
  const productsForShop = window.productData.filterProductsByDigital(products, digitalFilter);
  window.__contentEditorState.products = productsForShop;

  const bodyPayload = await buildEditBodyPayload(window.__contentEditorState.pageData, {
    shopData,
    products: productsForShop,
    blockCtx,
    pagePath: treePath,
  });

  const headerFooter = await window.generateHeaderAndFooter.generateHeaderAndFooter(
    shopData,
    navigationConfig,
    { categoryNames: bodyPayload.categoryNames, homePageHref },
  );

  await mountEditPageInPlace(treePath, bodyPayload, headerFooter);
}

window.carouselEditor = {
  getCarouselItemsFromEditor,
  sanitizeCarouselItemsForSave,
  mountCarouselEditor(container, form, items, label) {
    const block = { items: Array.isArray(items) ? items : [] };
    const field = { key: "items", label: label || "Slides", type: "carousel_items" };
    appendCarouselItemsFieldInput(container, field, block, form);
  },
};

window.contentEditor = {
  bootEditPage,
  initEditorUi,
  bindEditorEvents,
  handleBlockAction,
  openModal,
  isEditableContentPath,
  ensureDocumentBaseForEdit,
  bindModalControls,
};
