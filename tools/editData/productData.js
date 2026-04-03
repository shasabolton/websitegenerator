const PRODUCT_DATA_JSON_URL = "../../shared-assets/config/productData.json";

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function fetchProductDataJson() {
  const response = await fetch(PRODUCT_DATA_JSON_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load product data: ${PRODUCT_DATA_JSON_URL} (${response.status})`);
  }
  const data = await response.json();
  const products = Array.isArray(data?.products) ? data.products : [];
  const columns = Array.isArray(data?.columns) ? data.columns : [];
  return { version: data?.version, columns, products };
}

function getProductsByCategory(products) {
  const list = Array.isArray(products) ? products : [];
  const categories = new Map();

  for (const row of list) {
    const category = String(row.CATEGORY || "").trim();
    if (!category) {
      continue;
    }
    const key = category.toLowerCase();
    if (!categories.has(key)) {
      categories.set(key, {
        name: category,
        slug: slugify(category),
        products: [],
      });
    }
    const title = String(row.TITLE || "Untitled Product").trim() || "Untitled Product";
    const image = String(row.IMAGE1 || "").trim();
    categories.get(key).products.push({ title, image });
  }

  return Array.from(categories.values());
}

function getCategoriesForFileTree(products) {
  const list = Array.isArray(products) ? products : [];
  const categories = new Map();

  for (const row of list) {
    const categoryName = String(row.CATEGORY || "").trim();
    if (!categoryName) {
      continue;
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
    const productTitle = String(row.TITLE || "").trim();
    if (productTitle) {
      categories.get(key).products.push({
        label: productTitle,
        href: "#",
      });
    }
  }

  return Array.from(categories.values());
}

window.productData = {
  fetchProductDataJson,
  getProductsByCategory,
  getCategoriesForFileTree,
};
