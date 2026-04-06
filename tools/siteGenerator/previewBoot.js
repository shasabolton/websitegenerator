function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.body.appendChild(s);
  });
}

(async function bootPreview() {
  const { parsePreviewTarget, showPreviewBootError } = window.previewTarget;
  try {
    const target = parsePreviewTarget(window.location.search);
    const pageScript =
      target.type === "category" ? "./generateCategory.js" : "./generateShop.js";
    await loadScript(pageScript);
    await loadScript("./displayFileTree.js");
    await window.displayFileTree.runPreviewPage();
  } catch (error) {
    showPreviewBootError(error);
  }
})();
