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
    const response = await fetch("./product%20data.csv");
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

window.addEventListener("load", renderCsvTable);
