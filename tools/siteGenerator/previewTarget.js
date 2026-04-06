const PREVIEW_HTML_PATH = "./preview.html";

function parsePreviewTarget(search) {
  const raw = typeof search === "string" ? search : "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const page = params.get("page");
  const category = params.get("category");
  if (page === "category" && category) {
    return { type: "category", category: decodeURIComponent(category) };
  }
  return { type: "shop", category: null };
}

function buildPreviewUrl(target) {
  const base = PREVIEW_HTML_PATH;
  if (target?.type === "category" && target.category) {
    return `${base}?page=category&category=${encodeURIComponent(target.category)}`;
  }
  return `${base}?page=shop`;
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
  a.textContent = "Back to product data";
  nav.appendChild(a);
  wrap.appendChild(p);
  wrap.appendChild(nav);
  document.body.appendChild(wrap);
}

window.previewTarget = {
  PREVIEW_HTML_PATH,
  parsePreviewTarget,
  buildPreviewUrl,
  showPreviewBootError,
};
