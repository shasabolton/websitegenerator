document.addEventListener("DOMContentLoaded", () => {
  const viewBtn = document.getElementById("viewProductTableButton");
  const panel = document.getElementById("product-table-panel");

  viewBtn?.addEventListener("click", () => {
    panel?.removeAttribute("hidden");
    void window.productTable?.renderProductTable("product-table-root");
    panel?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
});
