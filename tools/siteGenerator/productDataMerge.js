(function initProductDataMerge() {
  const BOOLEAN_COLUMNS = new Set(["DIGITAL", "HIDE", "HIDE INSTRUCTIONS"]);
  const IMAGE_COLUMN_PREFIX = "IMAGE";

  /** @type {{
   *   jsonRoot: object | null,
   *   diffResult: object | null,
   *   selected: Set<string>,
   *   activeTab: string,
   *   hideImageColumns: boolean,
   *   onlyColumnsInCsv: boolean,
   *   selectedNewSkus: Set<string>,
   *   detailKey: string | null,
   * }} */
  const state = {
    jsonRoot: null,
    diffResult: null,
    selected: new Set(),
    selectedNewSkus: new Set(),
    activeTab: "property",
    hideImageColumns: false,
    onlyColumnsInCsv: true,
    detailKey: null,
  };

  function defaultProductCategory() {
    return window.productData?.DEFAULT_PRODUCT_CATEGORY || "Other";
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  const KEY_SEP = "::";

  function selectionKey(sku, column) {
    return `${encodeURIComponent(String(sku).trim())}${KEY_SEP}${encodeURIComponent(String(column).trim())}`;
  }

  function parseSelectionKey(key) {
    const raw = String(key ?? "");
    const idx = raw.indexOf(KEY_SEP);
    if (idx < 0) {
      return { sku: decodeURIComponent(raw), column: "" };
    }
    return {
      sku: decodeURIComponent(raw.slice(0, idx)),
      column: decodeURIComponent(raw.slice(idx + KEY_SEP.length)),
    };
  }

  function eventTargetElement(event) {
    const target = event.target;
    if (target instanceof Element) {
      return target;
    }
    if (target && target.parentElement instanceof Element) {
      return target.parentElement;
    }
    return null;
  }

  function trimCell(value) {
    if (value == null) {
      return "";
    }
    return String(value).trim();
  }

  function readBooleanField(value) {
    if (value === true) {
      return true;
    }
    if (value === false) {
      return false;
    }
    const s = trimCell(value).toLowerCase();
    if (s === "true" || s === "1" || s === "yes") {
      return true;
    }
    if (s === "false" || s === "0" || s === "no") {
      return false;
    }
    return false;
  }

  function normalizeForCompare(column, value) {
    if (BOOLEAN_COLUMNS.has(column)) {
      return readBooleanField(value) ? "true" : "false";
    }
    return trimCell(value);
  }

  function csvValueToJson(column, rawValue) {
    if (BOOLEAN_COLUMNS.has(column)) {
      return readBooleanField(rawValue);
    }
    return trimCell(rawValue);
  }

  function isImageColumn(column) {
    return String(column).toUpperCase().startsWith(IMAGE_COLUMN_PREFIX);
  }

  function truncatePreview(value, max = 48) {
    const text = trimCell(value);
    if (text.length <= max) {
      return text || "—";
    }
    return `${text.slice(0, max - 1)}…`;
  }

  function parseCsv(text) {
    const input = String(text || "").replace(/^\uFEFF/, "");
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i];
      const next = input[i + 1];
      if (inQuotes) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ",") {
        row.push(cell);
        cell = "";
      } else if (ch === "\r") {
        /* skip */
      } else if (ch === "\n") {
        row.push(cell);
        cell = "";
        if (row.some((part) => trimCell(part) !== "")) {
          rows.push(row);
        }
        row = [];
      } else {
        cell += ch;
      }
    }

    if (cell.length || row.length) {
      row.push(cell);
      if (row.some((part) => trimCell(part) !== "")) {
        rows.push(row);
      }
    }

    if (!rows.length) {
      return { headers: [], records: [] };
    }

    const headers = rows[0].map((h) => trimCell(h));
    const records = [];
    for (let r = 1; r < rows.length; r += 1) {
      const line = rows[r];
      const record = {};
      for (let c = 0; c < headers.length; c += 1) {
        const header = headers[c];
        if (!header) {
          continue;
        }
        record[header] = line[c] ?? "";
      }
      records.push(record);
    }
    return { headers, records };
  }

  function indexProductsBySku(products) {
    const map = new Map();
    for (const row of Array.isArray(products) ? products : []) {
      const sku = trimCell(row?.SKU);
      if (sku) {
        map.set(sku, row);
      }
    }
    return map;
  }

  function computeDiff(jsonRoot, csvRecords, csvHeaders) {
    const jsonColumns = Array.isArray(jsonRoot?.columns) ? jsonRoot.columns.slice() : [];
    const jsonProducts = Array.isArray(jsonRoot?.products) ? jsonRoot.products : [];
    const jsonBySku = indexProductsBySku(jsonProducts);

    const csvBySku = new Map();
    for (const row of csvRecords) {
      const sku = trimCell(row.SKU);
      if (sku) {
        csvBySku.set(sku, row);
      }
    }

    const columnSet = new Set(jsonColumns);
    for (const header of csvHeaders) {
      if (header) {
        columnSet.add(header);
      }
    }
    columnSet.delete("SKU");
    const columns = Array.from(columnSet);

    const diffs = [];
    const matchedSkus = [];
    for (const sku of csvBySku.keys()) {
      if (!jsonBySku.has(sku)) {
        continue;
      }
      matchedSkus.push(sku);
      const jsonRow = jsonBySku.get(sku);
      const csvRow = csvBySku.get(sku);
      for (const column of columns) {
        const jsonRaw = jsonRow[column];
        const csvRaw = csvRow[column];
        const jsonNorm = normalizeForCompare(column, jsonRaw);
        const csvNorm = normalizeForCompare(column, csvRaw);
        if (jsonNorm !== csvNorm) {
          diffs.push({
            sku,
            column,
            jsonRaw,
            csvRaw,
            title: trimCell(jsonRow.TITLE) || trimCell(csvRow.TITLE) || sku,
          });
        }
      }
    }

    const onlyInCsv = [];
    for (const sku of csvBySku.keys()) {
      if (!jsonBySku.has(sku)) {
        onlyInCsv.push({
          sku,
          title: trimCell(csvBySku.get(sku)?.TITLE) || sku,
        });
      }
    }

    const onlyInJson = [];
    for (const sku of jsonBySku.keys()) {
      if (!csvBySku.has(sku)) {
        onlyInJson.push({
          sku,
          title: trimCell(jsonBySku.get(sku)?.TITLE) || sku,
        });
      }
    }

    return {
      diffs,
      columns,
      jsonColumns,
      csvHeaders: csvHeaders.filter((h) => trimCell(h)),
      matchedSkus,
      onlyInCsv,
      onlyInJson,
      jsonBySku,
      csvBySku,
    };
  }

  function getCsvColumnSet() {
    const headers = state.diffResult?.csvHeaders;
    if (!Array.isArray(headers)) {
      return new Set();
    }
    const set = new Set();
    for (const header of headers) {
      const name = trimCell(header);
      if (name && name !== "SKU") {
        set.add(name);
      }
    }
    return set;
  }

  function filterDiffs(diffs) {
    let result = diffs;
    if (state.onlyColumnsInCsv) {
      const csvColumns = getCsvColumnSet();
      if (csvColumns.size) {
        result = result.filter((d) => csvColumns.has(d.column));
      }
    }
    if (state.hideImageColumns) {
      result = result.filter((d) => !isImageColumn(d.column));
    }
    return result;
  }

  function getVisibleDiffs() {
    return filterDiffs(state.diffResult?.diffs || []);
  }

  function groupDiffsByProperty(diffs) {
    const groups = new Map();
    for (const diff of diffs) {
      if (!groups.has(diff.column)) {
        groups.set(diff.column, []);
      }
      groups.get(diff.column).push(diff);
    }
    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }

  function groupDiffsByProduct(diffs) {
    const groups = new Map();
    for (const diff of diffs) {
      if (!groups.has(diff.sku)) {
        groups.set(diff.sku, { title: diff.title, items: [] });
      }
      groups.get(diff.sku).items.push(diff);
    }
    return Array.from(groups.entries()).sort((a, b) => a[1].title.localeCompare(b[1].title));
  }

  function getDiffByKey(key) {
    const { sku, column } = parseSelectionKey(key);
    return (state.diffResult?.diffs || []).find((d) => d.sku === sku && d.column === column) || null;
  }

  function isSelected(sku, column) {
    return state.selected.has(selectionKey(sku, column));
  }

  function setSelected(sku, column, on) {
    const key = selectionKey(sku, column);
    if (on) {
      state.selected.add(key);
    } else {
      state.selected.delete(key);
    }
  }

  function toggleDiffList(items, on) {
    for (const diff of items) {
      setSelected(diff.sku, diff.column, on);
    }
    renderBody();
    renderFooter();
  }

  function selectAllVisible(on) {
    state.selected.clear();
    if (on) {
      for (const diff of getVisibleDiffs()) {
        state.selected.add(selectionKey(diff.sku, diff.column));
      }
    }
    renderBody();
    renderFooter();
  }

  function buildPatches() {
    return Array.from(state.selected).map((key) => {
      const diff = getDiffByKey(key);
      if (!diff) {
        return null;
      }
      return {
        sku: diff.sku,
        column: diff.column,
        value: csvValueToJson(diff.column, diff.csvRaw),
      };
    }).filter(Boolean);
  }

  function csvRowToProductRow(csvRow, headers) {
    const row = {};
    const headerList = Array.isArray(headers) ? headers : [];
    for (const column of headerList) {
      if (!column || column === "SKU") {
        continue;
      }
      if (!Object.prototype.hasOwnProperty.call(csvRow, column)) {
        continue;
      }
      row[column] = csvValueToJson(column, csvRow[column]);
    }
    row.SKU = trimCell(csvRow.SKU);
    if (!trimCell(row.CATEGORY)) {
      row.CATEGORY = defaultProductCategory();
    }
    return row;
  }

  function buildNewProducts() {
    if (!state.diffResult?.csvBySku) {
      return [];
    }
    const headers = state.diffResult.csvHeaders || [];
    return Array.from(state.selectedNewSkus)
      .map((sku) => {
        const csvRow = state.diffResult.csvBySku.get(sku);
        if (!csvRow) {
          return null;
        }
        return csvRowToProductRow(csvRow, headers);
      })
      .filter(Boolean);
  }

  function isNewSkuSelected(sku) {
    return state.selectedNewSkus.has(trimCell(sku));
  }

  function setNewSkuSelected(sku, on) {
    const key = trimCell(sku);
    if (!key) {
      return;
    }
    if (on) {
      state.selectedNewSkus.add(key);
    } else {
      state.selectedNewSkus.delete(key);
    }
  }

  function toggleAllNewSkus(on) {
    const { onlyInCsv } = state.diffResult || {};
    state.selectedNewSkus.clear();
    if (on && Array.isArray(onlyInCsv)) {
      for (const entry of onlyInCsv) {
        if (trimCell(entry?.sku)) {
          state.selectedNewSkus.add(trimCell(entry.sku));
        }
      }
    }
    renderBody();
    renderFooter();
  }

  function hasMergeSelection() {
    return state.selected.size > 0 || state.selectedNewSkus.size > 0;
  }

  function renderSummaryEl(el) {
    if (!state.diffResult) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const diffs = getVisibleDiffs();
    const productSkus = new Set(diffs.map((d) => d.sku));
    const { onlyInCsv, onlyInJson, matchedSkus } = state.diffResult;
    const parts = [
      `<strong>${diffs.length}</strong> field difference${diffs.length === 1 ? "" : "s"}`,
      `across <strong>${productSkus.size}</strong> matched product${productSkus.size === 1 ? "" : "s"}`,
      `(${matchedSkus.length} SKU${matchedSkus.length === 1 ? "" : "s"} matched)`,
    ];
    let extra = "";
    if (onlyInCsv.length || onlyInJson.length) {
      el.classList.add("product-merge-summary--warn");
      const warnParts = [];
      if (onlyInCsv.length) {
        warnParts.push(`${onlyInCsv.length} new in CSV (import below)`);
      }
      if (onlyInJson.length) {
        warnParts.push(`${onlyInJson.length} only in JSON`);
      }
      extra = ` · ${warnParts.join(", ")}`;
    } else {
      el.classList.remove("product-merge-summary--warn");
    }
    el.innerHTML = `${parts.join(" ")}${escapeHtml(extra)}`;
  }

  function renderUnmatchedHtml() {
    if (!state.diffResult) {
      return "";
    }
    const { onlyInCsv, onlyInJson } = state.diffResult;
    if (!onlyInCsv.length && !onlyInJson.length) {
      return "";
    }

    let csvBlock = "";
    if (onlyInCsv.length) {
      const allNewSelected = onlyInCsv.every((row) => isNewSkuSelected(row.sku));
      const someNewSelected = onlyInCsv.some((row) => isNewSkuSelected(row.sku));
      const csvList = onlyInCsv
        .slice(0, 50)
        .map((row) => {
          const sku = trimCell(row.sku);
          const checked = isNewSkuSelected(sku) ? " checked" : "";
          const categoryHint = trimCell(state.diffResult?.csvBySku?.get(sku)?.CATEGORY)
            ? ""
            : ` <span class="product-merge-diff-preview">→ ${escapeHtml(defaultProductCategory())}</span>`;
          return `<li class="product-merge-diff-item">
<label><input type="checkbox" data-merge-new-sku="${escapeHtml(sku)}"${checked} aria-label="Import new product" /></label>
<div class="product-merge-diff-meta">
  <div class="product-merge-diff-title">${escapeHtml(row.title)}</div>
  <div class="product-merge-diff-preview">SKU ${escapeHtml(sku)}${categoryHint}</div>
</div>
</li>`;
        })
        .join("");
      const csvMore = onlyInCsv.length > 50 ? `<li>…and ${onlyInCsv.length - 50} more</li>` : "";
      csvBlock = `<section class="product-merge-group">
<div class="product-merge-group-header">
  <h3>New in CSV (${onlyInCsv.length})</h3>
  <label><input type="checkbox" data-merge-new-all${allNewSelected ? " checked" : ""}${someNewSelected && !allNewSelected ? ' data-indeterminate="true"' : ""} /> Import all new listings</label>
</div>
<ul class="product-merge-diff-list">${csvList}${csvMore}</ul>
<p class="product-merge-empty">Missing category becomes “${escapeHtml(defaultProductCategory())}”. Products need a title to appear in the file tree.</p>
</section>`;
    }

    const jsonList = onlyInJson
      .slice(0, 20)
      .map((row) => `<li>SKU ${escapeHtml(row.sku)} — ${escapeHtml(row.title)}</li>`)
      .join("");
    const jsonMore = onlyInJson.length > 20 ? `<li>…and ${onlyInJson.length - 20} more</li>` : "";

    return `<div class="product-merge-unmatched">
${csvBlock}
${onlyInJson.length ? `<div class="product-merge-unmatched-json"><h4>Only in JSON (${onlyInJson.length})</h4><ul>${jsonList}${jsonMore}</ul><p class="product-merge-empty">These listings were not in the CSV export.</p></div>` : ""}
</div>`;
  }

  function renderPropertyView(diffs) {
    if (!diffs.length) {
      return `<p class="product-merge-empty">No differences found between CSV and JSON.</p>`;
    }
    const groups = groupDiffsByProperty(diffs);
    return groups
      .map(([column, items]) => {
        const allSelected = items.every((d) => isSelected(d.sku, d.column));
        const someSelected = items.some((d) => isSelected(d.sku, d.column));
        const list = items
          .map((diff) => {
            const checked = isSelected(diff.sku, diff.column) ? " checked" : "";
            const key = selectionKey(diff.sku, diff.column);
            return `<li class="product-merge-diff-item">
<label><input type="checkbox" data-merge-select="${escapeHtml(key)}"${checked} aria-label="Include change" /></label>
<div class="product-merge-diff-meta">
  <div class="product-merge-diff-title">${escapeHtml(diff.title)} <span class="product-merge-diff-preview">(SKU ${escapeHtml(diff.sku)})</span></div>
  <div class="product-merge-diff-preview">${escapeHtml(truncatePreview(diff.jsonRaw))} → ${escapeHtml(truncatePreview(diff.csvRaw))}</div>
</div>
<div class="product-merge-diff-actions">
  <button type="button" class="product-merge-btn" data-merge-detail="${escapeHtml(key)}">Show difference</button>
</div>
</li>`;
          })
          .join("");
        return `<section class="product-merge-group">
<div class="product-merge-group-header">
  <h3>${escapeHtml(column)} <span class="product-merge-diff-preview">(${items.length})</span></h3>
  <label><input type="checkbox" data-merge-col-toggle="${escapeHtml(column)}"${allSelected ? " checked" : ""}${someSelected && !allSelected ? ' data-indeterminate="true"' : ""} /> Select all in column</label>
</div>
<ul class="product-merge-diff-list">${list}</ul>
</section>`;
      })
      .join("");
  }

  function renderProductView(diffs) {
    if (!diffs.length) {
      return `<p class="product-merge-empty">No differences found between CSV and JSON.</p>`;
    }
    const groups = groupDiffsByProduct(diffs);
    return groups
      .map(([sku, group]) => {
        const items = group.items;
        const allSelected = items.every((d) => isSelected(d.sku, d.column));
        const someSelected = items.some((d) => isSelected(d.sku, d.column));
        const list = items
          .map((diff) => {
            const checked = isSelected(diff.sku, diff.column) ? " checked" : "";
            const key = selectionKey(diff.sku, diff.column);
            return `<li class="product-merge-diff-item">
<label><input type="checkbox" data-merge-select="${escapeHtml(key)}"${checked} aria-label="Include change" /></label>
<div class="product-merge-diff-meta">
  <div class="product-merge-diff-title">${escapeHtml(diff.column)}</div>
  <div class="product-merge-diff-preview">${escapeHtml(truncatePreview(diff.jsonRaw))} → ${escapeHtml(truncatePreview(diff.csvRaw))}</div>
</div>
<div class="product-merge-diff-actions">
  <button type="button" class="product-merge-btn" data-merge-detail="${escapeHtml(key)}">Show difference</button>
</div>
</li>`;
          })
          .join("");
        return `<section class="product-merge-group">
<div class="product-merge-group-header">
  <h3>${escapeHtml(group.title)} <span class="product-merge-diff-preview">(SKU ${escapeHtml(sku)})</span></h3>
  <label><input type="checkbox" data-merge-row-toggle="${escapeHtml(sku)}"${allSelected ? " checked" : ""}${someSelected && !allSelected ? ' data-indeterminate="true"' : ""} /> Select all on listing</label>
</div>
<ul class="product-merge-diff-list">${list}</ul>
</section>`;
      })
      .join("");
  }

  function renderSpreadsheetView(diffs) {
    if (!diffs.length) {
      return `<p class="product-merge-empty">No differences found between CSV and JSON.</p>`;
    }

    const diffColumns = Array.from(new Set(diffs.map((d) => d.column))).sort((a, b) => a.localeCompare(b));
    const diffSkus = Array.from(new Set(diffs.map((d) => d.sku)));
    const titleBySku = new Map();
    for (const diff of diffs) {
      titleBySku.set(diff.sku, diff.title);
    }

    const diffLookup = new Map();
    for (const diff of diffs) {
      diffLookup.set(selectionKey(diff.sku, diff.column), diff);
    }

    const headerCells = diffColumns
      .map((column) => {
        const colDiffs = diffs.filter((d) => d.column === column);
        const allSelected = colDiffs.every((d) => isSelected(d.sku, d.column));
        const someSelected = colDiffs.some((d) => isSelected(d.sku, d.column));
        return `<th scope="col">
<div>${escapeHtml(column)}</div>
<label><input type="checkbox" data-merge-col-toggle="${escapeHtml(column)}"${allSelected ? " checked" : ""}${someSelected && !allSelected ? ' data-indeterminate="true"' : ""} /> All</label>
</th>`;
      })
      .join("");

    const bodyRows = diffSkus
      .map((sku) => {
        const rowDiffs = diffs.filter((d) => d.sku === sku);
        const allSelected = rowDiffs.every((d) => isSelected(d.sku, d.column));
        const someSelected = rowDiffs.some((d) => isSelected(d.sku, d.column));
        const cells = diffColumns
          .map((column) => {
            const key = selectionKey(sku, column);
            const diff = diffLookup.get(key);
            if (!diff) {
              return `<td class="product-merge-cell"></td>`;
            }
            const selected = isSelected(sku, column);
            const classes = ["product-merge-cell", "product-merge-cell--diff"];
            if (selected) {
              classes.push("product-merge-cell--selected");
            }
            return `<td class="${classes.join(" ")}" data-merge-detail="${escapeHtml(key)}" tabindex="0" role="button">
<span class="product-merge-cell-indicator" aria-hidden="true"></span>
<span class="product-merge-cell-preview">${escapeHtml(truncatePreview(diff.jsonRaw))} → ${escapeHtml(truncatePreview(diff.csvRaw))}</span>
<label><input type="checkbox" data-merge-select="${escapeHtml(key)}"${selected ? " checked" : ""} onclick="event.stopPropagation()" /> Merge</label>
</td>`;
          })
          .join("");
        return `<tr>
<th scope="row" class="product-merge-sticky-col">
<div>${escapeHtml(titleBySku.get(sku) || sku)}</div>
<div class="product-merge-diff-preview">SKU ${escapeHtml(sku)}</div>
<label><input type="checkbox" data-merge-row-toggle="${escapeHtml(sku)}"${allSelected ? " checked" : ""}${someSelected && !allSelected ? ' data-indeterminate="true"' : ""} /> All</label>
</th>
${cells}
</tr>`;
      })
      .join("");

    return `<div class="product-merge-table-wrap">
<table class="product-merge-table">
<thead><tr><th scope="col" class="product-merge-sticky-col">Listing</th>${headerCells}</tr></thead>
<tbody>${bodyRows}</tbody>
</table>
</div>`;
  }

  function applyIndeterminate(root) {
    root.querySelectorAll('input[data-indeterminate="true"]').forEach((input) => {
      input.indeterminate = true;
      input.removeAttribute("data-indeterminate");
    });
  }

  function renderBody() {
    const body = document.querySelector("[data-merge-body]");
    if (!body) {
      return;
    }
    if (!state.diffResult) {
      body.innerHTML = `<p class="product-merge-empty">Upload a CSV file to compare against the current productData.json.</p>`;
      return;
    }
    const diffs = getVisibleDiffs();
    let html = "";
    if (state.activeTab === "property") {
      html = renderPropertyView(diffs);
    } else if (state.activeTab === "product") {
      html = renderProductView(diffs);
    } else {
      html = renderSpreadsheetView(diffs);
    }
    html += renderUnmatchedHtml();
    body.innerHTML = html;
    applyIndeterminate(body);
  }

  function renderTabs() {
    document.querySelectorAll("[data-merge-tab]").forEach((btn) => {
      const tab = btn.getAttribute("data-merge-tab");
      btn.classList.toggle("product-merge-tab--active", tab === state.activeTab);
    });
  }

  function renderFooter() {
    const status = document.querySelector("[data-merge-footer-status]");
    const mergeBtn = document.querySelector("[data-merge-commit]");
    if (!status || !mergeBtn) {
      return;
    }
    const patchCount = state.selected.size;
    const newCount = state.selectedNewSkus.size;
    const parts = [];
    if (patchCount) {
      parts.push(`${patchCount} field change${patchCount === 1 ? "" : "s"}`);
    }
    if (newCount) {
      parts.push(`${newCount} new product${newCount === 1 ? "" : "s"}`);
    }
    status.textContent = parts.length
      ? `${parts.join(" and ")} selected for merge`
      : "Select field changes and/or new listings to merge into productData.json";
    status.classList.remove("product-merge-footer-status--error", "product-merge-footer-status--ok");
    mergeBtn.disabled = !hasMergeSelection() || !window.githubAuth?.isSignedIn?.();
    const previewBtn = document.querySelector("[data-merge-download-preview]");
    if (previewBtn) {
      previewBtn.disabled = !hasMergeSelection();
    }
  }

  function renderDetailModal() {
    const overlay = document.querySelector("[data-merge-detail-overlay]");
    const content = document.querySelector("[data-merge-detail-content]");
    if (!overlay || !content) {
      return;
    }
    if (!state.detailKey) {
      overlay.hidden = true;
      return;
    }
    const diff = getDiffByKey(state.detailKey);
    if (!diff) {
      overlay.hidden = true;
      return;
    }
    overlay.hidden = false;
    const selected = isSelected(diff.sku, diff.column);
    content.innerHTML = `<h3>${escapeHtml(diff.title)} · ${escapeHtml(diff.column)}</h3>
<p class="product-merge-diff-preview">SKU ${escapeHtml(diff.sku)}</p>
<div class="product-merge-detail-grid">
  <div class="product-merge-detail-pane">
    <h4>Current JSON</h4>
    <pre class="product-merge-detail-value">${escapeHtml(formatDetailValue(diff.jsonRaw))}</pre>
  </div>
  <div class="product-merge-detail-pane">
    <h4>CSV value</h4>
    <pre class="product-merge-detail-value">${escapeHtml(formatDetailValue(diff.csvRaw))}</pre>
  </div>
</div>
<div class="product-merge-detail-actions">
  <label><input type="checkbox" data-merge-detail-select${selected ? " checked" : ""} /> Include in merge</label>
  <button type="button" class="product-merge-btn" data-merge-detail-close>Close</button>
</div>`;
  }

  function formatDetailValue(value) {
    if (value == null || trimCell(value) === "") {
      return "(empty)";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    return String(value);
  }

  async function handleFileUpload(file) {
    const errorEl = document.querySelector("[data-merge-error]");
    if (errorEl) {
      errorEl.hidden = true;
      errorEl.textContent = "";
    }
    if (!file) {
      return;
    }
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      if (!parsed.headers.includes("SKU")) {
        throw new Error("CSV must include a SKU column to match listings.");
      }
      if (!window.productData?.fetchProductDataJson) {
        throw new Error("Product data loader is not available.");
      }
      const jsonRoot = await window.productData.fetchProductDataJson();
      state.jsonRoot = jsonRoot;
      state.diffResult = computeDiff(jsonRoot, parsed.records, parsed.headers);
      state.selected.clear();
      state.selectedNewSkus.clear();
      state.activeTab = "property";
      state.onlyColumnsInCsv = true;
      const onlyCsvCheckbox = document.querySelector("[data-merge-only-csv-columns]");
      if (onlyCsvCheckbox instanceof HTMLInputElement) {
        onlyCsvCheckbox.checked = true;
      }
      renderSummaryEl(document.querySelector("[data-merge-summary]"));
      renderBody();
      renderFooter();
      renderTabs();
    } catch (err) {
      if (errorEl) {
        errorEl.hidden = false;
        errorEl.textContent = err?.message || String(err);
      }
    }
  }

  function applyPatchesLocally(root, patches, newProducts) {
    const next = JSON.parse(JSON.stringify(root));
    const products = Array.isArray(next.products) ? next.products : [];
    for (const patch of patches) {
      const sku = trimCell(patch.sku);
      const column = trimCell(patch.column);
      const index = products.findIndex((row) => trimCell(row?.SKU) === sku);
      if (index >= 0 && column) {
        products[index] = { ...products[index], [column]: patch.value };
      }
    }
    const columns = Array.isArray(next.columns) ? next.columns.slice() : [];
    const columnSet = new Set(columns);
    for (const row of newProducts) {
      products.push(row);
      for (const key of Object.keys(row)) {
        if (key && !columnSet.has(key)) {
          columns.push(key);
          columnSet.add(key);
        }
      }
    }
    next.products = products;
    next.columns = columns;
    return next;
  }

  function downloadMergedPreview() {
    const patches = buildPatches();
    const newProducts = buildNewProducts();
    if ((!patches.length && !newProducts.length) || !state.jsonRoot) {
      return;
    }
    const merged = applyPatchesLocally(state.jsonRoot, patches, newProducts);
    const blob = new Blob([`${JSON.stringify(merged, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "productData.merged-preview.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function runMerge() {
    const status = document.querySelector("[data-merge-footer-status]");
    const mergeBtn = document.querySelector("[data-merge-commit]");
    const patches = buildPatches();
    const newProducts = buildNewProducts();
    if (!patches.length && !newProducts.length) {
      return;
    }
    if (!window.githubAuth?.pushProductDataPatches) {
      throw new Error("GitHub product data push is not available.");
    }
    if (!window.githubAuth.isSignedIn?.()) {
      throw new Error("Sign in to GitHub on the picker page before merging.");
    }
    if (mergeBtn) {
      mergeBtn.disabled = true;
      mergeBtn.textContent = "Merging…";
    }
    if (status) {
      status.textContent = "Pushing to GitHub…";
    }
    try {
      const result = await window.githubAuth.pushProductDataPatches(patches, { newProducts });
      const sha = result?.commit?.sha;
      const short = sha ? sha.slice(0, 7) : "ok";
      if (status) {
        status.textContent = `Merged and pushed (${short})`;
        status.classList.add("product-merge-footer-status--ok");
      }
      state.selected.clear();
      state.selectedNewSkus.clear();
      if (state.jsonRoot && state.diffResult) {
        for (const patch of patches) {
          const row = state.diffResult.jsonBySku.get(patch.sku);
          if (row) {
            row[patch.column] = patch.value;
          }
          state.diffResult.diffs = state.diffResult.diffs.filter(
            (d) => !(d.sku === patch.sku && d.column === patch.column),
          );
        }
        for (const row of newProducts) {
          const sku = trimCell(row.SKU);
          if (!sku) {
            continue;
          }
          state.diffResult.jsonBySku.set(sku, row);
          if (Array.isArray(state.jsonRoot.products)) {
            state.jsonRoot.products.push(row);
          }
          state.diffResult.onlyInCsv = state.diffResult.onlyInCsv.filter((entry) => trimCell(entry.sku) !== sku);
          state.diffResult.matchedSkus.push(sku);
        }
      }
      renderSummaryEl(document.querySelector("[data-merge-summary]"));
      renderBody();
      renderFooter();
    } catch (err) {
      if (status) {
        status.textContent = err?.message || String(err);
        status.classList.add("product-merge-footer-status--error");
      }
    } finally {
      if (mergeBtn) {
        mergeBtn.disabled = !hasMergeSelection();
        mergeBtn.textContent = "Merge product data";
      }
    }
  }

  function openOverlay() {
    const overlay = document.getElementById("product-merge-overlay");
    if (overlay) {
      overlay.hidden = false;
    }
    renderFooter();
  }

  function closeOverlay() {
    const overlay = document.getElementById("product-merge-overlay");
    if (overlay) {
      overlay.hidden = true;
    }
    state.detailKey = null;
    renderDetailModal();
  }

  function bindEvents(root) {
    root.querySelector("#product-merge-start")?.addEventListener("click", openOverlay);

    const overlay = document.getElementById("product-merge-overlay");
    overlay?.querySelector("[data-merge-close]")?.addEventListener("click", closeOverlay);
    overlay?.querySelector("[data-merge-file]")?.addEventListener("change", (event) => {
      const input = event.target;
      const file = input?.files?.[0];
      void handleFileUpload(file);
      if (input) {
        input.value = "";
      }
    });

    overlay?.addEventListener("click", (event) => {
      const target = eventTargetElement(event);
      if (!target) {
        return;
      }
      const tabBtn = target.closest("[data-merge-tab]");
      if (tabBtn) {
        state.activeTab = tabBtn.getAttribute("data-merge-tab") || "property";
        renderTabs();
        renderBody();
        return;
      }
      if (target.matches("[data-merge-select-all]")) {
        selectAllVisible(true);
        return;
      }
      if (target.matches("[data-merge-select-none]")) {
        selectAllVisible(false);
        return;
      }
      if (target.matches("[data-merge-commit]")) {
        void runMerge();
        return;
      }
      if (target.matches("[data-merge-download-preview]")) {
        downloadMergedPreview();
        return;
      }
      const detailBtn = target.closest("[data-merge-detail]");
      if (detailBtn) {
        event.preventDefault();
        state.detailKey = detailBtn.getAttribute("data-merge-detail");
        renderDetailModal();
        return;
      }
    });

    overlay?.addEventListener("change", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement)) {
        return;
      }
      if (target.matches("[data-merge-hide-images]")) {
        state.hideImageColumns = target.checked;
        renderSummaryEl(document.querySelector("[data-merge-summary]"));
        renderBody();
        renderFooter();
        return;
      }
      if (target.matches("[data-merge-only-csv-columns]")) {
        state.onlyColumnsInCsv = target.checked;
        renderSummaryEl(document.querySelector("[data-merge-summary]"));
        renderBody();
        renderFooter();
        return;
      }
      if (target.matches("[data-merge-new-sku]")) {
        setNewSkuSelected(target.getAttribute("data-merge-new-sku"), target.checked);
        renderBody();
        renderFooter();
        return;
      }
      if (target.matches("[data-merge-new-all]")) {
        toggleAllNewSkus(target.checked);
        return;
      }
      if (target.matches("[data-merge-select]")) {
        const key = target.getAttribute("data-merge-select");
        const { sku, column } = parseSelectionKey(key);
        setSelected(sku, column, target.checked);
        renderBody();
        renderFooter();
        return;
      }
      if (target.matches("[data-merge-col-toggle]")) {
        const column = target.getAttribute("data-merge-col-toggle");
        const items = getVisibleDiffs().filter((d) => d.column === column);
        toggleDiffList(items, target.checked);
        return;
      }
      if (target.matches("[data-merge-row-toggle]")) {
        const sku = target.getAttribute("data-merge-row-toggle");
        const items = getVisibleDiffs().filter((d) => d.sku === sku);
        toggleDiffList(items, target.checked);
        return;
      }
      if (target.matches("[data-merge-detail-select]") && state.detailKey) {
        const { sku, column } = parseSelectionKey(state.detailKey);
        setSelected(sku, column, target.checked);
        renderBody();
        renderFooter();
        renderDetailModal();
      }
    });

    document.querySelector("[data-merge-detail-overlay]")?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.matches("[data-merge-detail-overlay]") || target.closest("[data-merge-detail-close]")) {
        state.detailKey = null;
        renderDetailModal();
      }
    });
  }

  function init() {
    const root = document.getElementById("product-merge-root");
    if (!root) {
      return;
    }
    bindEvents(document);
    renderFooter();
  }

  window.productDataMerge = {
    init,
    parseCsv,
    computeDiff,
    normalizeForCompare,
  };
})();
