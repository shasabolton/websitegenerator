(function () {
  const GITHUB_PAGES_REPO = "websitegenerator";
  const hostname = window.location.hostname;
  const onGithubPages = hostname === "github.io" || hostname.endsWith(".github.io");

  let baseHref = "/";
  if (onGithubPages) {
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const first = segments[0];
      baseHref =
        first === GITHUB_PAGES_REPO ? `/${GITHUB_PAGES_REPO}/` : `/${first}/`;
    }
  }

  let baseEl = document.querySelector("base[data-site-base]");
  if (!baseEl) {
    baseEl = document.createElement("base");
    baseEl.setAttribute("data-site-base", "true");
    const viewport = document.querySelector('meta[name="viewport"]');
    if (viewport && viewport.parentNode) {
      viewport.insertAdjacentElement("afterend", baseEl);
    } else {
      document.head.insertBefore(baseEl, document.head.firstChild);
    }
  }
  baseEl.href = baseHref;
})();
