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
      { key: "src", label: "Src / URL", type: "text" },
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
    fields: [
      {
        key: "items",
        label: "Items (JSON array)",
        type: "json",
        hint: '[{"kind":"image","url":"…"}] or {"kind":"video","videoId":"…"}',
      },
    ],
  },
  video: {
    label: "Video",
    fields: [
      { key: "videoId", label: "YouTube video ID", type: "text" },
      { key: "url", label: "YouTube URL (alternative)", type: "text" },
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

function isEditableContentPath(treePath) {
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

async function buildEditBodyPayload(pageData, ctx) {
  const { shopData, products, blockCtx } = ctx;
  const page = pageData && typeof pageData === "object" ? pageData : {};
  const blocks = Array.isArray(page.blocks) ? page.blocks : [];
  const meta = page.meta && typeof page.meta === "object" ? page.meta : {};
  const pageType = String(page.pageType || "page").trim().toLowerCase();
  const pageTitle = String(meta.title || page.slug || "Page").trim() || "Page";

  const editTemplate = await window.generateAnyPage.fetchText("./templates/partials/contentPageEdit.html");
  const blocksHtml = await renderEditBlocksHtml(blocks, blockCtx);
  const metaHtml = window.contentBlocks.buildContentMetaHtml(meta, pageType);
  const bodyHtml = window.contentBlocks.applyTemplate(editTemplate, {
    CONTENT_META: metaHtml,
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

function ensureStylesheet(href) {
  const normalized = String(href || "").trim();
  if (!normalized) {
    return;
  }
  if (document.querySelector(`link[rel="stylesheet"][href="${normalized}"]`)) {
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = normalized;
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
  ensureStylesheet(`${EDITOR_ROOT}/contentEditor.css`);

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

  try {
    await loadScriptOnce(siteJsPath);
  } catch {
    // Carousel blocks may not switch slides; editing still works.
  }
}

function getState() {
  return window.__contentEditorState || null;
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

function collectFormBlockData(form, type) {
  const block = { type };
  const schema = BLOCK_SCHEMAS[type];
  if (!schema) {
    return block;
  }
  for (const field of schema.fields) {
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

function appendFieldInput(container, field, block) {
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

function populateModalFieldsContainer(container, type, block) {
  container.textContent = "";
  const schema = BLOCK_SCHEMAS[type] || BLOCK_SCHEMAS.text;
  for (const field of schema.fields) {
    appendFieldInput(container, field, block);
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
  populateModalFieldsContainer(fieldsWrap, type, block);
  form.appendChild(fieldsWrap);

  typeSelect.addEventListener("change", () => {
    const currentValues = readCurrentFormValues(form);
    const newType = typeSelect.value;
    const merged = { ...defaultBlockForType(newType), ...currentValues, type: newType };
    populateModalFieldsContainer(fieldsWrap, newType, merged);
  });

  modalBody.appendChild(form);
  return form;
}

function showModalBackdrop(backdrop) {
  backdrop.hidden = false;
  backdrop.classList.add("content-edit-modal-backdrop--open");
}

function hideModalBackdrop(backdrop) {
  backdrop.classList.remove("content-edit-modal-backdrop--open");
  backdrop.hidden = true;
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
    throw new Error(`Edit mode is only available for content pages (about, blog/<slug>). Got: ${treePath}`);
  }

  const pageData = await window.generateContentBody.loadContentPageJson(treePath);
  const blockCtx = await window.generateContentBody.buildBlockRenderContext();
  blockCtx.lenient = true;

  window.__contentEditorState = {
    pagePath: treePath,
    pageData: JSON.parse(JSON.stringify(pageData)),
    blockCtx,
    modalIndex: null,
    eventsBound: false,
  };

  const [shopData, navigationConfig, productData] = await Promise.all([
    window.generateAnyPage.fetchJson("../../shared-assets/config/shopData.json"),
    window.generateAnyPage.fetchJson("../../shared-assets/config/navigation.json"),
    window.productData.fetchProductDataJson(),
  ]);
  const products = Array.isArray(productData?.products) ? productData.products : [];
  const previewParams = window.previewTarget.parsePreviewTarget(window.location.search);
  const digitalFilter = previewParams?.digital ?? null;
  const productsForShop = window.productData.filterProductsByDigital(products, digitalFilter);

  const bodyPayload = await buildEditBodyPayload(window.__contentEditorState.pageData, {
    shopData,
    products: productsForShop,
    blockCtx,
  });

  const headerFooter = await window.generateHeaderAndFooter.generateHeaderAndFooter(
    shopData,
    navigationConfig,
    { categoryNames: bodyPayload.categoryNames },
  );

  await mountEditPageInPlace(treePath, bodyPayload, headerFooter);
}

window.contentEditor = {
  bootEditPage,
  initEditorUi,
  bindEditorEvents,
  handleBlockAction,
  openModal,
  isEditableContentPath,
};
