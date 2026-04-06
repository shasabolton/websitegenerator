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

/**
 * Stable URL segment per product row within its category (for `shop/<cat>/<product>`).
 * @param {object[]} products
 * @returns {Map<object, string>}
 */
function assignProductSlugsByCategory(products) {
  const list = Array.isArray(products) ? products : [];
  const byCat = new Map();
  for (const row of list) {
    const categoryName = String(row.CATEGORY || "").trim();
    if (!categoryName) {
      continue;
    }
    const key = categoryName.toLowerCase();
    if (!byCat.has(key)) {
      byCat.set(key, []);
    }
    byCat.get(key).push(row);
  }

  const slugByRow = new Map();
  for (const [, rows] of byCat) {
    const taken = new Set();
    for (const row of rows) {
      const title = String(row.TITLE || "").trim() || "product";
      let s = slugify(title) || "product";
      if (!taken.has(s)) {
        taken.add(s);
        slugByRow.set(row, s);
        continue;
      }
      const sku = String(row.SKU || "").trim();
      if (sku) {
        const withSku = `${s}-${slugify(sku) || sku}`;
        if (!taken.has(withSku)) {
          taken.add(withSku);
          slugByRow.set(row, withSku);
          continue;
        }
      }
      let i = 2;
      let candidate = `${s}-${i}`;
      while (taken.has(candidate)) {
        i += 1;
        candidate = `${s}-${i}`;
      }
      taken.add(candidate);
      slugByRow.set(row, candidate);
    }
  }
  return slugByRow;
}

/**
 * @param {object} row
 * @param {object[]} products
 */
function getProductSlugForRow(row, products) {
  return assignProductSlugsByCategory(products).get(row) || slugify(String(row.TITLE || "").trim()) || "product";
}

/**
 * @param {object[]} products
 * @param {string} categorySlug
 * @param {string} productSlug
 * @returns {object | null}
 */
function findProductByShopPath(products, categorySlug, productSlug) {
  const list = Array.isArray(products) ? products : [];
  const catKey = String(categorySlug || "").trim().toLowerCase();
  const prodKey = String(productSlug || "").trim().toLowerCase();
  if (!catKey || !prodKey) {
    return null;
  }
  const slugByRow = assignProductSlugsByCategory(list);
  for (const row of list) {
    const categoryName = String(row.CATEGORY || "").trim();
    if (!categoryName || slugify(categoryName) !== catKey) {
      continue;
    }
    const seg = slugByRow.get(row);
    if (seg && String(seg).toLowerCase() === prodKey) {
      return row;
    }
  }
  return null;
}

const IMAGE_COLUMN_KEYS = [
  "IMAGE1",
  "IMAGE2",
  "IMAGE3",
  "IMAGE4",
  "IMAGE5",
  "IMAGE6",
  "IMAGE7",
  "IMAGE8",
  "IMAGE9",
  "IMAGE10",
];

/**
 * Non-empty product image URLs in display order.
 * @param {object} row
 * @returns {string[]}
 */
function collectProductImageUrls(row) {
  const out = [];
  for (const key of IMAGE_COLUMN_KEYS) {
    const u = String(row[key] || "").trim();
    if (u) {
      out.push(u);
    }
  }
  return out;
}

function getCategoriesForFileTree(products) {
  const list = Array.isArray(products) ? products : [];
  const slugByRow = assignProductSlugsByCategory(list);
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
        href: `shop/${slugify(categoryName)}`,
        products: [],
      });
    }
    const productTitle = String(row.TITLE || "").trim();
    const segment = slugByRow.get(row);
    if (productTitle && segment) {
      const catSlug = categories.get(key).slug;
      categories.get(key).products.push({
        label: productTitle,
        href: `shop/${catSlug}/${segment}`,
      });
    }
  }

  return Array.from(categories.values());
}

window.productData = {
  fetchProductDataJson,
  getProductsByCategory,
  getCategoriesForFileTree,
  assignProductSlugsByCategory,
  getProductSlugForRow,
  findProductByShopPath,
  collectProductImageUrls,
};
