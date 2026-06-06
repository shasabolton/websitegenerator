(function initHomePage() {
  if (window.homePage?.resolvePublicHref) {
    return;
  }

  function normalizeTreeHref(raw) {
    const trimmed = String(raw || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    return trimmed
      .split("/")
      .map((s) => s.trim())
      .filter(Boolean)
      .join("/")
      .toLowerCase();
  }

  /**
   * @param {object | null | undefined} fileTreeConfig
   * @returns {string | null} Normalized `homePage` href from file tree config.
   */
  function getHomePageHref(fileTreeConfig) {
    const normalized = normalizeTreeHref(fileTreeConfig?.homePage);
    return normalized || null;
  }

  /**
   * Public site link for a tree href (`.` when it matches `homePage`).
   * @param {string} treeHref
   * @param {string | null | undefined} homePageHref
   */
  function resolvePublicHref(treeHref, homePageHref) {
    const path = normalizeTreeHref(treeHref);
    const home = normalizeTreeHref(homePageHref);
    if (home && path === home) {
      return ".";
    }
    return String(treeHref || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "") || ".";
  }

  /**
   * Deploy folder for download zip (`""` = site root `index.html`).
   * @param {string} treeHref
   * @param {string | null | undefined} homePageHref
   */
  function resolveDeployFolder(treeHref, homePageHref) {
    const path = normalizeTreeHref(treeHref);
    const home = normalizeTreeHref(homePageHref);
    if (home && path === home) {
      return "";
    }
    return String(treeHref || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  window.homePage = {
    normalizeTreeHref,
    getHomePageHref,
    resolvePublicHref,
    resolveDeployFolder,
  };
})();
