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

function buildFlatShopChildren(categoryData) {
  const flatChildren = [];
  for (const category of categoryData) {
    const categorySlug = String(category.slug || "").trim();
    flatChildren.push({
      label: category.label,
      href: category.href,
      pageType: "category",
      category: category.label,
      categorySlug,
    });
    const products = Array.isArray(category.products) ? category.products : [];
    for (const product of products) {
      flatChildren.push({
        label: product.label,
        href: product.href,
        pageType: "product",
        category: category.label,
        categorySlug,
      });
    }
  }
  return flatChildren;
}

function populateFileTree(fileTreeConfig, categoryData, categoryFilter = null) {
  const tree = cloneTree(fileTreeConfig);
  const items = Array.isArray(tree?.items) ? tree.items : [];
  const shopNode = items.find((item) => String(item?.label || "").trim().toLowerCase() === "shop");
  if (!shopNode) {
    return tree;
  }

  shopNode.href = "shop";
  let flatChildren = buildFlatShopChildren(categoryData);
  const activeCategory = String(categoryFilter || "").trim();
  if (activeCategory && activeCategory !== "all") {
    flatChildren = flatChildren.filter((child) => child.categorySlug === activeCategory);
  }
  shopNode.children = flatChildren;

  return tree;
}

function parseDigitalFilterValue(raw) {
  if (raw === true || raw === false) {
    return raw;
  }
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "true" || s === "digital") {
    return true;
  }
  if (s === "false" || s === "physical") {
    return false;
  }
  return null;
}

function getActiveDigitalFilterForPreviewLinks() {
  const sel = document.getElementById("preview-digital-filter");
  if (!sel) return null;
  const raw = String(sel.value || "").trim();
  if (raw === "all" || raw === "") {
    return null;
  }
  return parseDigitalFilterValue(raw);
}

function getActiveCategoryFilter() {
  const sel = document.getElementById("preview-category-filter");
  if (!sel) return null;
  const raw = String(sel.value || "").trim();
  if (raw === "all" || raw === "") {
    return null;
  }
  return raw;
}

function syncCategoryFilterOptions(categorySelect, categoryData, preserveValue) {
  if (!categorySelect) {
    return;
  }
  const previous = preserveValue ? String(categorySelect.value || "").trim() : "all";
  categorySelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All categories";
  categorySelect.appendChild(allOption);
  for (const category of categoryData) {
    const slug = String(category.slug || "").trim();
    if (!slug) {
      continue;
    }
    const option = document.createElement("option");
    option.value = slug;
    option.textContent = String(category.label || slug).trim() || slug;
    categorySelect.appendChild(option);
  }
  const stillValid =
    previous === "all" || categoryData.some((category) => String(category.slug || "").trim() === previous);
  categorySelect.value = stillValid ? previous : "all";
}

let cachedHomePageHref = null;

