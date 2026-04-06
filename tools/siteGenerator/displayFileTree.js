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

function renderNodeAsDropdown(container, node) {
  const labelLower = String(node?.label || "").trim().toLowerCase();

  if (labelLower === "cart") {
    const row = document.createElement("div");
    row.className = "preview-picker-row";
    const cartLink = document.createElement("a");
    const treeHref = String(node.href || "cart").trim();
    cartLink.href = window.previewTarget.buildPreviewUrl(treeHref);
    cartLink.className = "preview-picker-page-link";
    cartLink.textContent = node.label || "Cart";
    row.appendChild(cartLink);
    container.appendChild(row);
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
    const shopRow = document.createElement("div");
    shopRow.className = "preview-picker-row";
    const shopLink = document.createElement("a");
    shopLink.href = window.previewTarget.buildPreviewUrl("shop");
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
    const treeHref = String(node.href || "").trim();
    if (!treeHref) {
      throw new Error("Category node missing href for preview link.");
    }
    pageLink.href = window.previewTarget.buildPreviewUrl(treeHref);
    pageLink.className = "preview-picker-page-link";
    pageLink.textContent = node.label || "Category";
    row.appendChild(pageLink);
    container.appendChild(row);
    (node.children || []).forEach((product) => {
      const productRow = document.createElement("div");
      productRow.className = "preview-picker-row preview-picker-nested";
      const productLink = document.createElement("a");
      const productHref = String(product.href || "").trim();
      if (!productHref) {
        throw new Error("Product node missing href for preview link.");
      }
      productLink.href = window.previewTarget.buildPreviewUrl(productHref);
      productLink.className = "preview-picker-page-link";
      productLink.textContent = product.label || "Product";
      productRow.appendChild(productLink);
      container.appendChild(productRow);
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
  parsePreviewTarget: (search) => window.previewTarget.parsePreviewTarget(search),
  buildPreviewUrl: (treePath) => window.previewTarget.buildPreviewUrl(treePath),
};
