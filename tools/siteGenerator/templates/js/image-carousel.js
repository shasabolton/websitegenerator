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

  function setVideoEmbedActive(slide, on) {
    const iframe = slide.querySelector("iframe.image-carousel-embed[data-embed-src]");
    if (!iframe) {
      return;
    }
    const raw = iframe.getAttribute("data-embed-src") || "";
    if (on && raw) {
      iframe.setAttribute("src", raw);
    } else {
      iframe.removeAttribute("src");
    }
  }

  function activate(root, index) {
    const slides = root.querySelectorAll(".image-carousel-slide");
    const thumbs = root.querySelectorAll(".image-carousel-thumb");
    slides.forEach((slide, i) => {
      const on = i === index;
      slide.classList.toggle("is-active", on);
      slide.setAttribute("aria-hidden", on ? "false" : "true");
      setVideoEmbedActive(slide, on);
    });
    thumbs.forEach((btn, i) => {
      const on = i === index;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-current", on ? "true" : "false");
    });
  }

  function initVideoEmbedsInCarousel(root) {
    const active = root.querySelector(".image-carousel-slide.is-active");
    if (active) {
      setVideoEmbedActive(active, true);
    }
  }

  function initAllVideoEmbeds() {
    document.querySelectorAll("[data-image-carousel]").forEach(initVideoEmbedsInCarousel);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAllVideoEmbeds);
  } else {
    initAllVideoEmbeds();
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