/** Safe folder name for the page (matches previous single-file basename, without `.html`). */
function treePathToDownloadFolderName(treePath, homePageHref = cachedHomePageHref) {
  if (window.homePage?.resolveDeployFolder) {
    const deployFolder = window.homePage.resolveDeployFolder(treePath, homePageHref);
    if (!deployFolder) {
      return "";
    }
    const safe = deployFolder.replace(/[\\/:*?"<>|]+/g, "-") || "page";
    return safe;
  }
  const p = String(treePath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!p) {
    return "page";
  }
  const base = p.split("/").filter(Boolean).join("-");
  const safe = base.replace(/[\\/:*?"<>|]+/g, "-") || "page";
  return safe;
}

/**
 * Browsers cannot save a directory in one step; we download a zip that unpacks to `folderName/index.html`.
 */
async function downloadPageFolderAsZip(folderName, html) {
  if (typeof window.JSZip !== "function") {
    throw new Error("JSZip is not loaded (expected ./vendor/jszip.min.js).");
  }
  const zip = new window.JSZip();
  if (folderName) {
    zip.folder(folderName).file("index.html", html);
  } else {
    zip.file("index.html", html);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = folderName ? `${folderName}.zip` : "index.zip";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function createDownloadButton(treeHref, pageLabel) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-picker-download";
  btn.textContent = "Download";
  const nameHint = String(pageLabel || treeHref || "page").trim() || "page";
  btn.setAttribute("aria-label", `Download zip with folder and index.html for ${nameHint}`);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (typeof window.loadPreviewGenerators === "function") {
        await window.loadPreviewGenerators();
      }
      if (typeof window.generateAnyPage?.generateAnyPage !== "function") {
        throw new Error("Page generators are not available.");
      }
      const digital = getActiveDigitalFilterForPreviewLinks();
      const html = await window.generateAnyPage.generateAnyPage(treeHref, { digital });
      await downloadPageFolderAsZip(treePathToDownloadFolderName(treeHref), html);
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function isContentEditablePath(treeHref) {
  const path = String(treeHref || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
  if (path === "about") {
    return true;
  }
  return path.startsWith("blog/") && path.length > "blog/".length;
}

function appendPreviewPageRow(container, { label, treeHref, nested = false, productEdit = false }) {
  const row = document.createElement("div");
  row.className = nested ? "preview-picker-row preview-picker-nested" : "preview-picker-row";
  const pageLink = document.createElement("a");
  const href = String(treeHref || "").trim();
  if (!href) {
    throw new Error("appendPreviewPageRow: missing treeHref.");
  }
  pageLink.href = window.previewTarget.buildPreviewUrl(href, getActiveDigitalFilterForPreviewLinks());
  pageLink.className = "preview-picker-page-link";
  pageLink.textContent = label;
  row.appendChild(pageLink);
  if (isContentEditablePath(href) || productEdit) {
    const editLink = document.createElement("a");
    editLink.href = window.previewTarget.buildEditUrl(href, getActiveDigitalFilterForPreviewLinks());
    editLink.className = "preview-picker-edit-link";
    editLink.textContent = "Edit";
    row.appendChild(editLink);
  }
  row.appendChild(createDownloadButton(href, label));
  container.appendChild(row);
}

function rememberHomePageHref(fileTreeConfig) {
  cachedHomePageHref = window.homePage?.getHomePageHref
    ? window.homePage.getHomePageHref(fileTreeConfig)
    : null;
  return cachedHomePageHref;
}

async function buildPopulatedFileTree(digitalFilter, categoryFilter = null) {
  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  rememberHomePageHref(fileTreeConfig);
  const filter = parseDigitalFilterValue(digitalFilter);
  const categoryData = window.productData.getCategoriesForFileTree(products, filter);
  return populateFileTree(fileTreeConfig, categoryData, categoryFilter);
}

function renderNodeAsDropdown(container, node) {
  const labelLower = String(node?.label || "").trim().toLowerCase();

  if (labelLower === "cart") {
    const treeHref = String(node.href || "cart").trim();
    appendPreviewPageRow(container, { label: node.label || "Cart", treeHref });
    return;
  }

  if (labelLower === "blog") {
    const details = document.createElement("details");
    details.className = "preview-picker-dropdown";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = node.label || "Blog";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "preview-picker-dropdown-body";
    appendPreviewPageRow(body, { label: "Blog index", treeHref: "blog" });
    (node.children || []).forEach((child) => {
      const childHref = String(child.href || "").trim();
      if (!childHref) {
        return;
      }
      appendPreviewPageRow(body, {
        label: child.label || "Post",
        treeHref: childHref,
        nested: true,
      });
    });
    details.appendChild(body);
    container.appendChild(details);
    return;
  }

  if (labelLower === "shop") {
    const details = document.createElement("details");
    details.className = "preview-picker-dropdown";
    details.open = true;
    const summary = document.createElement("summary");
    summary.textContent = node.label || "Shop";
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "preview-picker-dropdown-body";
    appendPreviewPageRow(body, { label: "Shop page", treeHref: "shop" });
    (node.children || []).forEach((child) => {
      const treeHref = String(child.href || "").trim();
      if (!treeHref) {
        return;
      }
      const pageType = String(child.pageType || "").trim().toLowerCase();
      appendPreviewPageRow(body, {
        label: child.label || (pageType === "category" ? "Category" : "Product"),
        treeHref,
        nested: true,
        productEdit: pageType === "product",
      });
    });
    details.appendChild(body);
    container.appendChild(details);
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

  const treeHref = String(node.href || "").trim();
  if (treeHref && !treeHref.startsWith("#")) {
    appendPreviewPageRow(container, { label: node.label || "Page", treeHref });
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
  const {
    containerId = "preview-picker-root",
    filterSelectId = "preview-digital-filter",
    categoryFilterSelectId = "preview-category-filter",
  } = options;
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Preview picker container not found: #${containerId}`);
  }

  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  rememberHomePageHref(fileTreeConfig);

  const filterSelect = document.getElementById(filterSelectId);
  const categorySelect = document.getElementById(categoryFilterSelectId);
  let lastPopulatedTree = null;
  const applyFilterFromUi = () => {
    const raw = filterSelect ? filterSelect.value : "all";
    const filter = parseDigitalFilterValue(raw === "all" ? null : raw);
    const categoryData = window.productData.getCategoriesForFileTree(products, filter);
    syncCategoryFilterOptions(categorySelect, categoryData, true);
    const categoryFilter = getActiveCategoryFilter();
    lastPopulatedTree = populateFileTree(fileTreeConfig, categoryData, categoryFilter);
    renderPreviewPicker(container, lastPopulatedTree);
  };

  if (filterSelect) {
    filterSelect.addEventListener("change", applyFilterFromUi);
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", applyFilterFromUi);
  }

  applyFilterFromUi();
  return lastPopulatedTree;
}

window.displayFileTree = {
  initPreviewPicker,
  buildPopulatedFileTree,
  renderPreviewPicker,
  parsePreviewTarget: (search) => window.previewTarget.parsePreviewTarget(search),
  buildPreviewUrl: (treePath) =>
    window.previewTarget.buildPreviewUrl(treePath, getActiveDigitalFilterForPreviewLinks()),
};
