const INDEX_HTML_PATH = "./index.html";

function parsePreviewTarget(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const path = params.get("path");
  if (path == null || !String(path).trim()) {
    return null;
  }
  return { path: decodeURIComponent(String(path).trim()) };
}

/**
 * @param {string} treePath - File-tree href, e.g. `shop` or `shop/my-category`.
 */
function buildPreviewUrl(treePath) {
  const path = String(treePath || "").trim();
  return `${INDEX_HTML_PATH}?path=${encodeURIComponent(path)}`;
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
