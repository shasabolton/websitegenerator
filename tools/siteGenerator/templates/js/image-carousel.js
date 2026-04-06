(function () {
  if (window.__siteImageCarouselBound) {
    return;
  }
  window.__siteImageCarouselBound = true;

  function parseIndex(el) {
    const raw = el.getAttribute("data-carousel-index");
    const n = raw == null ? NaN : parseInt(raw, 10);
    return Number.isFinite(n) ? n : NaN;
  }

  function activate(root, index) {
    const slides = root.querySelectorAll(".image-carousel-slide");
    const thumbs = root.querySelectorAll(".image-carousel-thumb");
    slides.forEach((slide, i) => {
      const on = i === index;
      slide.classList.toggle("is-active", on);
      slide.setAttribute("aria-hidden", on ? "false" : "true");
    });
    thumbs.forEach((btn, i) => {
      const on = i === index;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".image-carousel-thumb");
    if (!btn || btn.disabled) {
      return;
    }
    const root = btn.closest("[data-image-carousel]");
    if (!root) {
      return;
    }
    const idx = parseIndex(btn);
    if (!Number.isFinite(idx)) {
      return;
    }
    event.preventDefault();
    activate(root, idx);
  });
})();
