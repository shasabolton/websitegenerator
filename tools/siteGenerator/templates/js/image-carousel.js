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

(function () {
  if (window.__siteNavDropdownBound) {
    return;
  }
  window.__siteNavDropdownBound = true;

  function closeAll(exceptNode) {
    document.querySelectorAll(".nav-item-has-children.is-open").forEach((li) => {
      if (exceptNode && li === exceptNode) {
        return;
      }
      li.classList.remove("is-open");
      const btn = li.querySelector(".nav-dropdown-toggle");
      if (btn) {
        btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  document.addEventListener("click", (event) => {
    const toggle = event.target.closest(".nav-dropdown-toggle");
    if (toggle) {
      const li = toggle.closest(".nav-item-has-children");
      if (!li) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const willOpen = !li.classList.contains("is-open");
      closeAll(li);
      li.classList.toggle("is-open", willOpen);
      toggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
      return;
    }

    // Click outside nav closes any click-opened menus.
    const inNav = event.target.closest(".site-header .site-nav");
    if (!inNav) {
      closeAll(null);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") {
      return;
    }
    closeAll(null);
  });
})();
