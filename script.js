function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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

function getImageUrls(productRow) {
  const imageKeys = Object.keys(productRow)
    .filter((key) => /^IMAGE\d+$/.test(key))
    .sort((a, b) => Number(a.replace("IMAGE", "")) - Number(b.replace("IMAGE", "")));

  return imageKeys.map((key) => productRow[key]).filter((url) => typeof url === "string" && url.trim() !== "");
}

function generateProductHtml(productRow) {
  const title = escapeHtml(productRow.TITLE || "Untitled Product");
  const description = escapeHtml(productRow.DESCRIPTION || "");
  const imageUrls = getImageUrls(productRow);

  const imagesHtml =
    imageUrls.length === 0
      ? ""
      : `<div class="product-images">${imageUrls
          .map((url, index) => `<img src="${escapeHtml(url)}" alt="${title} image ${index + 1}" loading="lazy" />`)
          .join("")}</div>`;

  return `
    <article class="product">
      <h1>${title}</h1>
      <p class="product-description">${description}</p>
      ${imagesHtml}
    </article>
  `;
}

function toObjects(csvText) {
  const parsed = parseCsv(csvText);
  if (parsed.length < 2) {
    return [];
  }

  const headers = parsed[0];
  return parsed.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] ?? "";
    });
    return record;
  });
}

async function renderFirstProduct() {
  const root = document.getElementById("product-root");
  if (!root) {
    return;
  }

  try {
    const response = await fetch("./product%20data.csv");
    if (!response.ok) {
      throw new Error(`CSV request failed with status ${response.status}`);
    }

    const csvText = await response.text();
    const products = toObjects(csvText);

    if (products.length === 0) {
      root.innerHTML = "<p>No products found in CSV.</p>";
      return;
    }

    root.innerHTML = generateProductHtml(products[0]);
  } catch (error) {
    root.innerHTML = `<p>Failed to load product data: ${escapeHtml(error.message)}</p>`;
  }
}

window.addEventListener("load", renderFirstProduct);
