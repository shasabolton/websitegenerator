const INDEX_HTML_PATH = "./index.html";

function parsePreviewTarget(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const path = params.get("path");
  if (path == null || !String(path).trim()) {
    return null;
  }
  let digital = null;
  const d = params.get("digital");
  if (d != null && String(d).trim() !== "") {
    const lower = String(d).trim().toLowerCase();
    if (lower === "true" || lower === "1") {
      digital = true;
    } else if (lower === "false" || lower === "0") {
      digital = false;
    }
  }
  return { path: decodeURIComponent(String(path).trim()), digital };
}

/**
 * @param {string} treePath - File-tree href, e.g. `shop` or `shop/my-category`.
 * @param {boolean | null | undefined} digitalFilter - When true/false, adds `digital=` to the query string for shop preview filtering.
 */
function buildPreviewUrl(treePath, digitalFilter) {
  const path = String(treePath || "").trim();
  let url = `${INDEX_HTML_PATH}?path=${encodeURIComponent(path)}`;
  if (digitalFilter === true) {
    url += "&digital=true";
  } else if (digitalFilter === false) {
    url += "&digital=false";
  }
  return url;
}

function showPreviewBootError(error) {
  document.body.textContent = "";
  const wrap = document.createElement("div");
  wrap.style.cssText = "font-family:sans-serif;padding:1rem;max-width:40rem";
  const p = document.createElement("p");
  p.textContent = `Failed to build preview: ${error.message || String(error)}`;
  const nav = document.createElement("p");
  const a = document.createElement("a");
  a.href = "./index.html";
  a.textContent = "Back to site generator";
  nav.appendChild(a);
  wrap.appendChild(p);
  wrap.appendChild(nav);
  document.body.appendChild(wrap);
}

window.previewTarget = {
  INDEX_HTML_PATH,
  parsePreviewTarget,
  buildPreviewUrl,
  showPreviewBootError,
};
