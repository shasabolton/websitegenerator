(function () {
  if (window.__shopCategoryScrollBound) {
    return;
  }
  window.__shopCategoryScrollBound = true;

  function scrollStep(track) {
    const card = track.querySelector(".product-thumb-card");
    if (!card) {
      return Math.round(track.clientWidth * 0.85);
    }
    const style = getComputedStyle(track);
    const gap = parseFloat(style.columnGap || style.gap) || 7;
    return card.offsetWidth + gap;
  }

  function updateScrollState(root) {
    const track = root.querySelector(".shop-category-scroll-track");
    const prev = root.querySelector('[data-shop-scroll="prev"]');
    const next = root.querySelector('[data-shop-scroll="next"]');
    if (!track || !prev || !next) {
      return;
    }

    const maxScroll = track.scrollWidth - track.clientWidth;
    const overflow = maxScroll > 1;
    const atStart = track.scrollLeft <= 1;
    const atEnd = track.scrollLeft >= maxScroll - 1;

    prev.hidden = !overflow || atStart;
    prev.disabled = !overflow || atStart;
    next.hidden = !overflow || atEnd;
    next.disabled = !overflow || atEnd;
    root.setAttribute("data-fade-start", overflow && !atStart ? "true" : "false");
    root.setAttribute("data-fade-end", overflow && !atEnd ? "true" : "false");
  }

  function initRoot(root) {
    const track = root.querySelector(".shop-category-scroll-track");
    if (!track) {
      return;
    }

    const onChange = () => updateScrollState(root);
    track.addEventListener("scroll", onChange, { passive: true });
    window.addEventListener("resize", onChange);
    updateScrollState(root);
  }

  function initAll() {
    document.querySelectorAll("[data-shop-category-scroll]").forEach(initRoot);
  }

  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-shop-scroll]");
    if (!btn || btn.disabled) {
      return;
    }
    const root = btn.closest("[data-shop-category-scroll]");
    if (!root) {
      return;
    }
    const track = root.querySelector(".shop-category-scroll-track");
    if (!track) {
      return;
    }
    const direction = btn.getAttribute("data-shop-scroll");
    const delta = direction === "prev" ? -scrollStep(track) : scrollStep(track);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: delta, behavior: reduceMotion ? "auto" : "smooth" });
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAll);
  } else {
    initAll();
  }
})();
