function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadScript(src, options) {
  const opts = options && typeof options === "object" ? options : {};
  let url = String(src || "").trim();
  if (!url) {
    return Promise.resolve();
  }
  if (opts.cacheBust) {
    const sep = url.includes("?") ? "&" : "?";
    url = `${url}${sep}t=${Date.now()}`;
  }
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.body.appendChild(s);
  });
}

let previewGeneratorsLoadPromise = null;

/**
 * Loads header/footer + page generators (same chain as preview). Safe to call multiple times.
 * Used by the preview picker download action while still on `index.html` without `?path=`.
 */
function loadPreviewGenerators() {
  if (!previewGeneratorsLoadPromise) {
    previewGeneratorsLoadPromise = (async () => {
      await loadScript("./homePage.js");
      await loadScript("./generateHeaderAndFooter.js");
      await loadScript("./generateAnyPage.js");
      await loadScript("./generateCartBody.js");
      await loadScript("./generateShopBody.js");
      await loadScript("./generateCategoryBody.js");
      await loadScript("./generateProductBody.js");
      await loadScript("./contentBlocks.js");
      await loadScript("./generateContentBody.js");
    })();
  }
  return previewGeneratorsLoadPromise;
}

window.loadPreviewGenerators = loadPreviewGenerators;

async function runPreviewBootFromUrl() {
  await loadPreviewGenerators();
  const target = window.previewTarget.parsePreviewTarget(window.location.search);
  if (!target?.path) {
    throw new Error("Preview boot: missing path in URL.");
  }
  await window.generateAnyPage.previewAnyPage(target.path);
}

async function loadGithubAuthScripts() {
  await loadScript("./githubAuth.config.js");
  await loadScript("./githubAuth.js");
}

async function runEditBootFromUrl() {
  await loadPreviewGenerators();
  await loadGithubAuthScripts();
  await loadScript("./productCarouselMap.js", { cacheBust: true });
  await loadScript("./contentEditor.js", { cacheBust: true });
  const target = window.previewTarget.parsePreviewTarget(window.location.search);
  if (!target?.path) {
    throw new Error("Edit boot: missing path in URL.");
  }
  const path = String(target.path || "").trim().toLowerCase();
  if (path.startsWith("shop/") && path.length > "shop/".length && !path.slice("shop/".length).includes("/")) {
    const slug = path.slice("shop/".length);
    const { products } = await window.productData.fetchProductDataJson();
    const row = window.productData.findProductBySlug(products, slug);
    if (row) {
      await loadScript("./productEditor.js", { cacheBust: true });
      if (!window.productEditor?.bootEditProduct) {
        throw new Error("Product editor failed to load. Hard-refresh the page and try again.");
      }
      await window.productEditor.bootEditProduct(target.path);
      return;
    }
  }
  await window.contentEditor.bootEditPage(target.path);
}

window.addEventListener("load", () => {
  const previewTarget = window.previewTarget.parsePreviewTarget(window.location.search);
  if (previewTarget?.path && previewTarget.edit) {
    runEditBootFromUrl().catch((error) => {
      window.previewTarget.showPreviewBootError(error);
    });
    return;
  }
  if (previewTarget?.path) {
    runPreviewBootFromUrl().catch((error) => {
      window.previewTarget.showPreviewBootError(error);
    });
    return;
  }

  const hubRoot = document.getElementById("github-auth-root");
  const bootHub = async () => {
    if (window.githubAuth?.stripOAuthQueryFromUrl) {
      window.githubAuth.stripOAuthQueryFromUrl();
    }
    if (window.githubAuth?.initHubUi && hubRoot) {
      await window.githubAuth.initHubUi(hubRoot);
    }
  };

  bootHub().catch((error) => {
    if (hubRoot) {
      hubRoot.innerHTML = `<p class="github-auth-error">${escapeHtml(error.message)}</p>`;
    }
  });

  if (window.displayFileTree?.initPreviewPicker) {
    window.displayFileTree.initPreviewPicker({ containerId: "preview-picker-root" }).catch((error) => {
      const root = document.getElementById("preview-picker-root");
      if (root) {
        root.innerHTML = `<p class="preview-picker-error">Failed to load page list: ${escapeHtml(error.message)}</p>`;
      }
    });
  }
});
