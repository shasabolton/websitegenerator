async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load JSON: ${url} (${response.status})`);
  }
  return response.json();
}

function cloneTree(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildFlatShopChildren(categoryData) {
  const flatChildren = [];
  for (const category of categoryData) {
    const categorySlug = String(category.slug || "").trim();
    flatChildren.push({
      label: category.label,
      href: category.href,
      pageType: "category",
      category: category.label,
      categorySlug,
    });
    const products = Array.isArray(category.products) ? category.products : [];
    for (const product of products) {
      flatChildren.push({
        label: product.label,
        href: product.href,
        pageType: "product",
        category: category.label,
        categorySlug,
      });
    }
  }
  return flatChildren;
}

function populateFileTree(fileTreeConfig, categoryData, categoryFilter = null) {
  const tree = cloneTree(fileTreeConfig);
  const items = Array.isArray(tree?.items) ? tree.items : [];
  const shopNode = items.find((item) => String(item?.label || "").trim().toLowerCase() === "shop");
  if (!shopNode) {
    return tree;
  }

  shopNode.href = "shop";
  let flatChildren = buildFlatShopChildren(categoryData);
  const activeCategory = String(categoryFilter || "").trim();
  if (activeCategory && activeCategory !== "all") {
    flatChildren = flatChildren.filter((child) => child.categorySlug === activeCategory);
  }
  shopNode.children = flatChildren;

  return tree;
}

function parseDigitalFilterValue(raw) {
  if (raw === true || raw === false) {
    return raw;
  }
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "true" || s === "digital") {
    return true;
  }
  if (s === "false" || s === "physical") {
    return false;
  }
  return null;
}

function getActiveDigitalFilterForPreviewLinks() {
  const sel = document.getElementById("preview-digital-filter");
  if (!sel) return null;
  const raw = String(sel.value || "").trim();
  if (raw === "all" || raw === "") {
    return null;
  }
  return parseDigitalFilterValue(raw);
}

function getActiveCategoryFilter() {
  const sel = document.getElementById("preview-category-filter");
  if (!sel) return null;
  const raw = String(sel.value || "").trim();
  if (raw === "all" || raw === "") {
    return null;
  }
  return raw;
}

function syncCategoryFilterOptions(categorySelect, categoryData, preserveValue) {
  if (!categorySelect) {
    return;
  }
  const previous = preserveValue ? String(categorySelect.value || "").trim() : "all";
  categorySelect.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All categories";
  categorySelect.appendChild(allOption);
  for (const category of categoryData) {
    const slug = String(category.slug || "").trim();
    if (!slug) {
      continue;
    }
    const option = document.createElement("option");
    option.value = slug;
    option.textContent = String(category.label || slug).trim() || slug;
    categorySelect.appendChild(option);
  }
  const stillValid =
    previous === "all" || categoryData.some((category) => String(category.slug || "").trim() === previous);
  categorySelect.value = stillValid ? previous : "all";
}

let cachedHomePageHref = null;
let baseFileTreeConfig = null;

const PENDING_NEW_PAGES_KEY = "siteGenerator.pendingNewPages";
const FILE_TREE_OVERLAY_KEY = "siteGenerator.fileTreeOverlay";

function slugifyPageTitle(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTreeHref(raw) {
  return String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .toLowerCase();
}

function treeIdFromPath(indexPath) {
  return indexPath.join(".");
}

function treePathFromId(id) {
  return String(id || "")
    .split(".")
    .filter((part) => part !== "")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part));
}

function isShopGeneratedChild(node) {
  const pageType = String(node?.pageType || "").trim().toLowerCase();
  return pageType === "category" || pageType === "product";
}

function isProductTreeNode(node) {
  return String(node?.pageType || "").trim().toLowerCase() === "product";
}

function isTreeNodeHidden(node, products = []) {
  if (isProductTreeNode(node)) {
    const path = normalizeTreeHref(node?.href || "");
    if (!path.startsWith("shop/") || path.length <= "shop/".length) {
      return false;
    }
    const slug = path.slice("shop/".length);
    const find = window.productData?.findProductBySlug;
    const isHidden = window.productData?.isProductRowHidden;
    if (typeof find !== "function" || typeof isHidden !== "function") {
      return false;
    }
    return isHidden(find(products, slug));
  }
  return node?.hide === true;
}

function isTreeNodeDraft(node, products = []) {
  if (isProductTreeNode(node)) {
    const path = normalizeTreeHref(node?.href || "");
    if (!path.startsWith("shop/") || path.length <= "shop/".length) {
      return false;
    }
    const slug = path.slice("shop/".length);
    const find = window.productData?.findProductBySlug;
    const isDraft = window.productData?.isProductRowDraft;
    if (typeof find !== "function" || typeof isDraft !== "function") {
      return false;
    }
    return isDraft(find(products, slug));
  }
  return node?.draft === true;
}

function findTreeNodeByHref(items, href) {
  const norm = normalizeTreeHref(href);
  if (!Array.isArray(items) || !norm) {
    return null;
  }
  for (const item of items) {
    if (normalizeTreeHref(item?.href) === norm) {
      return item;
    }
    const nested = findTreeNodeByHref(item?.children, href);
    if (nested) {
      return nested;
    }
  }
  return null;
}

function isTreePathDraft(tree, treePath, products = []) {
  const path = normalizeTreeHref(treePath);
  if (!path) {
    return false;
  }
  if (path.startsWith("shop/") && path.length > "shop/".length) {
    const segment = path.slice("shop/".length);
    if (!segment.includes("/")) {
      const find = window.productData?.findProductBySlug;
      const isDraft = window.productData?.isProductRowDraft;
      if (typeof find === "function" && typeof isDraft === "function") {
        const row = find(products, segment);
        if (row) {
          return isDraft(row);
        }
      }
    }
  }
  const node = findTreeNodeByHref(tree?.items || [], path);
  if (node) {
    return isTreeNodeDraft(node, products);
  }
  return false;
}

function filterPathsForPublish(tree, paths, products = []) {
  const list = paths instanceof Set ? Array.from(paths) : Array.isArray(paths) ? paths : [];
  return list.filter((path) => !isTreePathDraft(tree, path, products));
}

function collectPublishablePaths(tree, products = []) {
  return filterPathsForPublish(tree, collectAllKnownPaths(tree), products);
}

function canToggleTreeNodeHide(node) {
  if (isProductTreeNode(node)) {
    return Boolean(String(node?.href || "").trim());
  }
  return !isShopGeneratedChild(node) && Boolean(String(node?.href || "").trim());
}

function canToggleTreeNodeDraft(node) {
  return canToggleTreeNodeHide(node);
}

function isReservedSystemPath(treeHref) {
  const path = normalizeTreeHref(treeHref);
  if (!path) {
    return true;
  }
  if (path === "cart" || path === "shop" || path === "blog") {
    return true;
  }
  return path.startsWith("shop/");
}

function isBlogPostPath(treeHref) {
  const path = normalizeTreeHref(treeHref);
  return path.startsWith("blog/") && path.length > "blog/".length;
}

function isContentEditablePath(treeHref) {
  if (typeof window.generateContentBody?.isContentPagePath === "function") {
    return window.generateContentBody.isContentPagePath(treeHref);
  }
  const path = normalizeTreeHref(treeHref);
  return Boolean(path) && !isReservedSystemPath(path);
}

function shouldShowEditLink(treeHref, { isNew = false, pageType = "", productEdit = false } = {}) {
  if (isNew) {
    return true;
  }
  if (productEdit || String(pageType || "").trim().toLowerCase() === "product") {
    return true;
  }
  if (isBlogPostPath(treeHref)) {
    return true;
  }
  return isContentEditablePath(treeHref);
}

function readPendingNewPages() {
  try {
    const raw = sessionStorage.getItem(PENDING_NEW_PAGES_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingNewPages(pages) {
  sessionStorage.setItem(PENDING_NEW_PAGES_KEY, JSON.stringify(pages));
}

function getPendingNewPage(treePath) {
  const normalized = normalizeTreeHref(treePath);
  return readPendingNewPages().find((entry) => normalizeTreeHref(entry?.path) === normalized) || null;
}

function readFileTreeOverlay() {
  try {
    const raw = sessionStorage.getItem(FILE_TREE_OVERLAY_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function applyFileTreeOverlay(baseConfig) {
  const overlay = readFileTreeOverlay();
  const merged = cloneTree(baseConfig);
  if (overlay?.items) {
    merged.items = cloneTree(overlay.items);
  }
  if (overlay?.homePage) {
    merged.homePage = overlay.homePage;
  }
  return merged;
}

function stripGeneratedShopChildren(tree) {
  const snapshot = cloneTree(tree);
  const shopNode = (snapshot.items || []).find((item) => normalizeTreeHref(item?.href) === "shop");
  if (shopNode && Array.isArray(shopNode.children)) {
    shopNode.children = shopNode.children.filter((child) => !isShopGeneratedChild(child));
  }
  return snapshot;
}

function saveFileTreeOverlay(tree) {
  const snapshot = stripGeneratedShopChildren(tree);
  sessionStorage.setItem(
    FILE_TREE_OVERLAY_KEY,
    JSON.stringify({
      items: snapshot.items || [],
      homePage: snapshot.homePage || null,
    }),
  );
}

function walkTreeItems(items, visitor, indexPath = []) {
  if (!Array.isArray(items)) {
    return;
  }
  items.forEach((node, index) => {
    const path = [...indexPath, index];
    visitor(node, path);
    if (Array.isArray(node?.children)) {
      walkTreeItems(node.children, visitor, path);
    }
  });
}

function collectAllKnownPaths(tree) {
  const paths = new Set();
  walkTreeItems(tree?.items || [], (node) => {
    const href = normalizeTreeHref(node?.href || "");
    if (href) {
      paths.add(href);
    }
  });
  for (const pending of readPendingNewPages()) {
    const href = normalizeTreeHref(pending?.path || "");
    if (href) {
      paths.add(href);
    }
  }
  return paths;
}

function getNodeAtPath(tree, indexPath) {
  let list = tree.items;
  let node = null;
  for (let i = 0; i < indexPath.length; i += 1) {
    node = list?.[indexPath[i]];
    if (!node) {
      return null;
    }
    list = node.children;
  }
  return node;
}

function setNodeHideAtPath(tree, indexPath, hide) {
  const nextTree = cloneTree(tree);
  const node = getNodeAtPath(nextTree, indexPath);
  if (!node) {
    return null;
  }
  if (hide) {
    node.hide = true;
  } else {
    delete node.hide;
  }
  return nextTree;
}

function setNodeDraftAtPath(tree, indexPath, draft) {
  const nextTree = cloneTree(tree);
  const node = getNodeAtPath(nextTree, indexPath);
  if (!node) {
    return null;
  }
  if (draft) {
    node.draft = true;
  } else {
    delete node.draft;
  }
  return nextTree;
}

function getParentList(tree, indexPath) {
  if (!Array.isArray(tree.items) || !indexPath.length) {
    return null;
  }
  if (indexPath.length === 1) {
    return tree.items;
  }
  let list = tree.items;
  for (let i = 0; i < indexPath.length - 1; i += 1) {
    const node = list[indexPath[i]];
    if (!node) {
      return null;
    }
    if (!Array.isArray(node.children)) {
      node.children = [];
    }
    list = node.children;
  }
  return list;
}

function removeNodeAtPath(tree, indexPath) {
  const list = getParentList(tree, indexPath);
  if (!list) {
    return null;
  }
  const index = indexPath[indexPath.length - 1];
  if (index < 0 || index >= list.length) {
    return null;
  }
  return list.splice(index, 1)[0];
}

function countTreeNodeDescendants(node) {
  const children = Array.isArray(node?.children) ? node.children : [];
  return children.reduce((total, child) => total + 1 + countTreeNodeDescendants(child), 0);
}

function removePendingPageByHref(href) {
  const normalized = normalizeTreeHref(href);
  if (!normalized) {
    return;
  }
  const pending = readPendingNewPages().filter((entry) => normalizeTreeHref(entry?.path) !== normalized);
  writePendingNewPages(pending);
}

function deleteTreeNodeAtPath(tree, indexPath) {
  const nextTree = cloneTree(tree);
  const removed = removeNodeAtPath(nextTree, indexPath);
  return removed ? nextTree : null;
}

function canDeleteTreeNode(node) {
  return !isShopGeneratedChild(node);
}

function isDescendantPath(ancestorPath, maybeDescendantPath) {
  if (ancestorPath.length >= maybeDescendantPath.length) {
    return false;
  }
  for (let i = 0; i < ancestorPath.length; i += 1) {
    if (ancestorPath[i] !== maybeDescendantPath[i]) {
      return false;
    }
  }
  return true;
}

function moveTreeNode(tree, sourcePath, targetPath, position) {
  if (!sourcePath.length || !targetPath.length) {
    return false;
  }
  if (treeIdFromPath(sourcePath) === treeIdFromPath(targetPath)) {
    return false;
  }
  if (isDescendantPath(sourcePath, targetPath)) {
    return false;
  }
  const nextTree = cloneTree(tree);
  const node = removeNodeAtPath(nextTree, sourcePath);
  if (!node) {
    return false;
  }

  let adjustedTarget = [...targetPath];
  const sameParent = sourcePath.slice(0, -1).join(".") === targetPath.slice(0, -1).join(".");
  if (sameParent && sourcePath.length === targetPath.length) {
    const sourceIndex = sourcePath[sourcePath.length - 1];
    const targetIndex = targetPath[targetPath.length - 1];
    if (sourceIndex < targetIndex) {
      adjustedTarget[adjustedTarget.length - 1] -= 1;
    }
  }

  if (position === "into") {
    const targetNode = getNodeAtPath(nextTree, adjustedTarget);
    if (!targetNode || isShopGeneratedChild(targetNode)) {
      return false;
    }
    if (!Array.isArray(targetNode.children)) {
      targetNode.children = [];
    }
    if (normalizeTreeHref(targetNode.href) === "shop") {
      const generated = (targetNode.children || []).filter((child) => isShopGeneratedChild(child));
      targetNode.children = [node, ...generated];
    } else {
      targetNode.children.push(node);
    }
    return nextTree;
  }

  const list = getParentList(nextTree, adjustedTarget);
  if (!list) {
    return false;
  }
  const targetIndex = adjustedTarget[adjustedTarget.length - 1];
  const insertIndex = position === "before" ? targetIndex : targetIndex + 1;
  list.splice(insertIndex, 0, node);
  return nextTree;
}

function getExportableFileTree(tree) {
  return stripGeneratedShopChildren(tree);
}

/** Sanitize each deploy path segment; preserve `/` nesting (do not flatten to hyphens). */
function sanitizeDeployFolderPath(deployFolder) {
  const normalized = String(deployFolder || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!normalized) {
    return "";
  }
  const segments = normalized
    .split("/")
    .map((segment) => String(segment || "").trim().replace(/[:*?"<>|]+/g, "-"))
    .filter(Boolean);
  return segments.join("/") || "page";
}

/** Output path relative to repo root (`index.html` or `about/index.html`). */
function treePathToOutputRelativePath(treePath, homePageHref = cachedHomePageHref) {
  const folder = treePathToDownloadFolderName(treePath, homePageHref);
  if (!folder) {
    return "index.html";
  }
  return `${folder}/index.html`;
}

/** Deploy folder path (`""` = site root; `blog/foo` = nested folder). */
function treePathToDownloadFolderName(treePath, homePageHref = cachedHomePageHref) {
  if (window.homePage?.resolveDeployFolder) {
    const deployFolder = window.homePage.resolveDeployFolder(treePath, homePageHref);
    if (!deployFolder) {
      return "";
    }
    return sanitizeDeployFolderPath(deployFolder);
  }
  const p = String(treePath || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!p) {
    return "page";
  }
  return sanitizeDeployFolderPath(p);
}

async function downloadPageFolderAsZip(folderName, html) {
  if (typeof window.JSZip !== "function") {
    throw new Error("JSZip is not loaded (expected ./vendor/jszip.min.js).");
  }
  const zip = new window.JSZip();
  if (folderName) {
    zip.folder(folderName).file("index.html", html);
  } else {
    zip.file("index.html", html);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = folderName ? `${folderName}.zip` : "index.zip";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function createDeleteButton({ label, treeHref, indexPath, isNew, node, callbacks }) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-picker-delete";
  btn.textContent = "Delete";
  const nameHint = String(label || treeHref || "page").trim() || "page";
  btn.setAttribute("aria-label", `Remove ${nameHint} from file tree`);
  btn.addEventListener("click", () => {
    const descendantCount = countTreeNodeDescendants(node);
    let message = isNew
      ? `Remove draft "${nameHint}" from the file tree?`
      : `Remove "${nameHint}" from the file tree?`;
    if (descendantCount > 0) {
      message += ` This will also remove ${descendantCount} nested page${descendantCount === 1 ? "" : "s"} from the tree.`;
    }
    if (!isNew && treeHref) {
      message += " The content JSON file on disk or GitHub will not be deleted.";
    }
    if (!window.confirm(message)) {
      return;
    }
    if (treeHref) {
      removePendingPageByHref(treeHref);
    }
    const nextTree = deleteTreeNodeAtPath(callbacks.getCurrentTree(), indexPath);
    if (!nextTree) {
      window.alert("Could not remove that page from the file tree.");
      return;
    }
    saveFileTreeOverlay(nextTree);
    callbacks.onTreeChanged(nextTree);
  });
  return btn;
}

function createDownloadButton(treeHref, pageLabel, isNew = false) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "preview-picker-download";
  btn.textContent = "Download";
  const nameHint = String(pageLabel || treeHref || "page").trim() || "page";
  btn.setAttribute("aria-label", `Download zip with folder and index.html for ${nameHint}`);
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      if (typeof window.loadPreviewGenerators === "function") {
        await window.loadPreviewGenerators();
      }
      if (typeof window.generateAnyPage?.generateAnyPage !== "function") {
        throw new Error("Page generators are not available.");
      }
      const digital = getActiveDigitalFilterForPreviewLinks();
      const html = await window.generateAnyPage.generateAnyPage(treeHref, { digital, isNew });
      await downloadPageFolderAsZip(treePathToDownloadFolderName(treeHref), html);
    } catch (e) {
      window.alert(e?.message || String(e));
    } finally {
      btn.disabled = false;
    }
  });
  return btn;
}

function appendPreviewPageRow(container, { label, treeHref, nested = false, productEdit = false, isNew = false }) {
  const row = document.createElement("div");
  row.className = nested ? "preview-picker-row preview-picker-nested" : "preview-picker-row";
  if (isNew) {
    row.classList.add("preview-picker-row--new");
  }
  const href = String(treeHref || "").trim();
  if (!href) {
    throw new Error("appendPreviewPageRow: missing treeHref.");
  }
  const digital = getActiveDigitalFilterForPreviewLinks();
  const pageLink = document.createElement("a");
  pageLink.href = window.previewTarget.buildPreviewUrl(href, digital, isNew);
  pageLink.className = "preview-picker-page-link";
  pageLink.textContent = label;
  row.appendChild(pageLink);
  if (shouldShowEditLink(href, { isNew, productEdit })) {
    const editLink = document.createElement("a");
    editLink.href = window.previewTarget.buildEditUrl(href, digital, isNew);
    editLink.className = "preview-picker-edit-link";
    editLink.textContent = "Edit";
    row.appendChild(editLink);
  }
  row.appendChild(createDownloadButton(href, label, isNew));
  container.appendChild(row);
}

function appendTreeToolbar(container, callbacks) {
  const wrap = document.createElement("div");
  wrap.className = "preview-picker-tree-toolbar";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "preview-picker-save-tree";
  saveBtn.textContent = "Save file tree to GitHub";
  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      if (!window.githubAuth?.pushFileTree) {
        throw new Error("GitHub file-tree push is not available.");
      }
      const tree = callbacks.getCurrentTree?.();
      if (!tree) {
        throw new Error("File tree is not loaded.");
      }
      await window.githubAuth.pushFileTree(getExportableFileTree(tree));
      saveBtn.textContent = "Saved";
      window.setTimeout(() => {
        saveBtn.textContent = "Save file tree to GitHub";
      }, 2000);
    } catch (err) {
      window.alert(err?.message || String(err));
    } finally {
      saveBtn.disabled = false;
    }
  });
  wrap.appendChild(saveBtn);

  const hint = document.createElement("p");
  hint.className = "preview-picker-tree-toolbar-hint";
  hint.textContent =
    "Drag ⋮⋮ to reorder (drop between rows). Drop onto a page row to nest it as a child. Hidden pages stay in the tree but are omitted from navigation, the blog index, or shop listings. Draft pages are not published as HTML. Push product edits to save product hide/draft to GitHub.";
  wrap.appendChild(hint);
  container.appendChild(wrap);
}

function appendNewPageToolbar(container, fileTree, onCreated) {
  const wrap = document.createElement("div");
  wrap.className = "preview-picker-new-page";

  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "preview-picker-new-page-toggle";
  toggleBtn.textContent = "+ New page";
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.setAttribute("aria-controls", "preview-picker-new-page-form");

  const form = document.createElement("form");
  form.id = "preview-picker-new-page-form";
  form.className = "preview-picker-new-page-form";
  form.hidden = true;
  form.innerHTML = `<p class="preview-picker-new-page-hint">Creates a draft page you can preview, edit, and drag into place before pushing to GitHub.</p>
