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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function buildNavItemsHtml(navigation, shopData) {
  return asArray(navigation).map((item) => {
    const label = escapeHtml(item.label || "");
    if (item.key === "shop" && Array.isArray(shopData.shopFocus) && shopData.shopFocus.length > 0) {
      const categoryLinks = shopData.shopFocus
        .map((category) => {
          const categoryLabel = escapeHtml(category);
          const href = `#${slugify(category)}`;
          return `<li><a href="${href}">${categoryLabel}</a></li>`;
        })
        .join("");
      return `
        <li class="nav-item nav-item-has-children">
          <span>${label}</span>
          <ul class="submenu">
            ${categoryLinks}
          </ul>
        </li>
      `;
    }

    const href = escapeHtml(item.href || "#");
    return `<li class="nav-item"><a href="${href}">${label}</a></li>`;
  }).join("");
}

function renderTemplate(templateText, replacements) {
  return Object.entries(replacements).reduce((result, [key, value]) => {
    return result.replaceAll(`{{${key}}}`, value);
  }, templateText);
}

async function loadJson(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.json();
}

async function loadText(path) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}: ${response.status}`);
  }
  return response.text();
}

function generateCsvTableHtml(parsedRows) {
  if (parsedRows.length === 0) {
    return "<p>No CSV data found.</p>";
  }

  const headers = parsedRows[0];
  const dataRows = parsedRows.slice(1);
  if (dataRows.length === 0) {
    return "<p>No product rows found in CSV.</p>";
  }

  const headerHtml = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join("");
  const rowsHtml = dataRows
    .map((row) => {
      const cells = headers
        .map((_, columnIndex) => {
          const value = row[columnIndex] ?? "";
          const trimmed = value.trim();
          const cellClass = trimmed === "" ? "csv-cell empty-cell" : "csv-cell";
          const displayValue = trimmed === "" ? "—" : escapeHtml(value);
          return `<td><div class="${cellClass}">${displayValue}</div></td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <div class="table-wrapper">
      <table class="csv-table">
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

async function renderCsvTable() {
  const root = document.getElementById("csv-root");
  if (!root) {
    return;
  }

  try {
    const response = await fetch("./shop/config/product data.csv");
    if (!response.ok) {
      throw new Error(`CSV request failed with status ${response.status}`);
    }

    const csvText = await response.text();
    const parsedRows = parseCsv(csvText);
    root.innerHTML = generateCsvTableHtml(parsedRows);
  } catch (error) {
    root.innerHTML = `<p>Failed to load product data: ${escapeHtml(error.message)}</p>`;
  }
}

async function handleGenerateSiteClick() {
  const button = document.getElementById("generate-site-btn");
  const status = document.getElementById("generate-status");
  if (!button) {
    return;
  }

  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Opening Preview...";
  if (status) {
    status.classList.remove("error");
    status.textContent = "Generating homepage...";
  }

  try {
    const previewWindow = window.open("./preview.html", "_blank", "noopener");
    if (!previewWindow) {
      throw new Error("Preview popup was blocked by the browser.");
    }

    if (status) {
      status.textContent = "Preview opened in a new tab.";
    }
  } catch (error) {
    if (status) {
      status.classList.add("error");
      status.textContent = `Failed to generate homepage: ${error.message}`;
    }
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

window.addEventListener("load", () => {
  renderCsvTable();
  const button = document.getElementById("generate-site-btn");
  if (button) {
    button.addEventListener("click", handleGenerateSiteClick);
  }
});
