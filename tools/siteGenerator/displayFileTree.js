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

/** Safe folder name for the page (matches previous single-file basename, without `.html`). */
function treePathToDownloadFolderName(treePath) {
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
  zip.folder(folderName).file("index.html", html);
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${folderName}.zip`;
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

function appendPreviewPageRow(container, { label, treeHref, nested = false }) {
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
  row.appendChild(createDownloadButton(href, label));
  container.appendChild(row);
}

async function buildPopulatedFileTree(digitalFilter) {
  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  const filter = parseDigitalFilterValue(digitalFilter);
  const categoryData = window.productData.getCategoriesForFileTree(products, filter);
  return populateFileTree(fileTreeConfig, categoryData);
}

function renderNodeAsDropdown(container, node) {
  const labelLower = String(node?.label || "").trim().toLowerCase();

  if (labelLower === "cart") {
    const treeHref = String(node.href || "cart").trim();
    appendPreviewPageRow(container, { label: node.label || "Cart", treeHref });
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
      renderNodeAsDropdown(body, child);
    });
    details.appendChild(body);
    container.appendChild(details);
    return;
  }

  if (node.pageType === "category") {
    const treeHref = String(node.href || "").trim();
    if (!treeHref) {
      throw new Error("Category node missing href for preview link.");
    }
    appendPreviewPageRow(container, { label: node.label || "Category", treeHref });
    (node.children || []).forEach((product) => {
      const productHref = String(product.href || "").trim();
      if (!productHref) {
        throw new Error("Product node missing href for preview link.");
      }
      appendPreviewPageRow(container, {
        label: product.label || "Product",
        treeHref: productHref,
        nested: true,
      });
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
  const { containerId = "preview-picker-root", filterSelectId = "preview-digital-filter" } = options;
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Preview picker container not found: #${containerId}`);
  }

  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);

  const filterSelect = document.getElementById(filterSelectId);
  let lastPopulatedTree = null;
  const applyFilterFromUi = () => {
    const raw = filterSelect ? filterSelect.value : "all";
    const filter = parseDigitalFilterValue(raw === "all" ? null : raw);
    const categoryData = window.productData.getCategoriesForFileTree(products, filter);
    lastPopulatedTree = populateFileTree(fileTreeConfig, categoryData);
    renderPreviewPicker(container, lastPopulatedTree);
  };

  if (filterSelect) {
    filterSelect.addEventListener("change", applyFilterFromUi);
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
