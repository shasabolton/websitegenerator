(function initProductInstructionVideos() {
  if (window.__productInstructionVideosBound) {
    return;
  }
  window.__productInstructionVideosBound = true;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function parseInstructionVideoUrls(row) {
    return String(row["INSTRUCTION VIDEOS"] ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * @param {string} raw
   * @returns {string | null}
   */
  function parseYoutubeVideoId(raw) {
    const s = String(raw || "").trim();
    if (!s) {
      return null;
    }
    try {
      const u = new URL(s);
      const host = u.hostname.replace(/^www\./i, "");
      if (host === "youtu.be") {
        const id = u.pathname.replace(/^\//, "").split("/")[0] || "";
        return /^[\w-]{11}$/.test(id) ? id : null;
      }
      if (host === "youtube.com" || host === "m.youtube.com") {
        if (u.pathname.startsWith("/embed/")) {
          const id = u.pathname.slice("/embed/".length).split("/")[0] || "";
          return /^[\w-]{11}$/.test(id) ? id : null;
        }
        if (u.pathname === "/watch") {
          const v = u.searchParams.get("v") || "";
          return /^[\w-]{11}$/.test(v) ? v : null;
        }
        if (u.pathname.startsWith("/shorts/")) {
          const id = u.pathname.slice("/shorts/".length).split("/")[0] || "";
          return /^[\w-]{11}$/.test(id) ? id : null;
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  function hideInstructionsEnabled(row) {
    const v = row["HIDE INSTRUCTIONS"];
    return v === true || v === "true" || v === 1 || v === "1";
  }

  /**
   * Treat mistaken extra `?` as `&` (e.g. `...&digital=false?instr=show` from tiny.cc or manual paste).
   */
  function normalizeQuerySearchForParams(search) {
    let s = String(search || "");
    if (s.startsWith("?")) {
      s = s.slice(1);
    }
    let q = s.indexOf("?");
    while (q >= 0) {
      s = s.slice(0, q) + "&" + s.slice(q + 1);
      q = s.indexOf("?");
    }
    return s;
  }

  function locationSearchParams() {
    return new URLSearchParams(normalizeQuerySearchForParams(window.location.search));
  }

  function mayShowInstructionBlock(row) {
    if (!hideInstructionsEnabled(row)) {
      return true;
    }
    return locationSearchParams().get("instr") === "show";
  }

  function buildInstructionVideosInnerHtml(productTitleRaw, urls) {
    const youtubeCount = urls.filter((u) => parseYoutubeVideoId(u)).length;
    const blocks = [];
    let youtubeIndex = 0;
    const altBase = productTitleRaw || "Product";
    for (const rawUrl of urls) {
      const id = parseYoutubeVideoId(rawUrl);
      if (id) {
        youtubeIndex += 1;
        const embedSrc = escapeHtml(`https://www.youtube.com/embed/${id}?rel=0`);
        const label =
          youtubeCount > 1
            ? `${altBase} — instruction video ${youtubeIndex}`
            : `${altBase} — instruction video`;
        const videoTitle = escapeHtml(label);
        blocks.push(`<div class="product-instruction-video">
  <div class="product-instruction-video-wrap">
    <iframe class="product-instruction-embed" title="${videoTitle}" width="560" height="315" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy" src="${embedSrc}"></iframe>
  </div>
</div>`);
        continue;
      }
      const trimmed = String(rawUrl || "").trim();
      if (!trimmed) {
        continue;
      }
      const safe = escapeHtml(trimmed);
      blocks.push(
        `<p class="product-instruction-video-link"><a href="${safe}" rel="noopener noreferrer">Open video</a></p>`,
      );
    }
    if (!blocks.length) {
      return "";
    }
    const headingText = "Instruction Videos";
    const headingEsc = escapeHtml(headingText);
    return `<section class="product-instruction-videos" aria-labelledby="product-instruction-videos-heading">
  <h2 id="product-instruction-videos-heading" class="product-instruction-videos-heading">${headingEsc}</h2>
  <div class="product-instruction-videos-list">
    ${blocks.join("\n")}
  </div>
</section>`;
  }

  async function run() {
    const mount = document.getElementById("product-instruction-videos-mount");
    if (!mount) {
      return;
    }
    const sku = String(mount.getAttribute("data-product-sku") || "").trim();
    if (!sku) {
      return;
    }
    const pd = window.productData;
    if (!pd || typeof pd.fetchProductDataJson !== "function") {
      return;
    }
    let data;
    try {
      data = await pd.fetchProductDataJson();
    } catch {
      return;
    }
    const products = Array.isArray(data?.products) ? data.products : [];
    const row = products.find((p) => p && String(p.SKU || "").trim() === sku);
    if (!row) {
      return;
    }
    if (!mayShowInstructionBlock(row)) {
      return;
    }
    const urls = parseInstructionVideoUrls(row);
    if (!urls.length) {
      return;
    }
    const resolveTitle = window.productData?.resolveProductDisplayTitle;
    const title =
      typeof resolveTitle === "function"
        ? resolveTitle(row, "Product")
        : String(row.TITLE || "Product").trim() || "Product";
    const inner = buildInstructionVideosInnerHtml(title, urls);
    if (!inner) {
      return;
    }
    mount.innerHTML = inner;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