<div class="preview-picker-new-page-fields">
  <label>
    <span>Title</span>
    <input type="text" name="title" required autocomplete="off" placeholder="Contact" />
  </label>
  <label>
    <span>Page type</span>
    <select name="pageType">
      <option value="page" selected>Page</option>
      <option value="blog">Blog post</option>
    </select>
  </label>
  <label>
    <span>Slug</span>
    <input type="text" name="slug" required autocomplete="off" placeholder="contact" />
  </label>
</div>
<div class="preview-picker-new-page-actions">
  <button type="submit" class="preview-picker-new-page-create">Add page</button>
  <button type="button" class="preview-picker-new-page-cancel">Cancel</button>
</div>`;

  const titleInput = form.querySelector('input[name="title"]');
  const slugInput = form.querySelector('input[name="slug"]');
  const pageTypeSelect = form.querySelector('select[name="pageType"]');
  const cancelBtn = form.querySelector(".preview-picker-new-page-cancel");

  const setFormOpen = (open) => {
    form.hidden = !open;
    toggleBtn.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      titleInput.focus();
    }
  };

  toggleBtn.addEventListener("click", () => {
    setFormOpen(form.hidden);
  });
  cancelBtn.addEventListener("click", () => {
    form.reset();
    setFormOpen(false);
  });

  titleInput.addEventListener("input", () => {
    if (!slugInput.dataset.touched) {
      slugInput.value = slugifyPageTitle(titleInput.value);
    }
  });
  slugInput.addEventListener("input", () => {
    slugInput.dataset.touched = slugInput.value.trim() ? "1" : "";
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = String(titleInput.value || "").trim();
    const pageType = String(pageTypeSelect.value || "page").trim().toLowerCase();
    const slug = slugifyPageTitle(slugInput.value || titleInput.value);
    if (!title) {
      window.alert("Enter a title for the new page.");
      titleInput.focus();
      return;
    }
    if (!slug) {
      window.alert("Enter a slug for the new page.");
      slugInput.focus();
      return;
    }
    const path = pageType === "blog" ? `blog/${slug}` : slug;
    const knownPaths = collectAllKnownPaths(fileTree);
    if (knownPaths.has(path)) {
      window.alert(`A page already exists at ${path}. Choose a different slug.`);
      slugInput.focus();
      return;
    }

    const overlay = readFileTreeOverlay() || { items: cloneTree(fileTree.items || []) };
    if (!Array.isArray(overlay.items)) {
      overlay.items = [];
    }
    overlay.items.push({ label: title, href: path, draft: true });
    sessionStorage.setItem(FILE_TREE_OVERLAY_KEY, JSON.stringify(overlay));

    const pending = readPendingNewPages();
    pending.push({
      path,
      label: title,
      title,
      slug,
      pageType,
    });
    writePendingNewPages(pending);

    form.reset();
    delete slugInput.dataset.touched;
    setFormOpen(false);
    if (typeof onCreated === "function") {
      onCreated();
    }
  });

  wrap.appendChild(toggleBtn);
  wrap.appendChild(form);
  container.appendChild(wrap);
}

function applyTreeMove(sourcePath, targetPath, position, callbacks) {
  const nextTree = moveTreeNode(callbacks.getCurrentTree(), sourcePath, targetPath, position);
  if (!nextTree) {
    return false;
  }
  saveFileTreeOverlay(nextTree);
  callbacks.onTreeChanged(nextTree);
  return true;
}

function canAcceptNestedChildren(node) {
  return !isShopGeneratedChild(node);
}

function canNestIntoTarget(sourcePath, targetPath) {
  if (!sourcePath?.length || !targetPath?.length) {
    return false;
  }
  if (treeIdFromPath(sourcePath) === treeIdFromPath(targetPath)) {
    return false;
  }
  return !isDescendantPath(sourcePath, targetPath);
}

function createDropZone(position, targetPath, callbacks, depth = 0) {
  const zone = document.createElement("div");
  zone.className = `preview-picker-dropzone preview-picker-dropzone--${position}`;
  zone.dataset.dropPosition = position;
  zone.dataset.dropTarget = treeIdFromPath(targetPath);
  zone.style.setProperty("--tree-depth", String(depth));
  zone.addEventListener("dragover", (event) => {
    if (!callbacks.getDragSourcePath?.()) {
      return;
    }
    event.preventDefault();
    zone.classList.add("preview-picker-dropzone--active");
  });
  zone.addEventListener("dragleave", () => {
    zone.classList.remove("preview-picker-dropzone--active");
  });
  zone.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    zone.classList.remove("preview-picker-dropzone--active");
    const sourcePath = callbacks.getDragSourcePath?.();
    if (!sourcePath) {
      return;
    }
    applyTreeMove(sourcePath, targetPath, position, callbacks);
  });
  return zone;
}

function isDirectNestHover(event, row) {
  const deepestRow = event.target.closest?.(".preview-picker-tree-row");
  return deepestRow === row;
}

function bindRowNestDrop(row, indexPath, callbacks, nodeId) {
  row.addEventListener("dragenter", (event) => {
    const sourcePath = callbacks.getDragSourcePath?.();
    if (!canNestIntoTarget(sourcePath, indexPath) || !isDirectNestHover(event, row)) {
      return;
    }
    event.preventDefault();
    row.classList.add("preview-picker-tree-row--nest-target");
  });
  row.addEventListener("dragover", (event) => {
    const sourcePath = callbacks.getDragSourcePath?.();
    if (!canNestIntoTarget(sourcePath, indexPath)) {
      row.classList.remove("preview-picker-tree-row--nest-target");
      return;
    }
    if (!isDirectNestHover(event, row)) {
      row.classList.remove("preview-picker-tree-row--nest-target");
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    row.classList.add("preview-picker-tree-row--nest-target");
  });
  row.addEventListener("dragleave", (event) => {
    if (!row.contains(event.relatedTarget)) {
      row.classList.remove("preview-picker-tree-row--nest-target");
    }
  });
  row.addEventListener("drop", (event) => {
    event.preventDefault();
    event.stopPropagation();
    row.classList.remove("preview-picker-tree-row--nest-target");
    const sourcePath = callbacks.getDragSourcePath?.();
    if (!canNestIntoTarget(sourcePath, indexPath)) {
      return;
    }
    applyTreeMove(sourcePath, indexPath, "into", callbacks);
  });
}

function renderTreeNode(parent, node, indexPath, depth, callbacks) {
  const generatedChild = isShopGeneratedChild(node);
  const canDrag = !generatedChild;
  const nodeId = treeIdFromPath(indexPath);
  const href = String(node.href || "").trim();
  const label = String(node.label || href || "Page").trim() || "Page";
  const isNew = Boolean(getPendingNewPage(href));
  const pageType = String(node.pageType || "").trim().toLowerCase();

  const block = document.createElement("div");
  block.className = "preview-picker-tree-block";
  block.dataset.treeId = nodeId;

  if (canDrag) {
    block.appendChild(createDropZone("before", indexPath, callbacks, depth));
  }

  const row = document.createElement("div");
  row.className = "preview-picker-tree-row";
  row.style.setProperty("--tree-depth", String(depth));
  if (!canDrag) {
    row.classList.add("preview-picker-tree-row--static");
  }

  if (canDrag) {
    const handle = document.createElement("span");
    handle.className = "preview-picker-tree-handle";
    handle.textContent = "⋮⋮";
    handle.setAttribute("aria-label", `Drag to reorder ${label}`);
    handle.draggable = true;
    handle.addEventListener("dragstart", (event) => {
      callbacks.setDragSourcePath(indexPath);
      row.classList.add("preview-picker-tree-row--dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", nodeId);
    });
    handle.addEventListener("dragend", () => {
      callbacks.setDragSourcePath(null);
      row.classList.remove("preview-picker-tree-row--dragging");
      const root = parent.closest(".preview-picker-root");
      root?.querySelectorAll(".preview-picker-dropzone--active").forEach((el) => {
        el.classList.remove("preview-picker-dropzone--active");
      });
      root?.querySelectorAll(".preview-picker-tree-row--nest-target").forEach((el) => {
        el.classList.remove("preview-picker-tree-row--nest-target");
      });
    });
    row.appendChild(handle);
  }

  const labelEl = document.createElement("span");
  labelEl.className = "preview-picker-tree-label";
  labelEl.textContent = label;
  row.appendChild(labelEl);

  if (canToggleTreeNodeHide(node)) {
    const products = typeof callbacks.getProducts === "function" ? callbacks.getProducts() : [];
    const hideLabel = document.createElement("label");
    hideLabel.className = "preview-picker-tree-hide";
    hideLabel.title = isProductTreeNode(node)
      ? "Hide from shop listings and navigation (saved in productData.json on push)"
      : "Hide from site navigation and blog index";
    const hideInput = document.createElement("input");
    hideInput.type = "checkbox";
    hideInput.checked = isTreeNodeHidden(node, products);
    hideInput.setAttribute(
      "aria-label",
      isProductTreeNode(node) ? `Hide ${label} from shop` : `Hide ${label} from navigation`,
    );
    hideInput.addEventListener("change", () => {
      if (isProductTreeNode(node)) {
        const path = normalizeTreeHref(href);
        const slug = path.startsWith("shop/") ? path.slice("shop/".length) : "";
        const find = window.productData?.findProductBySlug;
        const setHide = window.productData?.setProductHideBySku;
        const productList = typeof callbacks.getProducts === "function" ? callbacks.getProducts() : [];
        const row = typeof find === "function" && slug ? find(productList, slug) : null;
        if (!row || typeof setHide !== "function") {
          hideInput.checked = isTreeNodeHidden(node, productList);
          return;
        }
        setHide(row.SKU, hideInput.checked);
        callbacks.onTreeChanged(callbacks.getCurrentTree());
        return;
      }
      const nextTree = setNodeHideAtPath(callbacks.getCurrentTree(), indexPath, hideInput.checked);
      if (!nextTree) {
        hideInput.checked = isTreeNodeHidden(node, products);
        return;
      }
      saveFileTreeOverlay(nextTree);
      callbacks.onTreeChanged(nextTree);
    });
    hideLabel.appendChild(hideInput);
    hideLabel.appendChild(document.createTextNode(" Hide"));
    row.appendChild(hideLabel);
  }

  if (canToggleTreeNodeDraft(node)) {
    const products = typeof callbacks.getProducts === "function" ? callbacks.getProducts() : [];
    const draftLabel = document.createElement("label");
    draftLabel.className = "preview-picker-tree-draft";
    draftLabel.title = isProductTreeNode(node)
      ? "Skip HTML publish (saved in productData.json on push)"
      : "Skip HTML publish (saved in fileTree.json on push)";
    const draftInput = document.createElement("input");
    draftInput.type = "checkbox";
    draftInput.checked = isTreeNodeDraft(node, products);
    draftInput.setAttribute(
      "aria-label",
      isProductTreeNode(node) ? `Mark ${label} as draft` : `Mark ${label} as draft`,
    );
    draftInput.addEventListener("change", () => {
      if (isProductTreeNode(node)) {
        const path = normalizeTreeHref(href);
        const slug = path.startsWith("shop/") ? path.slice("shop/".length) : "";
        const find = window.productData?.findProductBySlug;
        const setDraft = window.productData?.setProductDraftBySku;
        const productList = typeof callbacks.getProducts === "function" ? callbacks.getProducts() : [];
        const row = typeof find === "function" && slug ? find(productList, slug) : null;
        if (!row || typeof setDraft !== "function") {
          draftInput.checked = isTreeNodeDraft(node, productList);
          return;
        }
        setDraft(row.SKU, draftInput.checked);
        callbacks.onTreeChanged(callbacks.getCurrentTree());
        return;
      }
      const nextTree = setNodeDraftAtPath(callbacks.getCurrentTree(), indexPath, draftInput.checked);
      if (!nextTree) {
        draftInput.checked = isTreeNodeDraft(node, products);
        return;
      }
      saveFileTreeOverlay(nextTree);
      callbacks.onTreeChanged(nextTree);
    });
    draftLabel.appendChild(draftInput);
    draftLabel.appendChild(document.createTextNode(" Draft"));
    row.appendChild(draftLabel);
  }

  const actions = document.createElement("div");
  actions.className = "preview-picker-tree-actions";

  if (href && !href.startsWith("#")) {
    const digital = getActiveDigitalFilterForPreviewLinks();
    const pageLink = document.createElement("a");
    pageLink.href = window.previewTarget.buildPreviewUrl(href, digital, isNew);
    pageLink.className = "preview-picker-page-link";
    pageLink.textContent = "Preview";
    actions.appendChild(pageLink);

    if (shouldShowEditLink(href, { isNew, pageType })) {
      const editLink = document.createElement("a");
      editLink.href = window.previewTarget.buildEditUrl(href, digital, isNew);
      editLink.className = "preview-picker-edit-link";
      editLink.textContent = "Edit";
      actions.appendChild(editLink);
    }

    actions.appendChild(createDownloadButton(href, label, isNew));
    if (canDeleteTreeNode(node)) {
      actions.appendChild(
        createDeleteButton({ label, treeHref: href, indexPath, isNew, node, callbacks }),
      );
    }
  } else if (!href) {
    const muted = document.createElement("span");
    muted.className = "preview-picker-muted";
    muted.textContent = "Section";
    actions.appendChild(muted);
    if (canDeleteTreeNode(node)) {
      actions.appendChild(
        createDeleteButton({ label, treeHref: "", indexPath, isNew, node, callbacks }),
      );
    }
  }

  row.appendChild(actions);
  if (isNew) {
    row.classList.add("preview-picker-tree-row--new");
  }
  const rowProducts = typeof callbacks.getProducts === "function" ? callbacks.getProducts() : [];
  if (isTreeNodeHidden(node, rowProducts)) {
    row.classList.add("preview-picker-tree-row--hidden");
  }
  if (isTreeNodeDraft(node, rowProducts)) {
    row.classList.add("preview-picker-tree-row--draft");
  }

  if (canAcceptNestedChildren(node)) {
    row.classList.add("preview-picker-tree-row--nestable");
    bindRowNestDrop(row, indexPath, callbacks, nodeId);
  }

  block.appendChild(row);

  const children = Array.isArray(node.children) ? node.children : [];
  if (children.length) {
    const childWrap = document.createElement("div");
    childWrap.className = "preview-picker-tree-children";
    children.forEach((child, childIndex) => {
      renderTreeNode(childWrap, child, [...indexPath, childIndex], depth + 1, callbacks);
    });
    block.appendChild(childWrap);
  }

  if (canDrag) {
    block.appendChild(createDropZone("after", indexPath, callbacks, depth));
  }

  parent.appendChild(block);
}

function renderDraggableTree(container, fileTree, callbacks) {
  const list = document.createElement("div");
  list.className = "preview-picker-tree";
  const items = fileTree?.items || [];
  items.forEach((node, index) => {
    renderTreeNode(list, node, [index], 0, callbacks);
  });
  container.appendChild(list);
}

function rememberHomePageHref(fileTreeConfig) {
  cachedHomePageHref = window.homePage?.getHomePageHref
    ? window.homePage.getHomePageHref(fileTreeConfig)
    : null;
  return cachedHomePageHref;
}

async function buildPopulatedFileTree(digitalFilter, categoryFilter = null) {
  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  rememberHomePageHref(fileTreeConfig);
  const filter = parseDigitalFilterValue(digitalFilter);
  const categoryData = window.productData.getCategoriesForFileTree(products, filter);
  return populateFileTree(applyFileTreeOverlay(fileTreeConfig), categoryData, categoryFilter);
}

function renderPreviewPicker(container, fileTree, options = {}) {
  container.innerHTML = "";
  container.classList.add("preview-picker-root");

  let dragSourcePath = null;
  const callbacks = {
    getCurrentTree: () => options.getCurrentTree?.() || fileTree,
    getProducts: () => (typeof options.getProducts === "function" ? options.getProducts() : []),
    getDragSourcePath: () => dragSourcePath,
    setDragSourcePath: (path) => {
      dragSourcePath = path;
    },
    onTreeChanged: (nextTree) => {
      if (typeof options.onTreeChanged === "function") {
        options.onTreeChanged(nextTree);
      }
    },
  };

  appendNewPageToolbar(container, fileTree, options.onPendingPageCreated);
  appendTreeToolbar(container, callbacks);
  renderDraggableTree(container, fileTree, callbacks);
}

async function initPreviewPicker(options = {}) {
  const {
    containerId = "preview-picker-root",
    filterSelectId = "preview-digital-filter",
    categoryFilterSelectId = "preview-category-filter",
  } = options;
  const container = document.getElementById(containerId);
  if (!container) {
    throw new Error(`Preview picker container not found: #${containerId}`);
  }

  const [fileTreeConfig, { products }] = await Promise.all([
    fetchJson("../../shared-assets/config/fileTree.json"),
    window.productData.fetchProductDataJson(),
  ]);
  baseFileTreeConfig = fileTreeConfig;
  rememberHomePageHref(fileTreeConfig);

  const filterSelect = document.getElementById(filterSelectId);
  const categorySelect = document.getElementById(categoryFilterSelectId);
  let lastPopulatedTree = null;
  let lastProducts = products;

  const applyFilterFromUi = async () => {
    const productData = await window.productData.fetchProductDataJson();
    lastProducts = productData.products;
    const raw = filterSelect ? filterSelect.value : "all";
    const filter = parseDigitalFilterValue(raw === "all" ? null : raw);
    const categoryData = window.productData.getCategoriesForFileTree(lastProducts, filter);
    syncCategoryFilterOptions(categorySelect, categoryData, true);
    const categoryFilter = getActiveCategoryFilter();
    lastPopulatedTree = populateFileTree(applyFileTreeOverlay(baseFileTreeConfig), categoryData, categoryFilter);
    renderPreviewPicker(container, lastPopulatedTree, {
      getCurrentTree: () => lastPopulatedTree,
      getProducts: () => lastProducts,
      onPendingPageCreated: applyFilterFromUi,
      onTreeChanged: () => {
        applyFilterFromUi();
      },
    });
  };

  if (filterSelect) {
    filterSelect.addEventListener("change", applyFilterFromUi);
  }
  if (categorySelect) {
    categorySelect.addEventListener("change", applyFilterFromUi);
  }

  applyFilterFromUi();
  return lastPopulatedTree;
}

window.displayFileTree = {
  initPreviewPicker,
  buildPopulatedFileTree,
  renderPreviewPicker,
  getPendingNewPage,
  getExportableFileTree,
  applyFileTreeOverlay,
  isTreeNodeHidden,
  isTreeNodeDraft,
  isTreePathDraft,
  filterPathsForPublish,
  collectPublishablePaths,
  collectAllKnownPaths,
  treePathToDownloadFolderName,
  treePathToOutputRelativePath,
  parsePreviewTarget: (search) => window.previewTarget.parsePreviewTarget(search),
  buildPreviewUrl: (treePath) =>
    window.previewTarget.buildPreviewUrl(treePath, getActiveDigitalFilterForPreviewLinks()),
};
