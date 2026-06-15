/**
 * GitHub personal access token + Contents API for saving content JSON from the site generator.
 * Token, login, repo, and branch persist in localStorage on this device until sign-out.
 */
(function () {
  const STORAGE = {
    pat: "siteGenerator.github.pat",
    login: "siteGenerator.github.login",
    repo: "siteGenerator.github.repo",
    imagesRepo: "siteGenerator.github.imagesRepo",
    branch: "siteGenerator.github.branch",
    clientId: "siteGenerator.github.clientId",
    redirectUriOverride: "siteGenerator.github.redirectUriOverride",
    redirectUriAtSignIn: "siteGenerator.github.redirectUriAtSignIn",
    token: "siteGenerator.github.token",
    oauthState: "siteGenerator.github.oauthState",
    pkceVerifier: "siteGenerator.github.pkceVerifier",
  };

  /** @type {string | null} */
  let cachedHubIndexUrl = null;

  const CONTENT_PAGES_PREFIX = "shared-assets/content/pages";
  const FILE_TREE_PATH = "shared-assets/config/fileTree.json";
  const NAVIGATION_PATH = "shared-assets/config/navigation.json";
  const PRODUCT_DATA_PATH = "shared-assets/config/productData.json";
  const SHOP_DATA_PATH = "shared-assets/config/shopData.json";
  const MANIFEST_PATH = ".generated/manifest.json";
  const SITEMAP_PATH = "sitemap.xml";
  const ROBOTS_PATH = "robots.txt";
  const SITEMAP_EXCLUDED_OUTPUTS = new Set(["cart/index.html"]);
  const OAUTH_SCOPE = "repo";
  const DEFAULT_BRANCH = "main";
  const BLOB_CONCURRENCY = 5;

  function getConfig() {
    return window.githubAuthConfig && typeof window.githubAuthConfig === "object"
      ? window.githubAuthConfig
      : {};
  }

  /** Strip spaces/tabs/newlines (a leading space in client_id causes GitHub authorize 404). */
  function normalizeClientId(raw) {
    return String(raw || "").replace(/\s+/g, "");
  }

  /**
   * @returns {{ ok: true, clientId: string } | { ok: false, message: string }}
   */
  function validateClientId(raw) {
    const clientId = normalizeClientId(raw);
    if (!clientId) {
      return { ok: false, message: "Enter a Client ID from your OAuth App (not the Client Secret)." };
    }
    if (/^\d+$/.test(clientId)) {
      return {
        ok: false,
        message:
          "That looks like a numeric App ID. In GitHub → your app → Settings, copy Client ID (starts with Ov23… for OAuth Apps or Iv1.… for GitHub Apps).",
      };
    }
    if (/^gh[pousr]_/i.test(clientId) || /^github_pat_/i.test(clientId)) {
      return {
        ok: false,
        message: "That looks like a personal access token. Use the OAuth App Client ID instead.",
      };
    }
    if (!/^[A-Za-z0-9._-]+$/.test(clientId)) {
      return {
        ok: false,
        message: "Client ID has invalid characters. Copy only the Client ID from GitHub app settings.",
      };
    }
    if (clientId.length < 8) {
      return { ok: false, message: "Client ID is too short. Check you copied the full value from GitHub." };
    }
    if (!/^(Ov23|Iv1\.)/i.test(clientId)) {
      return {
        ok: false,
        message:
          "That does not look like a Client ID (expected Ov23… for OAuth Apps or Iv1.… for GitHub Apps). A GitHub username will not work.",
      };
    }
    return { ok: true, clientId };
  }

  function getConfigClientId() {
    return normalizeClientId(getConfig().clientId || "");
  }

  function getBrowserClientId() {
    const fromBrowser = localStorage.getItem(STORAGE.clientId);
    return fromBrowser ? normalizeClientId(fromBrowser) : "";
  }

  /** Browser override first, then githubAuth.config.js */
  function getClientId() {
    const browser = getBrowserClientId();
    if (browser) {
      return browser;
    }
    return getConfigClientId();
  }

  function setClientId(clientId) {
    const checked = validateClientId(clientId);
    if (!checked.ok) {
      throw new Error(checked.message);
    }
    localStorage.setItem(STORAGE.clientId, checked.clientId);
  }

  function clearClientId() {
    localStorage.removeItem(STORAGE.clientId);
  }

  function hasConfigClientId() {
    return Boolean(getConfigClientId());
  }

  function normalizePat(raw) {
    return String(raw || "").replace(/\s+/g, "");
  }

  /**
   * @returns {{ ok: true, pat: string } | { ok: false, message: string }}
   */
  function validatePat(raw) {
    const pat = normalizePat(raw);
    if (!pat) {
      return { ok: false, message: "Enter a personal access token." };
    }
    if (!/^(github_pat_|ghp_|gho_)/i.test(pat)) {
      return {
        ok: false,
        message: "Token should start with github_pat_, ghp_, or gho_. Create one under GitHub → Settings → Developer settings.",
      };
    }
    if (pat.length < 20) {
      return { ok: false, message: "Token looks too short. Copy the full token from GitHub." };
    }
    return { ok: true, pat };
  }

  function getConfigPat() {
    return normalizePat(getConfig().accessToken || "");
  }

  function getBrowserPat() {
    const raw = localStorage.getItem(STORAGE.pat);
    return raw ? normalizePat(raw) : "";
  }

  /** Browser token first, then optional githubAuth.config.js accessToken */
  function getPat() {
    const browser = getBrowserPat();
    if (browser) {
      return browser;
    }
    return getConfigPat();
  }

  function setPat(pat) {
    const checked = validatePat(pat);
    if (!checked.ok) {
      throw new Error(checked.message);
    }
    localStorage.setItem(STORAGE.pat, checked.pat);
    sessionStorage.removeItem(STORAGE.token);
    clearOAuthPending();
  }

  function clearPat() {
    localStorage.removeItem(STORAGE.pat);
  }

  function getToken() {
    return getPat();
  }

  function getLogin() {
    return localStorage.getItem(STORAGE.login) || "";
  }

  function getSelectedRepo() {
    return localStorage.getItem(STORAGE.repo) || "";
  }

  function getBranch() {
    return localStorage.getItem(STORAGE.branch) || DEFAULT_BRANCH;
  }

  function setBranch(branch) {
    const b = String(branch || "").trim() || DEFAULT_BRANCH;
    localStorage.setItem(STORAGE.branch, b);
  }

  function setSelectedRepo(fullName) {
    if (fullName) {
      localStorage.setItem(STORAGE.repo, fullName);
    } else {
      localStorage.removeItem(STORAGE.repo);
    }
  }

  function getSelectedImagesRepo() {
    return localStorage.getItem(STORAGE.imagesRepo) || "";
  }

  function setSelectedImagesRepo(fullName) {
    if (fullName) {
      localStorage.setItem(STORAGE.imagesRepo, fullName);
    } else {
      localStorage.removeItem(STORAGE.imagesRepo);
    }
  }

  function isSignedIn() {
    return Boolean(getPat());
  }

  async function savePatAndVerify(rawPat) {
    const checked = validatePat(rawPat);
    if (!checked.ok) {
      throw new Error(checked.message);
    }
    const user = await fetchCurrentUser(checked.pat);
    setPat(checked.pat);
    if (user?.login) {
      localStorage.setItem(STORAGE.login, user.login);
    }
    return user;
  }

  function clearSession() {
    clearPat();
    localStorage.removeItem(STORAGE.login);
    sessionStorage.removeItem(STORAGE.token);
    clearOAuthPending();
  }

  function clearOAuthPending() {
    sessionStorage.removeItem(STORAGE.oauthState);
    sessionStorage.removeItem(STORAGE.pkceVerifier);
    sessionStorage.removeItem(STORAGE.redirectUriAtSignIn);
  }

  function stripOAuthQueryFromUrl() {
    const clean = new URL(window.location.href);
    const keys = ["code", "state", "error", "error_description", "error_uri"];
    let changed = false;
    for (const key of keys) {
      if (clean.searchParams.has(key)) {
        clean.searchParams.delete(key);
        changed = true;
      }
    }
    if (changed) {
      window.history.replaceState({}, "", clean.href);
    }
  }

  function getRedirectUriOverride() {
    return String(localStorage.getItem(STORAGE.redirectUriOverride) || "").trim();
  }

  function setRedirectUriOverride(value) {
    const v = String(value || "").trim();
    if (v) {
      localStorage.setItem(STORAGE.redirectUriOverride, v);
    } else {
      localStorage.removeItem(STORAGE.redirectUriOverride);
    }
    cachedHubIndexUrl = null;
  }

  /**
   * Canonical OAuth callback: site generator hub index.html (stable even if the address bar differs).
   */
  function resolveHubIndexUrl() {
    const override = getRedirectUriOverride();
    if (override) {
      try {
        const url = new URL(override);
        url.search = "";
        url.hash = "";
        return url.href;
      } catch {
        /* fall through */
      }
    }

    if (cachedHubIndexUrl) {
      return cachedHubIndexUrl;
    }

    const scripts = document.querySelectorAll("script[src]");
    for (const script of scripts) {
      const src = script.getAttribute("src") || "";
      if (src.includes("githubAuth.js")) {
        try {
          const base = new URL(src, window.location.href);
          const hub = new URL("index.html", base);
          hub.search = "";
          hub.hash = "";
          cachedHubIndexUrl = hub.href;
          return cachedHubIndexUrl;
        } catch {
          /* try next */
        }
      }
    }

    const url = new URL(window.location.href);
    let path = url.pathname;
    if (path.endsWith("/")) {
      path += "index.html";
    } else if (!/\.html$/i.test(path.split("/").pop() || "")) {
      path = `${path.replace(/\/?$/, "")}/index.html`;
    }
    url.pathname = path;
    url.search = "";
    url.hash = "";
    cachedHubIndexUrl = url.href;
    return cachedHubIndexUrl;
  }

  function redirectUri() {
    const atSignIn = sessionStorage.getItem(STORAGE.redirectUriAtSignIn);
    if (atSignIn && String(atSignIn).trim()) {
      return String(atSignIn).trim();
    }
    return resolveHubIndexUrl();
  }

  function callbackUrlWarnings() {
    const callback = resolveHubIndexUrl();
    const current = window.location.href.split("?")[0].split("#")[0];
    const lines = [];
    try {
      const cb = new URL(callback);
      const cur = new URL(current);
      if (cb.origin !== cur.origin) {
        lines.push(
          `You are on <code>${escapeHtml(cur.origin)}</code> but the callback uses <code>${escapeHtml(cb.origin)}</code>. Use the same host in your OAuth app (e.g. both <code>127.0.0.1</code> or both <code>localhost</code>).`,
        );
      }
      if (cb.href.split("?")[0] !== current) {
        lines.push(
          `Open the generator at the callback URL before signing in, or set a custom callback below if your server uses a different path.`,
        );
      }
    } catch {
      /* ignore */
    }
    if (window.location.protocol === "file:") {
      lines.push("OAuth requires an <strong>http://</strong> or <strong>https://</strong> URL. Serve the repo root with Live Server (or similar), not <code>file://</code>.");
    }
    return lines;
  }

  function buildCallbackUrlHelpHtml() {
    const callback = resolveHubIndexUrl();
    const warnings = callbackUrlWarnings();
    const warnHtml = warnings.length
      ? `<ul class="github-auth-callback-warnings">${warnings.map((w) => `<li>${w}</li>`).join("")}</ul>`
      : "";
    const override = getRedirectUriOverride();
    return `<div class="github-auth-callback-box">
  <p class="github-auth-muted"><strong>Authorization callback URL</strong> (paste into your OAuth App; must match exactly):</p>
  <div class="github-auth-row github-auth-callback-row">
    <code class="github-auth-callback-url" data-github-callback-display>${escapeHtml(callback)}</code>
    <button type="button" class="github-auth-btn" data-github-copy-callback>Copy</button>
    <a class="github-auth-btn" href="${escapeAttr(callback)}" target="_blank" rel="noopener noreferrer">Test URL</a>
  </div>
  ${warnHtml}
  <details class="github-auth-callback-details">
    <summary>Custom callback URL (advanced)</summary>
    <p class="github-auth-muted">Only if the URL above 404s in your browser but another path works (e.g. GitHub Pages project site).</p>
    <div class="github-auth-row">
      <input type="url" data-github-callback-override value="${escapeAttr(override)}" placeholder="${escapeAttr(callback)}" aria-label="Custom OAuth callback URL" />
      <button type="button" class="github-auth-btn" data-github-save-callback-override>Save callback</button>
      <button type="button" class="github-auth-btn" data-github-clear-callback-override>Reset</button>
    </div>
  </details>
  <p class="github-auth-muted">Register an <strong>OAuth App</strong> (Developer settings → <strong>OAuth Apps</strong> → New). Client ID usually starts with <code>Ov23</code>. Do not use the numeric App ID, Client Secret, or a personal access token.</p>
  <p class="github-auth-muted">If GitHub shows <strong>404</strong> when signing in, the Client ID is wrong or has extra spaces — click Change Client ID, paste again, and Save.</p>
</div>`;
  }

  function bindCallbackUrlHelp(root) {
    root.querySelector("[data-github-copy-callback]")?.addEventListener("click", async () => {
      const text = root.querySelector("[data-github-callback-display]")?.textContent || resolveHubIndexUrl();
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        window.prompt("Copy callback URL:", text);
      }
    });
    root.querySelector("[data-github-save-callback-override]")?.addEventListener("click", () => {
      const input = root.querySelector("[data-github-callback-override]");
      const v = String(input?.value || "").trim();
      if (!v) {
        showHubError(root, new Error("Enter a callback URL or click Reset."));
        return;
      }
      try {
        const url = new URL(v);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("Callback URL must be http or https.");
        }
      } catch (err) {
        showHubError(root, err);
        return;
      }
      hideHubError(root);
      setRedirectUriOverride(v);
      initHubUi(root).catch((e) => showHubError(root, e));
    });
    root.querySelector("[data-github-clear-callback-override]")?.addEventListener("click", () => {
      setRedirectUriOverride("");
      initHubUi(root).catch((e) => showHubError(root, e));
    });
  }

  function base64UrlEncode(bytes) {
    let binary = "";
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 1) {
      binary += String.fromCharCode(arr[i]);
    }
    return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  }

  function randomUrlSafeString(byteLength) {
    const arr = new Uint8Array(byteLength);
    crypto.getRandomValues(arr);
    return base64UrlEncode(arr);
  }

  async function pkceChallengeFromVerifier(verifier) {
    const data = new TextEncoder().encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    return base64UrlEncode(new Uint8Array(hash));
  }

  function utf8ToBase64(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  function bytesToBase64(bytes) {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < arr.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, arr.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function parseRepoFullName(fullName) {
    const s = String(fullName || "").trim();
    const slash = s.indexOf("/");
    if (slash <= 0 || slash >= s.length - 1) {
      return null;
    }
    return { owner: s.slice(0, slash), repo: s.slice(slash + 1) };
  }

  /**
   * @param {string} pagePath - file-tree path, e.g. `about` or `blog/my-post`
   */
  function pagePathToContentRepoPath(pagePath) {
    const normalized = normalizePagePath(pagePath);
    if (!normalized || normalized.includes("..")) {
      throw new Error(`Invalid content page path: ${pagePath}`);
    }
    return `${CONTENT_PAGES_PREFIX}/${normalized}.json`;
  }

  function normalizePagePath(pagePath) {
    return String(pagePath || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }

  function isBlogPagePath(pagePath) {
    return normalizePagePath(pagePath).startsWith("blog/");
  }

  function isContentPagePath(pagePath) {
    const path = normalizePagePath(pagePath);
    if (!path) {
      return false;
    }
    if (path === "cart" || path === "shop" || path === "blog") {
      return false;
    }
    return !path.startsWith("shop/");
  }

  function isTreeNodeHidden(node) {
    return node?.hide === true;
  }

  function syncNavigationFromFileTree(fileTreeJson, existingNav) {
    const existingItems = Array.isArray(existingNav?.items) ? existingNav.items : [];
    const existingShop = existingItems.find((item) => normalizePagePath(item?.href) === "shop");

    function mapVisibleChildren(children) {
      return (Array.isArray(children) ? children : [])
        .filter((child) => !isTreeNodeHidden(child))
        .map((child) => mapTreeNodeToNavItem(child))
        .filter(Boolean);
    }

    function mapTreeNodeToNavItem(node) {
      if (isTreeNodeHidden(node)) {
        return null;
      }
      const href = normalizePagePath(node?.href);
      if (!href) {
        return null;
      }

      if (href === "shop") {
        const item = {
          label: String(node.label || existingShop?.label || "Shop").trim() || "Shop",
          href: "shop",
        };
        if (Array.isArray(existingShop?.children) && existingShop.children.length) {
          item.children = existingShop.children;
        }
        return item;
      }

      if (href === "blog") {
        return {
          label: String(node.label || "Blog").trim() || "Blog",
          href: "blog",
        };
      }

      const children = mapVisibleChildren(node.children);
      return {
        label: String(node.label || href).trim() || href,
        href,
        ...(children.length ? { children } : {}),
      };
    }

    const items = (Array.isArray(fileTreeJson?.items) ? fileTreeJson.items : [])
      .map((node) => mapTreeNodeToNavItem(node))
      .filter(Boolean);
    return { items };
  }

  async function pushNavigationFromFileTree(owner, repo, branch, fileTreeJson) {
    const navigation = await readRepoJson(owner, repo, NAVIGATION_PATH, branch);
    const nextNavigation = syncNavigationFromFileTree(fileTreeJson, navigation.json);
    return putFileContent(
      owner,
      repo,
      NAVIGATION_PATH,
      "Sync navigation from file tree",
      `${JSON.stringify(nextNavigation, null, 2)}\n`,
      branch,
      navigation.meta?.sha || null,
    );
  }

  function slugify(raw) {
    const s = String(raw || "")
      .trim()
      .toLowerCase()
      .replace(/['"]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s;
  }

  function resolveBlogSlug(pageData, originalPagePath) {
    const originalSlug = normalizePagePath(originalPagePath).slice("blog/".length);
    const fromSlug = slugify(pageData?.slug || "");
    if (fromSlug) {
      return fromSlug;
    }
    const fromTitle = slugify(pageData?.meta?.title || "");
    if (fromTitle) {
      return fromTitle;
    }
    const fallback = slugify(originalSlug);
    if (fallback) {
      return fallback;
    }
    throw new Error("Blog slug is empty. Set slug or meta title before pushing.");
  }

  function base64ToUtf8(base64) {
    const normalized = String(base64 || "").replace(/\s+/g, "");
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  async function readRepoJson(owner, repo, filePath, branch) {
    const meta = await getFileMeta(owner, repo, filePath, branch);
    if (!meta) {
      throw new Error(`Required file missing in target repo: ${filePath}`);
    }
    const text = base64ToUtf8(meta.content || "");
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON in ${filePath}`);
    }
    return { meta, json };
  }

  async function deleteFileContent(owner, repo, filePath, message, branch, sha) {
    if (!sha) {
      return null;
    }
    const path = filePath
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return githubApi(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sha,
        branch: branch || DEFAULT_BRANCH,
      }),
    });
  }

  function findFileTreeEntryByHref(items, href) {
    const norm = normalizePagePath(href);
    if (!Array.isArray(items)) {
      return null;
    }
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (normalizePagePath(item?.href) === norm) {
        return { item, list: items, index };
      }
      if (Array.isArray(item?.children)) {
        const nested = findFileTreeEntryByHref(item.children, href);
        if (nested) {
          return nested;
        }
      }
    }
    return null;
  }

  function updateFileTreeForBlog(fileTreeJson, oldPagePath, newPagePath, title) {
    const root = fileTreeJson && typeof fileTreeJson === "object" ? fileTreeJson : {};
    if (!Array.isArray(root.items)) {
      throw new Error("fileTree.json missing items array");
    }
    const blogNode = root.items.find((item) => normalizePagePath(item?.href) === "blog");
    if (!blogNode) {
      throw new Error("fileTree.json missing Blog node");
    }
    if (!Array.isArray(blogNode.children)) {
      blogNode.children = [];
    }
    const oldNorm = normalizePagePath(oldPagePath);
    const newNorm = normalizePagePath(newPagePath);
    let entry = blogNode.children.find((child) => normalizePagePath(child?.href) === oldNorm);
    if (!entry) {
      entry = blogNode.children.find((child) => normalizePagePath(child?.href) === newNorm);
    }
    if (!entry) {
      entry = {};
      blogNode.children.push(entry);
    }
    entry.label = String(title || "").trim() || "Untitled";
    entry.href = newNorm;
    return root;
  }

  function upsertContentPageInFileTree(fileTreeJson, oldPagePath, newPagePath, title) {
    const root = fileTreeJson && typeof fileTreeJson === "object" ? fileTreeJson : {};
    if (!Array.isArray(root.items)) {
      throw new Error("fileTree.json missing items array");
    }
    const oldNorm = normalizePagePath(oldPagePath);
    const newNorm = normalizePagePath(newPagePath);
    const label = String(title || "").trim() || "Untitled";
    let entry = findFileTreeEntryByHref(root.items, oldNorm)?.item;
    if (!entry) {
      entry = findFileTreeEntryByHref(root.items, newNorm)?.item;
    }
    if (entry) {
      entry.label = label;
      entry.href = newNorm;
      return root;
    }
    if (isBlogPagePath(newNorm)) {
      return updateFileTreeForBlog(root, oldPagePath, newPagePath, title);
    }
    root.items.push({ label, href: newNorm });
    return root;
  }

  async function pushFileTree(fileTreeJson) {
    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    const branch = getBranch();
    const fileTree = await readRepoJson(parsed.owner, parsed.repo, FILE_TREE_PATH, branch);
    const nextTree = fileTreeJson && typeof fileTreeJson === "object" ? fileTreeJson : fileTree.json;
    const fileTreeResult = await putFileContent(
      parsed.owner,
      parsed.repo,
      FILE_TREE_PATH,
      "Update file tree layout",
      `${JSON.stringify(nextTree, null, 2)}\n`,
      branch,
      fileTree.meta?.sha || null,
    );
    await pushNavigationFromFileTree(parsed.owner, parsed.repo, branch, nextTree);
    return fileTreeResult;
  }

  async function pushShopData(shopDataJson) {
    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    const branch = getBranch();
    const payload =
      shopDataJson && typeof shopDataJson === "object"
        ? shopDataJson
        : typeof window.shopDataEditor?.normalizeShopData === "function"
          ? window.shopDataEditor.normalizeShopData({})
          : {};
    const fileData = await readRepoJson(parsed.owner, parsed.repo, SHOP_DATA_PATH, branch);
    const fileTreeResult = await putFileContent(
      parsed.owner,
      parsed.repo,
      SHOP_DATA_PATH,
      "Update shop data",
      `${JSON.stringify(payload, null, 2)}\n`,
      branch,
      fileData.meta?.sha || null,
    );
    if (typeof window.shopDataEditor?.clearShopDataOverlay === "function") {
      window.shopDataEditor.clearShopDataOverlay();
    }
    return fileTreeResult;
  }

  async function githubApi(path, options, token) {
    const t = token || getToken();
    if (!t) {
      throw new Error("Not signed in to GitHub.");
    }
    const url = path.startsWith("https://") ? path : `https://api.github.com${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        Authorization: `Bearer ${t}`,
        ...(options?.headers || {}),
      },
    });
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.message || body.error || detail;
      } catch {
        /* ignore */
      }
      if (response.status === 401) {
        clearSession();
        throw new Error("GitHub token expired or was revoked. Save a new token on the picker.");
      }
      const err = new Error(detail || `GitHub API error (${response.status})`);
      err.status = response.status;
      throw err;
    }
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    if (!text) {
      return null;
    }
    return JSON.parse(text);
  }

  async function fetchCurrentUser(token) {
    return githubApi("/user", { method: "GET" }, token);
  }

  async function fetchWritableRepos() {
    const repos = [];
    let page = 1;
    for (;;) {
      const batch = await githubApi(
        `/user/repos?per_page=100&page=${page}&sort=updated&affiliation=owner,collaborator`,
        { method: "GET" },
      );
      if (!Array.isArray(batch) || batch.length === 0) {
        break;
      }
      for (const r of batch) {
        const perm = r.permissions || {};
        if (perm.push || perm.admin) {
          repos.push(r);
        }
      }
      if (batch.length < 100) {
        break;
      }
      page += 1;
      if (page > 10) {
        break;
      }
    }
    repos.sort((a, b) => String(a.full_name).localeCompare(String(b.full_name)));
    return repos;
  }

  async function getFileMeta(owner, repo, filePath, branch) {
    const ref = encodeURIComponent(branch || DEFAULT_BRANCH);
    const path = filePath
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    try {
      return await githubApi(`/repos/${owner}/${repo}/contents/${path}?ref=${ref}`, { method: "GET" });
    } catch (err) {
      if (err?.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /**
   * @param {string} [dirPath] - empty string for repository root
   * @returns {Promise<Array<{ name: string, path: string, type: "dir" | "file", size: number, sha: string, downloadUrl: string | null }>>}
   */
  async function listRepoDirectory(owner, repo, dirPath = "", branch) {
    const ref = encodeURIComponent(branch || DEFAULT_BRANCH);
    const segments = String(dirPath || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean)
      .map((s) => encodeURIComponent(s));
    const pathPart = segments.length ? `/${segments.join("/")}` : "";
    const result = await githubApi(`/repos/${owner}/${repo}/contents${pathPart}?ref=${ref}`, {
      method: "GET",
    });
    if (!Array.isArray(result)) {
      return [];
    }
    return result.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type === "dir" ? "dir" : "file",
      size: entry.size ?? 0,
      sha: entry.sha || "",
      downloadUrl: entry.download_url || null,
    }));
  }

  function buildRawContentUrl(owner, repo, filePath, branch) {
    const b = encodeURIComponent(branch || DEFAULT_BRANCH);
    const path = String(filePath || "")
      .trim()
      .replace(/^\/+/, "")
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/${b}/${path}`;
  }

  /** Raw URL using explicit ref (matches GitHub “Copy URL” for branch files). */
  function buildRawRefsContentUrl(owner, repo, filePath, branch) {
    const b = String(branch || DEFAULT_BRANCH).trim();
    const path = String(filePath || "")
      .trim()
      .replace(/^\/+/, "")
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${encodeURIComponent(b)}/${path}`;
  }

  function buildMediaContentUrl(owner, repo, filePath, branch) {
    const b = String(branch || DEFAULT_BRANCH).trim();
    const path = String(filePath || "")
      .trim()
      .replace(/^\/+/, "")
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `https://media.githubusercontent.com/media/${owner}/${repo}/${b}/${path}`;
  }

  /** GitHub blob URL with raw query (matches “View raw” on github.com). */
  function buildBlobRawContentUrl(owner, repo, filePath, branch) {
    const b = String(branch || DEFAULT_BRANCH).trim();
    const path = String(filePath || "")
      .trim()
      .replace(/^\/+/, "")
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(b)}/${path}?raw=true`;
  }

  async function putFileContent(owner, repo, filePath, message, jsonText, branch, existingSha) {
    const path = filePath
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    const body = {
      message,
      content: utf8ToBase64(jsonText),
      branch: branch || DEFAULT_BRANCH,
    };
    if (existingSha) {
      body.sha = existingSha;
    }
    return githubApi(`/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  /**
   * @param {string} pagePath
   * @param {object} pageData
   */
  async function pushContentPage(pagePath, pageData) {
    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    const branch = getBranch();
    const originalPagePath = normalizePagePath(pagePath);
    const mutablePageData =
      pageData && typeof pageData === "object" ? JSON.parse(JSON.stringify(pageData)) : { meta: {}, blocks: [] };
    if (!mutablePageData.meta || typeof mutablePageData.meta !== "object") {
      mutablePageData.meta = {};
    }

    let targetPagePath = originalPagePath;
    if (isBlogPagePath(originalPagePath)) {
      const newSlug = resolveBlogSlug(mutablePageData, originalPagePath);
      mutablePageData.slug = newSlug;
      targetPagePath = `blog/${newSlug}`;
    } else {
      const newSlug = slugify(mutablePageData?.slug || mutablePageData?.meta?.title || originalPagePath);
      if (newSlug) {
        mutablePageData.slug = newSlug;
        targetPagePath = newSlug;
      }
    }

    const oldRepoPath = pagePathToContentRepoPath(originalPagePath);
    const newRepoPath = pagePathToContentRepoPath(targetPagePath);
    const oldMeta = await getFileMeta(parsed.owner, parsed.repo, oldRepoPath, branch);
    const targetMeta = oldRepoPath === newRepoPath ? oldMeta : await getFileMeta(parsed.owner, parsed.repo, newRepoPath, branch);
    const pageJsonText = `${JSON.stringify(mutablePageData, null, 2)}\n`;
    const pageMessage = `Update content: ${targetPagePath}`;

    const pageWriteResult = await putFileContent(
      parsed.owner,
      parsed.repo,
      newRepoPath,
      pageMessage,
      pageJsonText,
      branch,
      targetMeta?.sha || null,
    );

    if (oldRepoPath !== newRepoPath && oldMeta?.sha) {
      await deleteFileContent(
        parsed.owner,
        parsed.repo,
        oldRepoPath,
        `Rename content page to ${targetPagePath}`,
        branch,
        oldMeta.sha,
      );
    }

    const fileTree = await readRepoJson(parsed.owner, parsed.repo, FILE_TREE_PATH, branch);
    const title =
      String(mutablePageData.meta?.title || mutablePageData.slug || "Untitled").trim() || "Untitled";
    const nextFileTree = upsertContentPageInFileTree(
      fileTree.json,
      originalPagePath,
      targetPagePath,
      title,
    );

    await putFileContent(
      parsed.owner,
      parsed.repo,
      FILE_TREE_PATH,
      `Update file tree for ${targetPagePath}`,
      `${JSON.stringify(nextFileTree, null, 2)}\n`,
      branch,
      fileTree.meta?.sha || null,
    );

    await pushNavigationFromFileTree(parsed.owner, parsed.repo, branch, nextFileTree);

    return {
      ...pageWriteResult,
      targetPagePath,
      pageData: mutablePageData,
      nextFileTree,
    };
  }

  function parseProductSlugFromPagePath(pagePath) {
    const path = normalizePagePath(pagePath);
    if (!path.startsWith("shop/") || path.length <= "shop/".length) {
      return null;
    }
    const slug = path.slice("shop/".length);
    if (!slug || slug.includes("/")) {
      return null;
    }
    return slug;
  }

  function findProductRowIndexBySku(products, sku) {
    const key = String(sku ?? "").trim();
    if (!key) {
      return -1;
    }
    return products.findIndex((row) => String(row?.SKU ?? "").trim() === key);
  }

  /**
   * @param {string} pagePath - e.g. `shop/my-product-slug`
   * @param {object} productRow - full product row to write
   */
  async function pushProductRow(pagePath, productRow) {
    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    const branch = getBranch();
    const slug = parseProductSlugFromPagePath(pagePath);
    if (!slug) {
      throw new Error(`Invalid product path for push: ${pagePath}`);
    }

    const mutableRow =
      productRow && typeof productRow === "object" ? JSON.parse(JSON.stringify(productRow)) : {};
    const sku = String(mutableRow.SKU ?? "").trim();
    if (!sku) {
      throw new Error("Product row is missing SKU — cannot update productData.json safely.");
    }

    const fileData = await readRepoJson(parsed.owner, parsed.repo, PRODUCT_DATA_PATH, branch);
    const root = fileData.json && typeof fileData.json === "object" ? fileData.json : {};
    const products = Array.isArray(root.products) ? root.products : [];
    const index = findProductRowIndexBySku(products, sku);
    if (index < 0) {
      throw new Error(`Product SKU ${sku} not found in remote productData.json`);
    }

    const existing = products[index] && typeof products[index] === "object" ? products[index] : {};
    products[index] = { ...existing, ...mutableRow, SKU: existing.SKU ?? sku };

    const columns = Array.isArray(root.columns) ? root.columns.slice() : [];
    const columnSet = new Set(columns);
    for (const key of ["SLUG", "REDIRECTS", "DRAFT"]) {
      if (!columnSet.has(key)) {
        columns.push(key);
        columnSet.add(key);
      }
    }

    const nextRoot = { ...root, products, columns };
    if (nextRoot.version == null) {
      nextRoot.version = 1;
    }

    const result = await putFileContent(
      parsed.owner,
      parsed.repo,
      PRODUCT_DATA_PATH,
      `Update product: ${slug}`,
      `${JSON.stringify(nextRoot, null, 2)}\n`,
      branch,
      fileData.meta?.sha || null,
    );
    if (typeof window.productData?.clearProductHideOverlayForSku === "function") {
      window.productData.clearProductHideOverlayForSku(sku);
    }
    if (typeof window.productData?.clearProductDraftOverlayForSku === "function") {
      window.productData.clearProductDraftOverlayForSku(sku);
    }
    return {
      ...result,
      products,
      productRow: products[index],
    };
  }

  function filterTreePathsForPublish(treePaths, fileTree, products) {
    if (typeof window.displayFileTree?.filterPathsForPublish === "function") {
      return window.displayFileTree.filterPathsForPublish(fileTree, treePaths, products);
    }
    return Array.isArray(treePaths) ? treePaths : [];
  }

  function requireSelectedRepo() {
    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    return { fullName, ...parsed, branch: getBranch() };
  }

  function requireSelectedImagesRepo() {
    const fullName = getSelectedImagesRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select an images repository in the Images section.");
    }
    return { fullName, ...parsed, branch: getBranch() };
  }

  /**
   * @param {{
   *   owner: string,
   *   repo: string,
   *   branch?: string,
   *   message: string,
   *   upserts?: Array<{ path: string, base64: string }>,
   *   deletes?: Array<{ path: string }>,
   * }} options
   */
  async function commitGitTreeFiles({ owner, repo, branch, message, upserts, deletes }) {
    const upsertList = Array.isArray(upserts) ? upserts : [];
    const deleteList = Array.isArray(deletes) ? deletes : [];
    if (!upsertList.length && !deleteList.length) {
      throw new Error("No file changes to commit.");
    }

    async function commitOnce() {
      const refName = `heads/${branch || DEFAULT_BRANCH}`;
      const ref = await githubApi(`/repos/${owner}/${repo}/git/ref/${encodeURIComponent(refName)}`, {
        method: "GET",
      });
      const parentSha = ref?.object?.sha;
      if (!parentSha) {
        throw new Error(`Branch ref not found: ${branch}`);
      }
      const parentCommit = await githubApi(`/repos/${owner}/${repo}/git/commits/${parentSha}`, {
        method: "GET",
      });
      const baseTreeSha = parentCommit?.tree?.sha;
      if (!baseTreeSha) {
        throw new Error("Could not read base tree for commit.");
      }

      const blobShas = await mapWithConcurrency(upsertList, BLOB_CONCURRENCY, async (change) => {
        const blob = await githubApi(`/repos/${owner}/${repo}/git/blobs`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: change.base64,
            encoding: "base64",
          }),
        });
        if (!blob?.sha) {
          throw new Error(`Blob creation failed for ${change.path}`);
        }
        return { path: change.path, sha: blob.sha };
      });

      const treeEntries = [
        ...blobShas.map(({ path, sha }) => ({
          path,
          mode: "100644",
          type: "blob",
          sha,
        })),
        ...deleteList.map((change) => ({
          path: change.path,
          mode: "100644",
          type: "blob",
          sha: null,
        })),
      ];

      const tree = await githubApi(`/repos/${owner}/${repo}/git/trees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: treeEntries,
        }),
      });
      if (!tree?.sha) {
        throw new Error("Git tree creation failed.");
      }

      const commit = await githubApi(`/repos/${owner}/${repo}/git/commits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          tree: tree.sha,
          parents: [parentSha],
        }),
      });
      if (!commit?.sha) {
        throw new Error("Git commit creation failed.");
      }

      try {
        await githubApi(`/repos/${owner}/${repo}/git/refs/${encodeURIComponent(refName)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha: commit.sha, force: false }),
        });
      } catch (err) {
        if (err?.status === 422) {
          throw Object.assign(new Error("Branch moved during commit; retrying."), { retryable: true });
        }
        throw err;
      }
      return commit;
    }

    try {
      return await commitOnce();
    } catch (err) {
      if (err?.retryable) {
        return commitOnce();
      }
      throw err;
    }
  }

  /**
   * @param {{ message: string, files: Array<{ path: string, bytes: Uint8Array }>, deletes?: string[] }} options
   */
  async function commitImagesRepoBinaryFiles({ message, files, deletes }) {
    const { owner, repo, branch } = requireSelectedImagesRepo();
    const list = Array.isArray(files) ? files : [];
    if (!list.length) {
      throw new Error("No files to commit.");
    }
    const upserts = list.map((file) => ({
      path: file.path,
      base64: bytesToBase64(file.bytes),
    }));
    const deleteList = (Array.isArray(deletes) ? deletes : [])
      .map((path) => String(path || "").trim())
      .filter(Boolean)
      .map((path) => ({ path }));
    return commitGitTreeFiles({ owner, repo, branch, message, upserts, deletes: deleteList });
  }

  async function listAllRepoFilePathsRecursive(owner, repo, dirPath, branch) {
    const paths = [];
    async function walk(currentPath) {
      const entries = await listRepoDirectory(owner, repo, currentPath, branch);
      for (const entry of entries) {
        if (entry.type === "dir") {
          await walk(entry.path);
        } else {
          paths.push(entry.path);
        }
      }
    }
    const root = String(dirPath || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
    await walk(root);
    return paths;
  }

  /**
   * @param {{ message: string, paths: string[] }} options
   */
  async function deleteImagesRepoPaths({ message, paths }) {
    const { owner, repo, branch } = requireSelectedImagesRepo();
    const unique = Array.from(
      new Set((Array.isArray(paths) ? paths : []).map((p) => String(p || "").trim()).filter(Boolean)),
    );
    if (!unique.length) {
      throw new Error("Nothing to delete.");
    }
    const deletes = unique.map((path) => ({ path }));
    return commitGitTreeFiles({ owner, repo, branch, message, upserts: [], deletes });
  }

  /**
   * @param {{ path: string, name?: string, type: "dir" | "file" }} entry
   */
  async function deleteImagesRepoEntry(entry) {
    const { owner, repo, branch } = requireSelectedImagesRepo();
    const path = String(entry?.path || "").trim();
    if (!path) {
      throw new Error("Missing path to delete.");
    }
    const isDir = entry?.type === "dir";
    const paths = isDir
      ? await listAllRepoFilePathsRecursive(owner, repo, path, branch)
      : [path];
    if (!paths.length) {
      throw new Error(isDir ? "Folder is empty." : "Nothing to delete.");
    }
    const message = isDir ? `Delete folder ${path}` : `Delete ${path}`;
    return deleteImagesRepoPaths({ message, paths });
  }

  async function readRemoteManifest(owner, repo, branch) {
    const meta = await getFileMeta(owner, repo, MANIFEST_PATH, branch);
    if (!meta?.content) {
      return { version: 1, generatedAt: null, outputs: [] };
    }
    try {
      const json = JSON.parse(base64ToUtf8(meta.content));
      const outputs = Array.isArray(json?.outputs) ? json.outputs.map(String) : [];
      return {
        version: json?.version ?? 1,
        generatedAt: json?.generatedAt ?? null,
        outputs,
      };
    } catch {
      return { version: 1, generatedAt: null, outputs: [] };
    }
  }

  function buildManifestJson(outputs) {
    const list = Array.from(new Set(outputs.map(String).filter(Boolean))).sort();
    return {
      version: 1,
      generatedAt: new Date().toISOString(),
      outputs: list,
    };
  }

  function escapeXml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function getSiteOriginFromShopData(shopData) {
    const raw = shopData?.websites?.primary;
    if (!raw || typeof raw !== "string") {
      return "";
    }
    try {
      return new URL(raw).origin;
    } catch {
      return "";
    }
  }

  function outputRelativePathToPublicPath(outputPath) {
    const normalized = String(outputPath || "").trim().replace(/\\/g, "/");
    if (normalized === "index.html") {
      return "";
    }
    if (normalized.endsWith("/index.html")) {
      return normalized.slice(0, -"/index.html".length);
    }
    return null;
  }

  function outputRelativePathToLoc(siteOrigin, outputPath) {
    const publicPath = outputRelativePathToPublicPath(outputPath);
    if (publicPath === null) {
      return null;
    }
    if (!siteOrigin) {
      return publicPath ? `/${publicPath}` : "/";
    }
    return publicPath ? `${siteOrigin}/${publicPath}` : `${siteOrigin}/`;
  }

  function formatSitemapLastmod(isoTimestamp) {
    const date = new Date(isoTimestamp);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return date.toISOString().slice(0, 10);
  }

  function buildSitemapXml(outputs, shopData, generatedAt) {
    const siteOrigin = getSiteOriginFromShopData(shopData);
    const lastmod = formatSitemapLastmod(generatedAt);
    const urls = [];
    for (const outputPath of outputs) {
      if (SITEMAP_EXCLUDED_OUTPUTS.has(outputPath)) {
        continue;
      }
      const loc = outputRelativePathToLoc(siteOrigin, outputPath);
      if (!loc) {
        continue;
      }
      urls.push({ loc, lastmod });
    }
    urls.sort((a, b) => a.loc.localeCompare(b.loc));
    const lines = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ];
    for (const entry of urls) {
      lines.push("  <url>");
      lines.push(`    <loc>${escapeXml(entry.loc)}</loc>`);
      if (entry.lastmod) {
        lines.push(`    <lastmod>${escapeXml(entry.lastmod)}</lastmod>`);
      }
      lines.push("  </url>");
    }
    lines.push("</urlset>");
    return `${lines.join("\n")}\n`;
  }

  function buildRobotsTxt(shopData) {
    const siteOrigin = getSiteOriginFromShopData(shopData);
    const lines = ["User-agent: *", "Allow: /"];
    if (siteOrigin) {
      lines.push("", `Sitemap: ${siteOrigin}/sitemap.xml`);
    }
    return `${lines.join("\n")}\n`;
  }

  async function readShopDataFromRepo() {
    const { owner, repo, branch } = requireSelectedRepo();
    const remote = await readRepoJson(owner, repo, SHOP_DATA_PATH, branch);
    return remote.json && typeof remote.json === "object" ? remote.json : {};
  }

  function appendPublishIndexFiles(fileChanges, nextOutputs, shopData) {
    const manifest = buildManifestJson(nextOutputs);
    fileChanges.push({
      path: MANIFEST_PATH,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    });
    fileChanges.push({
      path: SITEMAP_PATH,
      content: buildSitemapXml(nextOutputs, shopData, manifest.generatedAt),
    });
    fileChanges.push({
      path: ROBOTS_PATH,
      content: buildRobotsTxt(shopData),
    });
    return manifest;
  }

  async function mapWithConcurrency(items, concurrency, worker) {
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      return [];
    }
    const results = new Array(list.length);
    let nextIndex = 0;
    async function runWorker() {
      for (;;) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= list.length) {
          break;
        }
        results[index] = await worker(list[index], index);
      }
    }
    const workers = Array.from({ length: Math.min(concurrency, list.length) }, () => runWorker());
    await Promise.all(workers);
    return results;
  }

  /**
   * @param {{ message: string, fileChanges: Array<{ path: string, content?: string, delete?: boolean }> }} options
   */
  async function publishSiteCommit({ message, fileChanges }) {
    const { owner, repo, branch } = requireSelectedRepo();
    const changes = Array.isArray(fileChanges) ? fileChanges : [];
    if (!changes.length) {
      throw new Error("No file changes to publish.");
    }
    const upserts = changes
      .filter((c) => c && !c.delete)
      .map((change) => ({
        path: change.path,
        base64: utf8ToBase64(String(change.content ?? "")),
      }));
    const deletes = changes.filter((c) => c && c.delete).map((change) => ({ path: change.path }));
    return commitGitTreeFiles({ owner, repo, branch, message, upserts, deletes });
  }

  async function loadNavigationBase(owner, repo, branch) {
    try {
      const { json } = await readRepoJson(owner, repo, NAVIGATION_PATH, branch);
      return json;
    } catch {
      if (typeof window.generateAnyPage?.fetchJson === "function") {
        return window.generateAnyPage.fetchJson("../../shared-assets/config/navigation.json");
      }
      return { items: [] };
    }
  }

  async function loadContentPageData(pagePath) {
    const normalized = normalizePagePath(pagePath);
    if (typeof window.generateContentBody?.loadContentPageJson === "function") {
      try {
        return await window.generateContentBody.loadContentPageJson(normalized);
      } catch {
        /* fall through to GitHub */
      }
    }
    const { owner, repo, branch } = requireSelectedRepo();
    const repoPath = pagePathToContentRepoPath(normalized);
    const meta = await getFileMeta(owner, repo, repoPath, branch);
    if (!meta?.content) {
      throw new Error(`Content page not found: ${normalized}`);
    }
    return JSON.parse(base64ToUtf8(meta.content));
  }

  function isTreeNodeDraft(node) {
    if (typeof window.displayFileTree?.isTreeNodeDraft === "function") {
      return window.displayFileTree.isTreeNodeDraft(node);
    }
    return node?.draft === true;
  }

  function getBlogSlugsFromFileTree(fileTree) {
    const items = Array.isArray(fileTree?.items) ? fileTree.items : [];
    const blogNode = items.find((item) => normalizePagePath(item?.href) === "blog");
    const children = Array.isArray(blogNode?.children) ? blogNode.children : [];
    return children
      .filter((child) => !isTreeNodeHidden(child) && !isTreeNodeDraft(child))
      .map((child) => {
        const href = normalizePagePath(child?.href || "");
        if (!href.startsWith("blog/") || href.length <= "blog/".length) {
          return null;
        }
        return href.slice("blog/".length);
      })
      .filter(Boolean);
  }

  async function buildContentPagesMap(fileTree, seedPages) {
    const map = new Map();
    if (seedPages && typeof seedPages.forEach === "function") {
      seedPages.forEach((value, key) => {
        map.set(normalizePagePath(key), value);
      });
    } else if (seedPages && typeof seedPages === "object") {
      for (const [key, value] of Object.entries(seedPages)) {
        map.set(normalizePagePath(key), value);
      }
    }
    const slugs = getBlogSlugsFromFileTree(fileTree);
    await Promise.all(
      slugs.map(async (slug) => {
        const pagePath = `blog/${slug}`;
        if (map.has(pagePath)) {
          return;
        }
        try {
          const pageData = await loadContentPageData(pagePath);
          map.set(pagePath, pageData);
        } catch {
          /* skip missing posts */
        }
      }),
    );
    return map;
  }

  /**
   * @param {{ fileTree: object, navigation?: object, products: object[], contentPages?: Map | object }} partial
   */
  async function buildPublishContext(partial) {
    const fileTree = partial?.fileTree && typeof partial.fileTree === "object" ? partial.fileTree : { items: [] };
    const { owner, repo, branch } = requireSelectedRepo();
    const navigationBase = await loadNavigationBase(owner, repo, branch);
    const navigation = syncNavigationFromFileTree(fileTree, navigationBase);
    const products = Array.isArray(partial?.products) ? partial.products : [];
    const contentPages = await buildContentPagesMap(fileTree, partial?.contentPages);
    return { fileTree, navigation, products, contentPages };
  }

  function treePathToOutputRelativePath(treePath, homePageHref) {
    if (typeof window.displayFileTree?.treePathToOutputRelativePath === "function") {
      return window.displayFileTree.treePathToOutputRelativePath(treePath, homePageHref);
    }
    const folder =
      typeof window.displayFileTree?.treePathToDownloadFolderName === "function"
        ? window.displayFileTree.treePathToDownloadFolderName(treePath, homePageHref)
        : String(treePath || "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
    if (!folder) {
      return "index.html";
    }
    return `${folder}/index.html`;
  }

  function getHomePageHrefFromFileTree(fileTree) {
    return window.homePage?.getHomePageHref ? window.homePage.getHomePageHref(fileTree) : null;
  }

  async function ensurePreviewGeneratorsLoaded() {
    if (typeof window.loadPreviewGenerators === "function") {
      await window.loadPreviewGenerators();
      return;
    }
    throw new Error("Page generators are not available. Open from the site generator hub.");
  }

  async function generateHtmlForTreePath(treePath, publishContext) {
    await ensurePreviewGeneratorsLoaded();
    if (typeof window.generateAnyPage?.generateAnyPage !== "function") {
      throw new Error("generateAnyPage is not loaded.");
    }
    const options = publishContext ? { publishContext } : {};
    return window.generateAnyPage.generateAnyPage(treePath, options);
  }

  function uniqueOutputPaths(treePaths, homePageHref) {
    const seen = new Set();
    const outputs = [];
    for (const treePath of treePaths) {
      const rel = treePathToOutputRelativePath(treePath, homePageHref);
      if (!rel || seen.has(rel)) {
        continue;
      }
      seen.add(rel);
      outputs.push(rel);
    }
    return outputs;
  }

  function getContentPagePublishTreePaths(targetPagePath) {
    const path = normalizePagePath(targetPagePath);
    const paths = [path];
    if (isBlogPagePath(path)) {
      paths.push("blog");
    }
    return paths;
  }

  function getProductPublishTreePaths(pagePath, products) {
    const slug = parseProductSlugFromPagePath(pagePath);
    if (!slug) {
      throw new Error(`Invalid product path for publish: ${pagePath}`);
    }
    const paths = [`shop/${slug}`];
    const find = window.productData?.findProductBySlug;
    const row = typeof find === "function" ? find(products, slug) : null;
    if (row && typeof window.productData?.getProductsByCategory === "function") {
      const categories = window.productData.getProductsByCategory(products);
      const categoryName = String(row.CATEGORY || "").trim();
      const match = categories.find((c) => String(c.name || "").trim() === categoryName);
      if (match?.slug) {
        paths.push(`shop/${match.slug}`);
      }
    }
    paths.push("shop");
    return paths;
  }

  async function publishHtmlOutputs({
    message,
    treePaths,
    publishContext,
    homePageHref,
    mergeManifest = true,
    deleteStaleFromManifest = false,
    fileTree = null,
    products = [],
  }) {
    const { owner, repo, branch } = requireSelectedRepo();
    const draftTree =
      fileTree && typeof fileTree === "object"
        ? fileTree
        : publishContext?.fileTree && typeof publishContext.fileTree === "object"
          ? publishContext.fileTree
          : { items: [] };
    const draftProducts = Array.isArray(products) && products.length
      ? products
      : Array.isArray(publishContext?.products)
        ? publishContext.products
        : [];
    const publishablePaths = filterTreePathsForPublish(treePaths, draftTree, draftProducts);
    const outputPaths = uniqueOutputPaths(publishablePaths, homePageHref);
    const fileChanges = [];
    const generatedByPath = new Map();
    for (let i = 0; i < publishablePaths.length; i += 1) {
      const treePath = publishablePaths[i];
      const relPath = treePathToOutputRelativePath(treePath, homePageHref);
      if (!relPath || generatedByPath.has(relPath)) {
        continue;
      }
      const html = await generateHtmlForTreePath(treePath, publishContext);
      generatedByPath.set(relPath, html);
    }
    for (const [path, content] of generatedByPath) {
      fileChanges.push({ path, content });
    }

    const oldManifest = await readRemoteManifest(owner, repo, branch);
    let nextOutputs = outputPaths.slice();
    if (mergeManifest) {
      const merged = new Set(oldManifest.outputs || []);
      for (const path of outputPaths) {
        merged.add(path);
      }
      nextOutputs = Array.from(merged).sort();
    }
    if (deleteStaleFromManifest) {
      const stale = (oldManifest.outputs || []).filter((path) => !nextOutputs.includes(path));
      for (const path of stale) {
        fileChanges.push({ path, delete: true });
      }
    }
    const shopData = await readShopDataFromRepo();
    const manifest = appendPublishIndexFiles(fileChanges, nextOutputs, shopData);

    const commit = await publishSiteCommit({ message, fileChanges });
    return { commit, manifest, outputPaths: nextOutputs };
  }

  /**
   * @param {string} pagePath
   * @param {object} pageData
   * @param {{ fileTree?: object, products?: object[], onProgress?: (msg: string) => void }} [options]
   */
  async function publishContentPageLive(pagePath, pageData, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    onProgress("Preparing publish context…");
    let fileTree = options.fileTree;
    let products = options.products;
    if (!fileTree || !products) {
      const { owner, repo, branch } = requireSelectedRepo();
      if (!fileTree) {
        const remoteTree = await readRepoJson(owner, repo, FILE_TREE_PATH, branch);
        fileTree = remoteTree.json;
      }
      if (!products) {
        const remoteProducts = await readRepoJson(owner, repo, PRODUCT_DATA_PATH, branch);
        products = Array.isArray(remoteProducts.json?.products) ? remoteProducts.json.products : [];
      }
    }
    const mutablePageData =
      pageData && typeof pageData === "object" ? JSON.parse(JSON.stringify(pageData)) : { meta: {}, blocks: [] };
    let targetPagePath = normalizePagePath(pagePath);
    if (isBlogPagePath(targetPagePath)) {
      const newSlug = resolveBlogSlug(mutablePageData, targetPagePath);
      mutablePageData.slug = newSlug;
      targetPagePath = `blog/${newSlug}`;
    } else {
      const newSlug = slugify(mutablePageData?.slug || mutablePageData?.meta?.title || targetPagePath);
      if (newSlug) {
        mutablePageData.slug = newSlug;
        targetPagePath = newSlug;
      }
    }
    const contentPages = new Map();
    contentPages.set(targetPagePath, mutablePageData);
    const publishContext = await buildPublishContext({ fileTree, products, contentPages });
    const homePageHref = getHomePageHrefFromFileTree(fileTree);
    const treePaths = getContentPagePublishTreePaths(targetPagePath);
    onProgress(`Generating ${treePaths.length} page${treePaths.length === 1 ? "" : "s"}…`);
    onProgress("Uploading…");
    return publishHtmlOutputs({
      message: `Publish content: ${targetPagePath}`,
      treePaths,
      publishContext,
      homePageHref,
      mergeManifest: true,
      deleteStaleFromManifest: false,
    });
  }

  /**
   * @param {string} pagePath
   * @param {object} productRow
   * @param {{ products?: object[], onProgress?: (msg: string) => void }} [options]
   */
  async function publishProductPageLive(pagePath, productRow, options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    onProgress("Preparing publish context…");
    let products = options.products;
    let fileTree;
    const { owner, repo, branch } = requireSelectedRepo();
    if (!products) {
      const remoteProducts = await readRepoJson(owner, repo, PRODUCT_DATA_PATH, branch);
      products = Array.isArray(remoteProducts.json?.products) ? remoteProducts.json.products : [];
    }
    const remoteTree = await readRepoJson(owner, repo, FILE_TREE_PATH, branch);
    fileTree = remoteTree.json;
    const sku = String(productRow?.SKU ?? "").trim();
    const index = findProductRowIndexBySku(products, sku);
    if (index >= 0) {
      const existing = products[index] && typeof products[index] === "object" ? products[index] : {};
      products = products.slice();
      products[index] = { ...existing, ...productRow, SKU: existing.SKU ?? sku };
    }
    const publishContext = await buildPublishContext({ fileTree, products });
    const homePageHref = getHomePageHrefFromFileTree(fileTree);
    const treePaths = getProductPublishTreePaths(pagePath, products);
    onProgress(`Generating ${treePaths.length} page${treePaths.length === 1 ? "" : "s"}…`);
    onProgress("Uploading…");
    return publishHtmlOutputs({
      message: `Publish product: ${parseProductSlugFromPagePath(pagePath) || pagePath}`,
      treePaths,
      publishContext,
      homePageHref,
      mergeManifest: true,
      deleteStaleFromManifest: false,
    });
  }

  /**
   * @param {{ onProgress?: (msg: string) => void }} [options]
   */
  async function publishFullSite(options = {}) {
    const onProgress = typeof options.onProgress === "function" ? options.onProgress : () => {};
    onProgress("Loading site structure…");
    if (typeof window.displayFileTree?.buildPopulatedFileTree !== "function") {
      throw new Error("displayFileTree.buildPopulatedFileTree is required for full-site publish.");
    }
    const populatedTree = await window.displayFileTree.buildPopulatedFileTree(null, null);
    const collectPaths =
      typeof window.displayFileTree?.collectAllKnownPaths === "function"
        ? window.displayFileTree.collectAllKnownPaths
        : null;
    if (!collectPaths) {
      throw new Error("displayFileTree.collectAllKnownPaths is required for full-site publish.");
    }
    const allPaths = Array.from(collectPaths(populatedTree)).sort();
    const exportableTree =
      typeof window.displayFileTree?.getExportableFileTree === "function"
        ? window.displayFileTree.getExportableFileTree(populatedTree)
        : populatedTree;
    const { owner, repo, branch } = requireSelectedRepo();
    const remoteProducts = await readRepoJson(owner, repo, PRODUCT_DATA_PATH, branch);
    const products = Array.isArray(remoteProducts.json?.products) ? remoteProducts.json.products : [];
    const treePaths =
      typeof window.displayFileTree?.filterPathsForPublish === "function"
        ? window.displayFileTree.filterPathsForPublish(exportableTree, allPaths, products)
        : allPaths;
    const publishContext = await buildPublishContext({ fileTree: exportableTree, products });
    const homePageHref = getHomePageHrefFromFileTree(exportableTree);
    const fileChanges = [];
    const generatedByPath = new Map();
    for (let i = 0; i < treePaths.length; i += 1) {
      const treePath = treePaths[i];
      onProgress(`Generating ${i + 1}/${treePaths.length}: ${treePath}`);
      const relPath = treePathToOutputRelativePath(treePath, homePageHref);
      if (!relPath || generatedByPath.has(relPath)) {
        continue;
      }
      const html = await generateHtmlForTreePath(treePath, publishContext);
      generatedByPath.set(relPath, html);
    }
    for (const [path, content] of generatedByPath) {
      fileChanges.push({ path, content });
    }
    const outputPaths = Array.from(generatedByPath.keys()).sort();
    const oldManifest = await readRemoteManifest(owner, repo, branch);
    const nextOutputs = Array.from(new Set(outputPaths)).sort();
    const stale = (oldManifest.outputs || []).filter((path) => !nextOutputs.includes(path));
    for (const path of stale) {
      fileChanges.push({ path, delete: true });
    }
    const shopData = await readShopDataFromRepo();
    const manifest = appendPublishIndexFiles(fileChanges, nextOutputs, shopData);
    onProgress("Uploading…");
    const commit = await publishSiteCommit({
      message: "Publish full site",
      fileChanges,
    });
    return { commit, manifest, outputPaths: nextOutputs };
  }

  /**
   * Apply sparse field patches to productData.json in one commit.
   * @param {Array<{ sku: string, column: string, value: unknown }>} patches
   * @param {{ commitMessage?: string }} [options]
   */
  async function pushProductDataPatches(patches, options = {}) {
    const list = Array.isArray(patches) ? patches : [];
    const newProducts = Array.isArray(options.newProducts) ? options.newProducts : [];
    if (!list.length && !newProducts.length) {
      throw new Error("No product data changes selected.");
    }

    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    const branch = getBranch();

    const fileData = await readRepoJson(parsed.owner, parsed.repo, PRODUCT_DATA_PATH, branch);
    const root = fileData.json && typeof fileData.json === "object" ? fileData.json : {};
    const products = Array.isArray(root.products) ? root.products.slice() : [];
    const columns = Array.isArray(root.columns) ? root.columns.slice() : [];
    const columnSet = new Set(columns);

    const touchedSkus = new Set();
    for (const patch of list) {
      const sku = String(patch?.sku ?? "").trim();
      const column = String(patch?.column ?? "").trim();
      if (!sku || !column || column === "SKU") {
        continue;
      }
      const index = findProductRowIndexBySku(products, sku);
      if (index < 0) {
        throw new Error(`Product SKU ${sku} not found in remote productData.json`);
      }
      const existing =
        products[index] && typeof products[index] === "object" ? { ...products[index] } : {};
      existing[column] = patch.value;
      products[index] = existing;
      touchedSkus.add(sku);
    }

    for (const row of newProducts) {
      const sku = String(row?.SKU ?? "").trim();
      if (!sku) {
        continue;
      }
      if (findProductRowIndexBySku(products, sku) >= 0) {
        throw new Error(`Product SKU ${sku} already exists in productData.json`);
      }
      products.push(row);
      touchedSkus.add(sku);
      for (const key of Object.keys(row)) {
        if (key && !columnSet.has(key)) {
          columns.push(key);
          columnSet.add(key);
        }
      }
    }

    const nextRoot = { ...root, products, columns };
    if (nextRoot.version == null) {
      nextRoot.version = 1;
    }

    const cellCount = list.filter((p) => String(p?.sku ?? "").trim() && String(p?.column ?? "").trim()).length;
    const newCount = newProducts.filter((row) => String(row?.SKU ?? "").trim()).length;
    const productCount = touchedSkus.size;
    const messageParts = [];
    if (cellCount) {
      messageParts.push(`${cellCount} field update${cellCount === 1 ? "" : "s"}`);
    }
    if (newCount) {
      messageParts.push(`${newCount} new product${newCount === 1 ? "" : "s"}`);
    }
    const commitMessage =
      String(options.commitMessage || "").trim() ||
      `Merge product CSV: ${messageParts.join(", ")} on ${productCount} product${productCount === 1 ? "" : "s"}`;

    const result = await putFileContent(
      parsed.owner,
      parsed.repo,
      PRODUCT_DATA_PATH,
      commitMessage,
      `${JSON.stringify(nextRoot, null, 2)}\n`,
      branch,
      fileData.meta?.sha || null,
    );

    if (typeof window.productData?.clearProductHideOverlayForSku === "function") {
      for (const sku of touchedSkus) {
        window.productData.clearProductHideOverlayForSku(sku);
      }
    }
    return result;
  }

  /**
   * Write the locally reordered products array (and category moves) to productData.json.
   */
  async function pushProductOrder() {
    if (typeof window.productData?.hasProductOrderOverlay !== "function") {
      throw new Error("Product order overlay is not available.");
    }
    if (!window.productData.hasProductOrderOverlay()) {
      throw new Error("No product order changes to save.");
    }

    const fullName = getSelectedRepo();
    const parsed = parseRepoFullName(fullName);
    if (!parsed) {
      throw new Error("Select a GitHub repository on the site generator picker page.");
    }
    const branch = getBranch();

    const localData = await window.productData.fetchProductDataJson();
    const localProducts = Array.isArray(localData?.products) ? localData.products : [];
    const orderSkus = localProducts
      .map((row) => String(row?.SKU ?? "").trim())
      .filter(Boolean);
    if (!orderSkus.length) {
      throw new Error("No products in local order to save.");
    }

    const categoryOverlay =
      typeof window.productData?.readProductCategoryOverlay === "function"
        ? window.productData.readProductCategoryOverlay()
        : {};

    const fileData = await readRepoJson(parsed.owner, parsed.repo, PRODUCT_DATA_PATH, branch);
    const root = fileData.json && typeof fileData.json === "object" ? fileData.json : {};
    const remoteProducts = Array.isArray(root.products) ? root.products : [];
    const bySku = new Map();
    for (const row of remoteProducts) {
      const sku = String(row?.SKU ?? "").trim();
      if (sku) {
        bySku.set(sku, row);
      }
    }

    const used = new Set();
    const reordered = [];
    for (const sku of orderSkus) {
      if (!sku || used.has(sku)) {
        continue;
      }
      const remote = bySku.get(sku);
      if (!remote) {
        continue;
      }
      const next = { ...remote };
      if (Object.prototype.hasOwnProperty.call(categoryOverlay, sku)) {
        next.CATEGORY = categoryOverlay[sku];
      }
      reordered.push(next);
      used.add(sku);
    }
    for (const row of remoteProducts) {
      const sku = String(row?.SKU ?? "").trim();
      if (!sku || used.has(sku)) {
        continue;
      }
      reordered.push(row);
      used.add(sku);
    }

    const nextRoot = { ...root, products: reordered };
    if (nextRoot.version == null) {
      nextRoot.version = 1;
    }

    const result = await putFileContent(
      parsed.owner,
      parsed.repo,
      PRODUCT_DATA_PATH,
      "Reorder products in productData.json",
      `${JSON.stringify(nextRoot, null, 2)}\n`,
      branch,
      fileData.meta?.sha || null,
    );

    if (typeof window.productData?.clearProductOrderOverlay === "function") {
      window.productData.clearProductOrderOverlay();
    }
    if (typeof window.productData?.clearProductCategoryOverlay === "function") {
      window.productData.clearProductCategoryOverlay();
    }

    return result;
  }

  function assertRedirectUriAllowed(callback) {
    let url;
    try {
      url = new URL(callback);
    } catch {
      throw new Error("Callback URL is invalid. Fix it in the GitHub panel before signing in.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(
        "Callback URL must be http or https (serve the repo with Live Server, not file://). Check the GitHub panel.",
      );
    }
  }

  async function startSignIn() {
    const checked = validateClientId(getClientId());
    if (!checked.ok) {
      throw new Error(checked.message);
    }
    const clientId = checked.clientId;
    const callback = resolveHubIndexUrl();
    assertRedirectUriAllowed(callback);

    const verifier = randomUrlSafeString(32);
    const challenge = await pkceChallengeFromVerifier(verifier);
    const state = randomUrlSafeString(16);
    sessionStorage.setItem(STORAGE.pkceVerifier, verifier);
    sessionStorage.setItem(STORAGE.oauthState, state);
    sessionStorage.setItem(STORAGE.redirectUriAtSignIn, callback);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callback,
      scope: OAUTH_SCOPE,
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    const authorizeUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
    if (!params.get("client_id")) {
      throw new Error("Client ID is empty. Save your Client ID in the GitHub panel first.");
    }
    window.location.assign(authorizeUrl);
  }

  function wrapOAuthNetworkError(err) {
    const msg = err?.message || String(err);
    if (msg === "Failed to fetch" || /networkerror/i.test(msg)) {
      return new Error(
        "Sign-in could not finish: GitHub blocked the token request from the browser (CORS). " +
          "Use the same tab for the whole flow, or add a small server endpoint to exchange the code.",
      );
    }
    return err instanceof Error ? err : new Error(msg);
  }

  async function handleOAuthCallbackIfPresent() {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");

    if (error) {
      stripOAuthQueryFromUrl();
      clearOAuthPending();
      const desc = params.get("error_description") || error;
      throw new Error(desc);
    }
    if (!code) {
      return false;
    }

    try {
      const expectedState = sessionStorage.getItem(STORAGE.oauthState);
      const verifier = sessionStorage.getItem(STORAGE.pkceVerifier);

      if (!expectedState || state !== expectedState) {
        throw new Error(
          "OAuth state mismatch. The sign-in session was lost or this page was reloaded after a failed attempt. " +
            "Click Sign in with GitHub below (same browser tab).",
        );
      }
      if (!verifier) {
        throw new Error("OAuth session expired. Click Sign in with GitHub below.");
      }

      const clientId = getClientId();
      const exchangeRedirectUri = redirectUri();
      let response;
      try {
        response = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            code,
            redirect_uri: exchangeRedirectUri,
            code_verifier: verifier,
          }),
        });
      } catch (networkErr) {
        throw wrapOAuthNetworkError(networkErr);
      }

      if (!response.ok) {
        throw new Error(`Token exchange failed (${response.status})`);
      }
      const data = await response.json();
      if (data.error) {
        throw new Error(data.error_description || data.error);
      }
      if (!data.access_token) {
        throw new Error("No access token returned from GitHub.");
      }

      clearOAuthPending();
      sessionStorage.setItem(STORAGE.token, data.access_token);
      const user = await fetchCurrentUser(data.access_token);
      if (user?.login) {
        sessionStorage.setItem(STORAGE.login, user.login);
      }

      stripOAuthQueryFromUrl();
      return true;
    } catch (err) {
      clearOAuthPending();
      stripOAuthQueryFromUrl();
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  function signOut() {
    clearSession();
  }

  function buildRepoSelectOptions(repos, selected) {
    const opts = ['<option value="">— Select repository —</option>'];
    for (const r of repos) {
      const name = r.full_name;
      const sel = name === selected ? " selected" : "";
      opts.push(`<option value="${escapeAttr(name)}"${sel}>${escapeHtml(name)}</option>`);
    }
    return opts.join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function renderPatForm(root, noticeHtml) {
    const configNote = getConfigPat()
      ? `<p class="github-auth-muted">A token in <code>githubAuth.config.js</code> is used when the field below is empty.</p>`
      : "";
    root.innerHTML = `<h2>GitHub</h2>
${noticeHtml || ""}
<p class="github-auth-muted">Paste a <strong>personal access token</strong> with permission to write repository contents. It is stored in this browser only until you sign out.</p>
<p class="github-auth-muted">Create one: <a href="https://github.com/settings/tokens?type=beta" target="_blank" rel="noopener noreferrer">Fine-grained token</a> (Contents: Read and write on your repos) or <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">classic token</a> (<code>repo</code> scope).</p>
${configNote}
<div class="github-auth-row github-auth-pat-row">
  <label for="github-pat-input">Access token</label>
  <input id="github-pat-input" type="password" data-github-pat-input value="" placeholder="github_pat_… or ghp_…" autocomplete="off" spellcheck="false" aria-label="GitHub personal access token" />
  <button type="button" class="github-auth-btn github-auth-btn-primary" data-github-save-pat>Save &amp; connect</button>
</div>
<div class="github-auth-error" data-github-hub-error hidden></div>`;

    const input = root.querySelector("[data-github-pat-input]");
    const saveBtn = root.querySelector("[data-github-save-pat]");
    const runSave = () => {
      const raw = String(input?.value || "");
      if (!normalizePat(raw)) {
        showHubError(root, new Error("Enter an access token."));
        return;
      }
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = "Verifying…";
      }
      hideHubError(root);
      savePatAndVerify(raw)
        .then(() => {
          if (input) {
            input.value = "";
          }
          return initHubUi(root);
        })
        .catch((err) => showHubError(root, err))
        .finally(() => {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save & connect";
          }
        });
    };
    saveBtn?.addEventListener("click", runSave);
    input?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSave();
      }
    });
  }

  function hideHubError(root) {
    const el = root.querySelector("[data-github-hub-error]");
    if (el) {
      el.hidden = true;
      el.textContent = "";
    }
  }

  /**
   * @param {HTMLElement | null} root
   */
  function migrateStoredClientId() {
    const raw = localStorage.getItem(STORAGE.clientId);
    if (!raw) {
      return;
    }
    const norm = normalizeClientId(raw);
    const check = validateClientId(norm);
    if (!check.ok) {
      localStorage.removeItem(STORAGE.clientId);
      return;
    }
    if (norm !== raw) {
      localStorage.setItem(STORAGE.clientId, norm);
    }
  }

  function buildOAuthNoticeHtml(message) {
    if (!message) {
      return "";
    }
    return `<div class="github-auth-oauth-banner" role="alert">${escapeHtml(message)}</div>`;
  }

  /**
   * @param {HTMLElement | null} root
   * @param {{ oauthError?: string }} [options]
   */
  async function initHubUi(root, options) {
    if (!root) {
      return;
    }
    stripOAuthQueryFromUrl();
    const noticeHtml = buildOAuthNoticeHtml(options?.oauthError || "");

    const render = async () => {
      if (!isSignedIn()) {
        renderPatForm(root, noticeHtml);
        return;
      }

      let login = getLogin();
      if (!login) {
        try {
          const user = await fetchCurrentUser();
          if (user?.login) {
            localStorage.setItem(STORAGE.login, user.login);
            login = user.login;
          }
        } catch {
          /* show connected without name */
        }
      }

      const selectedRepo = getSelectedRepo();
      const branch = getBranch();
      const loginLine = login
        ? `<p class="github-auth-status">Connected as <strong>${escapeHtml(login)}</strong></p>`
        : `<p class="github-auth-status">Token saved — connected to GitHub</p>`;

      root.innerHTML = `<h2>GitHub</h2>
${loginLine}
<div class="github-auth-row">
  <label for="github-repo-select">Repository</label>
  <select id="github-repo-select" data-github-repo-select aria-label="GitHub repository">${buildRepoSelectOptions([], selectedRepo)}</select>
  <label for="github-branch-input">Branch</label>
  <input id="github-branch-input" type="text" data-github-branch-input value="${escapeAttr(branch)}" aria-label="Branch name" />
  <button type="button" class="github-auth-btn" data-github-refresh-repos>Refresh repos</button>
  <button type="button" class="github-auth-btn" data-github-change-pat>Change token</button>
  <button type="button" class="github-auth-btn" data-github-sign-out>Sign out</button>
</div>
<p class="github-auth-muted">Token and repo choice are remembered on this device until you sign out. Use <strong>Push to GitHub</strong> in the content editor.</p>
<div class="github-auth-error" data-github-hub-error hidden></div>`;

      const select = root.querySelector("[data-github-repo-select]");
      const branchInput = root.querySelector("[data-github-branch-input]");

      select?.addEventListener("change", () => {
        setSelectedRepo(select.value);
      });
      branchInput?.addEventListener("change", () => {
        setBranch(branchInput.value);
      });

      root.querySelector("[data-github-sign-out]")?.addEventListener("click", () => {
        signOut();
        render().catch((err) => showHubError(root, err));
      });

      root.querySelector("[data-github-change-pat]")?.addEventListener("click", () => {
        signOut();
        render().catch((err) => showHubError(root, err));
      });

      root.querySelector("[data-github-refresh-repos]")?.addEventListener("click", () => {
        loadReposIntoSelect(select, selectedRepo).catch((err) => showHubError(root, err));
      });

      await loadReposIntoSelect(select, selectedRepo);
    };

    await render();
  }

  function showHubError(root, err) {
    const el = root.querySelector("[data-github-hub-error]");
    if (el) {
      el.hidden = false;
      el.textContent = err?.message || String(err);
    } else {
      window.alert(err?.message || String(err));
    }
  }

  async function loadReposIntoSelect(select, selected) {
    if (!select) {
      return;
    }
    select.disabled = true;
    try {
      const repos = await fetchWritableRepos();
      select.innerHTML = buildRepoSelectOptions(repos, selected || getSelectedRepo());
      if (!getSelectedRepo() && repos.length === 1) {
        select.value = repos[0].full_name;
        setSelectedRepo(repos[0].full_name);
      }
    } finally {
      select.disabled = false;
    }
  }

  function ensureGithubStylesheet() {
    if (document.querySelector('link[rel="stylesheet"][href$="githubAuth.css"]')) {
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./githubAuth.css";
    document.head.appendChild(link);
  }

  /**
   * @param {{
   *   pagePath: string,
   *   getPageData: () => object,
   *   pushHandler?: (pagePath: string, data: object) => Promise<unknown>,
   *   publishHandler?: (pagePath: string, data: object, ctx?: object) => Promise<unknown>,
   *   buildPublishOptions?: (pushResult?: object) => Promise<object> | object,
   * }} options
   */
  function initEditPushUi(options) {
    const pagePath = options?.pagePath;
    const getPageData = options?.getPageData;
    const pushHandler =
      typeof options?.pushHandler === "function" ? options.pushHandler : pushContentPage;
    const publishHandler = options?.publishHandler;
    const buildPublishOptions = options?.buildPublishOptions;
    const root = document.querySelector("[data-github-push-root]");
    if (!root || !pagePath || typeof getPageData !== "function") {
      return;
    }

    ensureGithubStylesheet();

    const bindAction = (selector, runner) => {
      root.querySelector(selector)?.addEventListener("click", () => {
        runner().catch((err) => {
          setPushStatus(root, err?.message || String(err), "error");
        });
      });
    };

    const updateUi = () => {
      if (!isSignedIn()) {
        root.innerHTML = `<span class="github-auth-push-status">Save token on picker</span>`;
        return;
      }
      if (!getSelectedRepo()) {
        root.innerHTML = `<span class="github-auth-push-status">Select repo on picker</span>`;
        return;
      }
      const publishBtn =
        typeof publishHandler === "function"
          ? `<button type="button" class="github-auth-push-btn github-auth-push-btn--publish" data-github-publish>Publish HTML</button>`
          : "";
      const pushPublishBtn =
        typeof publishHandler === "function"
          ? `<button type="button" class="github-auth-push-btn github-auth-push-btn--primary" data-github-push-publish>Push &amp; publish</button>`
          : "";
      root.innerHTML = `${pushPublishBtn}
<button type="button" class="github-auth-push-btn" data-github-push>Push to GitHub</button>
${publishBtn}
<span class="github-auth-push-status" data-github-push-status>${escapeHtml(getSelectedRepo())}@${escapeHtml(getBranch())}</span>`;
      bindAction("[data-github-push]", () => runPush(root, pagePath, getPageData, pushHandler));
      if (typeof publishHandler === "function") {
        bindAction("[data-github-publish]", () =>
          runPublish(root, pagePath, getPageData, publishHandler, buildPublishOptions),
        );
        bindAction("[data-github-push-publish]", () =>
          runPushAndPublish(root, pagePath, getPageData, pushHandler, publishHandler, buildPublishOptions),
        );
      }
    };

    updateUi();
  }

  function setPushStatus(root, message, kind) {
    const el = root.querySelector("[data-github-push-status]");
    if (!el) {
      return;
    }
    el.textContent = message;
    el.classList.remove("github-auth-push-status--error", "github-auth-push-status--ok");
    if (kind === "error") {
      el.classList.add("github-auth-push-status--error");
    } else if (kind === "ok") {
      el.classList.add("github-auth-push-status--ok");
    }
  }

  function setPushButtonsDisabled(root, disabled) {
    root.querySelectorAll("[data-github-push], [data-github-publish], [data-github-push-publish]").forEach((btn) => {
      btn.disabled = disabled;
    });
  }

  async function runPush(root, pagePath, getPageData, pushHandler) {
    setPushButtonsDisabled(root, true);
    setPushStatus(root, "Pushing…", null);
    try {
      const data = getPageData();
      const pushFn = typeof pushHandler === "function" ? pushHandler : pushContentPage;
      const result = await pushFn(pagePath, data);
      const sha = result?.commit?.sha || result?.sha;
      const short = sha ? String(sha).slice(0, 7) : "ok";
      setPushStatus(root, `Pushed (${short})`, "ok");
      return result;
    } finally {
      setPushButtonsDisabled(root, false);
    }
  }

  async function runPublish(root, pagePath, getPageData, publishHandler, buildPublishOptions) {
    setPushButtonsDisabled(root, true);
    setPushStatus(root, "Publishing…", null);
    try {
      const data = getPageData();
      const extra =
        typeof buildPublishOptions === "function" ? await buildPublishOptions() : buildPublishOptions || {};
      const onProgress = (msg) => setPushStatus(root, msg, null);
      const result = await publishHandler(pagePath, data, { ...extra, onProgress });
      const sha = result?.commit?.sha;
      const short = sha ? sha.slice(0, 7) : "ok";
      setPushStatus(root, `Published (${short})`, "ok");
      return result;
    } finally {
      setPushButtonsDisabled(root, false);
    }
  }

  async function runPushAndPublish(
    root,
    pagePath,
    getPageData,
    pushHandler,
    publishHandler,
    buildPublishOptions,
  ) {
    setPushButtonsDisabled(root, true);
    setPushStatus(root, "Pushing source…", null);
    try {
      const data = getPageData();
      const pushFn = typeof pushHandler === "function" ? pushHandler : pushContentPage;
      const pushResult = await pushFn(pagePath, data);
      setPushStatus(root, "Publishing HTML…", null);
      const extra =
        typeof buildPublishOptions === "function"
          ? await buildPublishOptions(pushResult)
          : buildPublishOptions || {};
      const onProgress = (msg) => setPushStatus(root, msg, null);
      const publishResult = await publishHandler(pagePath, data, { ...extra, onProgress });
      const sha = publishResult?.commit?.sha || pushResult?.commit?.sha;
      const short = sha ? String(sha).slice(0, 7) : "ok";
      setPushStatus(root, `Pushed & published (${short})`, "ok");
      return publishResult;
    } finally {
      setPushButtonsDisabled(root, false);
    }
  }

  function initPublishSiteUi(root) {
    if (!root) {
      return;
    }
    ensureGithubStylesheet();
    const render = () => {
      if (!isSignedIn()) {
        root.innerHTML = `<span class="github-auth-push-status">Sign in above to publish the site.</span>`;
        return;
      }
      if (!getSelectedRepo()) {
        root.innerHTML = `<span class="github-auth-push-status">Select a repository above to publish.</span>`;
        return;
      }
      root.innerHTML = `<button type="button" class="github-auth-btn github-auth-btn-primary" data-github-publish-site>Publish site</button>
<span class="github-auth-push-status" data-github-publish-site-status>${escapeHtml(getSelectedRepo())}@${escapeHtml(getBranch())}</span>`;
      const btn = root.querySelector("[data-github-publish-site]");
      const status = root.querySelector("[data-github-publish-site-status]");
      btn?.addEventListener("click", async () => {
        btn.disabled = true;
        const setStatus = (msg, kind) => {
          if (!status) {
            return;
          }
          status.textContent = msg;
          status.classList.remove("github-auth-push-status--error", "github-auth-push-status--ok");
          if (kind === "error") {
            status.classList.add("github-auth-push-status--error");
          } else if (kind === "ok") {
            status.classList.add("github-auth-push-status--ok");
          }
        };
        try {
          setStatus("Starting full-site publish…", null);
          const result = await publishFullSite({
            onProgress: (msg) => setStatus(msg, null),
          });
          const sha = result?.commit?.sha;
          const short = sha ? sha.slice(0, 7) : "ok";
          setStatus(`Published site (${short})`, "ok");
        } catch (err) {
          setStatus(err?.message || String(err), "error");
        } finally {
          btn.disabled = false;
        }
      });
    };
    render();
  }

  window.githubAuth = {
    isSignedIn,
    getPat,
    setPat,
    clearPat,
    savePatAndVerify,
    validatePat,
    getClientId,
    getConfigClientId,
    hasConfigClientId,
    setClientId,
    clearClientId,
    getToken,
    getLogin,
    getSelectedRepo,
    getSelectedImagesRepo,
    getBranch,
    setSelectedRepo,
    setSelectedImagesRepo,
    setBranch,
    fetchWritableRepos,
    listRepoDirectory,
    buildRawContentUrl,
    buildRawRefsContentUrl,
    buildMediaContentUrl,
    buildBlobRawContentUrl,
    getFileMeta,
    parseRepoFullName,
    signOut,
    startSignIn,
    handleOAuthCallbackIfPresent,
    stripOAuthQueryFromUrl,
    clearOAuthPending,
    initHubUi,
    initEditPushUi,
    initPublishSiteUi,
    publishSiteCommit,
    commitImagesRepoBinaryFiles,
    deleteImagesRepoEntry,
    deleteImagesRepoPaths,
    publishContentPageLive,
    publishProductPageLive,
    publishFullSite,
    buildPublishContext,
    pushContentPage,
    pushFileTree,
    pushShopData,
    syncNavigationFromFileTree,
    pushProductRow,
    pushProductOrder,
    pushProductDataPatches,
    pagePathToContentRepoPath,
    redirectUri,
    resolveHubIndexUrl,
    getRedirectUriOverride,
    setRedirectUriOverride,
  };
})();
