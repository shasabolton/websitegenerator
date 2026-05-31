function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
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

async function runEditBootFromUrl() {
  await loadPreviewGenerators();
  await loadScript("./contentEditor.js");
  const target = window.previewTarget.parsePreviewTarget(window.location.search);
  if (!target?.path) {
    throw new Error("Edit boot: missing path in URL.");
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

  if (window.displayFileTree?.initPreviewPicker) {
    window.displayFileTree.initPreviewPicker({ containerId: "preview-picker-root" }).catch((error) => {
      const root = document.getElementById("preview-picker-root");
      if (root) {
        root.innerHTML = `<p class="preview-picker-error">Failed to load page list: ${escapeHtml(error.message)}</p>`;
      }
    });
  }
});
