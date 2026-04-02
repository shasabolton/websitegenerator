function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load file: ${url} (${response.status})`);
  }
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        field += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function getCategoriesFromCsv(csvText) {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  const categoryIndex = headers.findIndex((header) => header.trim().toUpperCase() === "CATEGORY");
  const titleIndex = headers.findIndex((header) => header.trim().toUpperCase() === "TITLE");
  if (categoryIndex === -1) {
    return [];
  }

  const categories = new Map();
  rows.slice(1).forEach((row) => {
    const categoryName = (row[categoryIndex] || "").trim();
    if (!categoryName) {
      return;
    }
    const key = categoryName.toLowerCase();
    if (!categories.has(key)) {
      categories.set(key, {
        label: categoryName,
        slug: slugify(categoryName),
        href: `/shop/${slugify(categoryName)}`,
        products: [],
      });
    }
    const productTitle = (row[titleIndex] || "").trim();
    if (productTitle) {
      categories.get(key).products.push({
        label: productTitle,
        href: "#",
      });
    }
  });

  return Array.from(categories.values());
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

  shopNode.href = "/shop";
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
      href: "/shop",
      children: categoryChildren,
    });
  }

  return tree;
}

function createNodeElement(node, onSelect) {
  const listItem = document.createElement("li");
  listItem.className = "file-tree-item";
  const label = document.createElement("button");
  label.type = "button";
  label.className = "file-tree-node";
  label.textContent = `${node.label}${node.href ? ` (${node.href})` : ""}`;
  label.dataset.href = node.href || "";

  if (node.pageType === "category") {
    label.dataset.pageType = "category";
    label.dataset.category = node.category || node.label || "";
    label.classList.add("is-category-node");
    label.addEventListener("click", async () => {
      await onSelect({
        type: "category",
        category: node.category || node.label || "",
      });
    });
  } else if (node.href === "/shop") {
    label.dataset.pageType = "shop";
    label.classList.add("is-shop-node");
    label.addEventListener("click", async () => {
      await onSelect({ type: "shop", category: null });
    });
  } else {
    label.disabled = true;
  }

  listItem.appendChild(label);

  if (Array.isArray(node.children) && node.children.length > 0) {
    const childList = document.createElement("ul");
    childList.className = "file-tree-list";
    node.children.forEach((childNode) => {
      childList.appendChild(createNodeElement(childNode, onSelect));
    });
    listItem.appendChild(childList);
  }

  return listItem;
}

async function buildPopulatedFileTree() {
  const [fileTreeConfig, csvText] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    fetchText("../../shared-assets/config/product data.csv"),
  ]);
  const categoryData = getCategoriesFromCsv(csvText);
  return populateFileTree(fileTreeConfig, categoryData);
}

function renderTree(root, fileTree, onSelect) {
  root.innerHTML = "";
  const list = document.createElement("ul");
  list.className = "file-tree-list";
  const items = Array.isArray(fileTree?.items) ? fileTree.items : [];
  items.forEach((node) => {
    list.appendChild(createNodeElement(node, onSelect));
  });
  root.appendChild(list);
}

async function initDisplayFileTree(options = {}) {
  const { containerId = "file-tree-root", onSelect } = options;
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`File tree container not found: #${containerId}`);
  }
  if (typeof onSelect !== "function") {
    throw new Error("File tree onSelect callback is required.");
  }

  const populatedTree = await buildPopulatedFileTree();
  renderTree(container, populatedTree, onSelect);
  return populatedTree;
}

window.displayFileTree = {
  initDisplayFileTree,
  buildPopulatedFileTree,
};
