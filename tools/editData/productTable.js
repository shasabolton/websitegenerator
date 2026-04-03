function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function generateProductTableHtml(columns, products) {
  if (!columns.length) {
    return "<p>No column definitions in product data.</p>";
  }

  if (!products.length) {
    return "<p>No product rows found.</p>";
  }

  const headerHtml = columns.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("");
  const rowsHtml = products
    .map((product) => {
      const cells = columns
        .map((col) => {
          const value = product[col] ?? "";
          const trimmed = String(value).trim();
          const cellClass = trimmed === "" ? "product-table-cell empty-cell" : "product-table-cell";
          const displayValue = trimmed === "" ? "—" : escapeHtml(value);
          return `<td><div class="${cellClass}">${displayValue}</div></td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="table-wrapper">
      <table class="product-table">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

async function renderProductTable(containerId = "product-table-root") {
  const root = document.getElementById(containerId);
  if (!root) {
    return;
  }

  root.innerHTML = "<p class=\"product-table-loading\">Loading…</p>";

  try {
    if (!window.productData?.fetchProductDataJson) {
      throw new Error("Product data loader is not available.");
    }
    const { columns, products } = await window.productData.fetchProductDataJson();
    root.innerHTML = generateProductTableHtml(columns, products);
  } catch (error) {
    root.innerHTML = `<p class="product-table-error">Failed to load product data: ${escapeHtml(error.message)}</p>`;
  }
}

window.productTable = {
  renderProductTable,
  generateProductTableHtml,
};
