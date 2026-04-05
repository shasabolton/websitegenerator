const PREVIEW_HTML_PATH = "./preview.html";

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${url} (${response.status})`);
  }
  return response.json();
}

function cloneTree(value) {
  return JSON.parse(JSON.stringify(value));
}

function populateFileTree(fileTreeConfig, categoryData) {
  const tree = cloneTree(fileTreeConfig);
  const items = Array.isArray(tree?.items) ? tree.items : [];
  const shopNode = items.find((item) => String(item?.label || "").trim().toLowerCase() === "shop");
  if (!shopNode) {
    return tree;
  }

  shopNode.href = "shop";
  if (!Array.isArray(shopNode.children)) {
    shopNode.children = [];
  }

  const categoriesNode = shopNode.children.find(
    (child) => String(child?.label || "").trim().toLowerCase() === "categories"
  );

  const categoryChildren = categoryData.map((category) => ({
    label: category.label,
    href: category.href,
    pageType: "category",
    category: category.label,
    children: Array.isArray(category.products) ? category.products : [],
  }));

  if (categoriesNode) {
    categoriesNode.children = categoryChildren;
  } else {
    shopNode.children.push({
      label: "Categories",
      href: "shop",
      children: categoryChildren,
    });
  }

  return tree;
}

async function buildPopulatedFileTree() {
  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  const categoryData = window.productData.getCategoriesForFileTree(products);
  return populateFileTree(fileTreeConfig, categoryData);
}

function parsePreviewTarget(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const page = params.get("page");
  const category = params.get("category");
  if (page === "category" && category) {
    return { type: "category", category: decodeURIComponent(category) };
  }
  return { type: "shop", category: null };
}

function buildPreviewUrl(target) {
  const base = PREVIEW_HTML_PATH;
  if (target?.type === "category" && target.category) {
    return `${base}?page=category&category=${encodeURIComponent(target.category)}`;
  }
  return `${base}?page=shop`;
}

function showPreviewBootError(error) {
  document.body.textContent = "";
  const wrap = document.createElement("div");
  wrap.style.cssText = "font-family:sans-serif;padding:1rem;max-width:40rem";
  const p = document.createElement("p");
  p.textContent = `Failed to build preview: ${error.message || String(error)}`;
  const nav = document.createElement("p");
  const a = document.createElement("a");
  a.href = "./index.html";
  a.textContent = "Back to product data";
  nav.appendChild(a);
  wrap.appendChild(p);
  wrap.appendChild(nav);
  document.body.appendChild(wrap);
}

async function runPreviewPage() {
  try {
    const target = parsePreviewTarget(window.location.search);
    const html =
      target.type === "category"
        ? await window.generateCategory.generateCategoryHtml(target.category)
        : await window.generateShop.generateShopHtml();
    document.open();
    document.write(html);
    document.close();
  } catch (error) {
    showPreviewBootError(error);
  }
}

function renderNodeAsDropdown(container, node) {
  const labelLower = String(node?.label || "").trim().toLowerCase();

  if (labelLower === "shop") {
    const details = document.createElement("details");
    details.className = "preview-picker-dropdown";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = node.label || "Shop";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "preview-picker-dropdown-body";
    const shopRow = document.createElement("div");
    shopRow.className = "preview-picker-row";
    const shopLink = document.createElement("a");
    shopLink.href = buildPreviewUrl({ type: "shop", category: null });
    shopLink.className = "preview-picker-page-link";
    shopLink.textContent = "Shop page";
    shopRow.appendChild(shopLink);
    body.appendChild(shopRow);
    (node.children || []).forEach((child) => {
      renderNodeAsDropdown(body, child);
    });
    details.appendChild(body);
    container.appendChild(details);
    return;
  }

  if (node.pageType === "category") {
    const row = document.createElement("div");
    row.className = "preview-picker-row";
    const pageLink = document.createElement("a");
    pageLink.href = buildPreviewUrl({
      type: "category",
      category: node.category || node.label || "",
    });
    pageLink.className = "preview-picker-page-link";
    pageLink.textContent = node.label || "Category";
    row.appendChild(pageLink);
    container.appendChild(row);
    (node.children || []).forEach((product) => {
      const meta = document.createElement("div");
      meta.className = "preview-picker-muted preview-picker-nested";
      meta.textContent = product.label || "";
      container.appendChild(meta);
    });
    return;
  }

  if (node.children && node.children.length > 0) {
    const details = document.createElement("details");
    details.className = "preview-picker-dropdown";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = node.label || "";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "preview-picker-dropdown-body";
    node.children.forEach((child) => {
      renderNodeAsDropdown(body, child);
    });
    details.appendChild(body);
    container.appendChild(details);
    return;
  }

  const muted = document.createElement("div");
  muted.className = "preview-picker-muted";
  const hrefPart = node.href ? ` (${node.href})` : "";
  muted.textContent = `${node.label || ""}${hrefPart} — no preview`;
  container.appendChild(muted);
}

function renderPreviewPicker(container, fileTree) {
  container.innerHTML = "";
  container.classList.add("preview-picker-root");
  const items = fileTree?.items || [];
  items.forEach((node) => {
    renderNodeAsDropdown(container, node);
  });
}

async function initPreviewPicker(options = {}) {
  const { containerId = "preview-picker-root" } = options;
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Preview picker container not found: #${containerId}`);
  }

  const populatedTree = await buildPopulatedFileTree();
  renderPreviewPicker(container, populatedTree);
  return populatedTree;
}

window.displayFileTree = {
  initPreviewPicker,
  buildPopulatedFileTree,
  renderPreviewPicker,
  parsePreviewTarget,
  buildPreviewUrl,
  runPreviewPage,
};
