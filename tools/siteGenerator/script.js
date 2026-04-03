function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

window.addEventListener("load", () => {
  if (window.displayFileTree?.initPreviewPicker) {
    window.displayFileTree.initPreviewPicker({ containerId: "preview-picker-root" }).catch((error) => {
      const root = document.getElementById("preview-picker-root");
      if (root) {
        root.innerHTML = `<p class="preview-picker-error">Failed to load page list: ${escapeHtml(error.message)}</p>`;
      }
    });
  }
});
