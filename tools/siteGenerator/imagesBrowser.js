(function () {
  const IMAGE_EXT = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
  const RASTER_IMAGE_EXT = /\.(avif|bmp|gif|ico|jpe?g|png|webp)$/i;
  const WEBP_QUALITY = 0.85;

  let reloadTreeCallback = null;
  let previewState = null;

  function buildImagePublicUrl(entry, ctx) {
    const filePath = entry?.path || "";
    if (!filePath || !ctx?.owner || !ctx?.repo) {
      return "";
    }
    if (window.githubAuth?.buildBlobRawContentUrl) {
      return window.githubAuth.buildBlobRawContentUrl(ctx.owner, ctx.repo, filePath, ctx.branch);
    }
    return "";
  }

  function mimeTypeFromPath(filePath) {
    const name = String(filePath || "").toLowerCase();
    if (name.endsWith(".webp")) {
      return "image/webp";
    }
    if (name.endsWith(".png")) {
      return "image/png";
    }
    if (name.endsWith(".gif")) {
      return "image/gif";
    }
    if (name.endsWith(".avif")) {
      return "image/avif";
    }
    if (name.endsWith(".svg")) {
      return "image/svg+xml";
    }
    return "image/jpeg";
  }

  async function fetchImageBlob(entry, ctx) {
    const publicUrl = buildImagePublicUrl(entry, ctx);
    if (publicUrl) {
      try {
        const response = await fetch(publicUrl, { mode: "cors", cache: "no-store" });
        if (response.ok) {
          const blob = await response.blob();
          if (blob.size > 0) {
            return blob;
          }
        }
      } catch {
        /* try authenticated GitHub download */
      }
    }

    let downloadUrl = entry.downloadUrl;
    if (!downloadUrl && window.githubAuth?.getFileMeta) {
      const meta = await window.githubAuth.getFileMeta(ctx.owner, ctx.repo, entry.path, ctx.branch);
      downloadUrl = meta?.download_url || null;
    }
    const token = window.githubAuth?.getToken?.();
    const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

    if (downloadUrl) {
      const response = await fetch(downloadUrl, { headers: authHeaders });
      if (response.ok) {
        const blob = await response.blob();
        if (blob.size > 0) {
          return blob;
        }
      }
    }

    if (window.githubAuth?.getFileMeta) {
      const meta = await window.githubAuth.getFileMeta(ctx.owner, ctx.repo, entry.path, ctx.branch);
      const encoded = meta?.content;
      if (encoded) {
        const normalized = String(encoded).replace(/\s+/g, "");
        const binary = atob(normalized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        return new Blob([bytes], { type: mimeTypeFromPath(entry.path) });
      }
    }

    throw new Error("Could not download image for processing.");
  }

  function entryBaseName(entry) {
    const name = String(entry?.name || "").trim();
    if (name) {
      return name.split("/").pop() || name;
    }
    const path = String(entry?.path || "").trim();
    return path.split("/").pop() || path;
  }

  function hasExtension(nameOrPath, pattern) {
    const base = String(nameOrPath || "")
      .trim()
      .split("/")
      .pop();
    return Boolean(base && pattern.test(base));
  }

  function isImageFile(entryOrName) {
    if (entryOrName && typeof entryOrName === "object") {
      return (
        hasExtension(entryOrName.name, IMAGE_EXT) ||
        hasExtension(entryOrName.path, IMAGE_EXT)
      );
    }
    return hasExtension(entryOrName, IMAGE_EXT);
  }

  function isRasterImageFile(entryOrName) {
    if (entryOrName && typeof entryOrName === "object") {
      return (
        hasExtension(entryOrName.name, RASTER_IMAGE_EXT) ||
        hasExtension(entryOrName.path, RASTER_IMAGE_EXT)
      );
    }
    return hasExtension(entryOrName, RASTER_IMAGE_EXT);
  }

  function ensureTypedImageBlob(blob, entry) {
    const mime = mimeTypeFromPath(entry?.path || entry?.name || "");
    if (blob.type === mime || (blob.type && blob.type.startsWith("image/"))) {
      return blob;
    }
    if (typeof blob.slice === "function") {
      return blob.slice(0, blob.size, mime);
    }
    return new Blob([blob], { type: mime });
  }

  async function fetchImageObjectUrl(entry, ctx) {
    try {
      const blob = ensureTypedImageBlob(await fetchImageBlob(entry, ctx), entry);
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  function waitForImageElement(img, src) {
    return new Promise((resolve, reject) => {
      if (!src) {
        reject(new Error("Missing image URL."));
        return;
      }
      img.removeAttribute("crossorigin");
      const onLoad = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Image failed to load."));
      };
      const cleanup = () => {
        img.removeEventListener("load", onLoad);
        img.removeEventListener("error", onError);
      };
      img.addEventListener("load", onLoad);
      img.addEventListener("error", onError);
      img.src = src;
    });
  }

  async function loadImageForCanvas(entry, ctx) {
    const blob = ensureTypedImageBlob(await fetchImageBlob(entry, ctx), entry);
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(blob, { imageOrientation: "from-image" });
      } catch {
        /* fall through to Image element */
      }
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode image."));
        img.src = objectUrl;
      });
      return img;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  function releaseCanvasSource(source) {
    if (source && typeof source.close === "function") {
      source.close();
    }
  }

  async function loadThumbnail(thumb, entry, ctx) {
    const publicUrl = buildImagePublicUrl(entry, ctx);
    if (publicUrl) {
      thumb.dataset.publicUrl = publicUrl;
    }
    thumb.classList.add("images-browser-thumb--loading");

    const markFailed = () => {
      thumb.classList.add("images-browser-thumb--failed");
      thumb.classList.remove("images-browser-thumb--loading");
    };
    const markLoaded = () => {
      thumb.classList.remove("images-browser-thumb--loading", "images-browser-thumb--failed");
    };

    try {
      const objectUrl = await fetchImageObjectUrl(entry, ctx);
      if (objectUrl) {
        await waitForImageElement(thumb, objectUrl);
        markLoaded();
        return;
      }
    } catch {
      /* try direct media URL */
    }

    try {
      if (publicUrl) {
        await waitForImageElement(thumb, publicUrl);
        markLoaded();
        return;
      }
    } catch {
      /* failed */
    }

    markFailed();
  }

  let previewOverlay = null;

  function closeImagePreview() {
    if (!previewOverlay) {
      return;
    }
    previewOverlay.hidden = true;
    previewState = null;
    const img = previewOverlay.querySelector("[data-images-preview-image]");
    if (img) {
      img.removeAttribute("src");
    }
    setGenerateStatus(previewOverlay, "", null);
    const genBtn = previewOverlay.querySelector("[data-images-generate-webp]");
    if (genBtn) {
      genBtn.hidden = true;
    }
    document.body.classList.remove("images-browser-preview-open");
  }

  function ensurePreviewOverlay() {
    if (previewOverlay) {
      return previewOverlay;
    }
    previewOverlay = document.createElement("div");
    previewOverlay.className = "images-browser-preview";
    previewOverlay.hidden = true;
    previewOverlay.setAttribute("role", "dialog");
    previewOverlay.setAttribute("aria-modal", "true");
    previewOverlay.setAttribute("aria-label", "Image preview");
    previewOverlay.innerHTML = `<button type="button" class="images-browser-preview-backdrop" data-images-preview-close aria-label="Close preview"></button>
<figure class="images-browser-preview-frame">
  <div class="images-browser-preview-toolbar">
    <button type="button" class="images-browser-preview-generate" data-images-generate-webp hidden>Generate WebP sizes</button>
    <button type="button" class="images-browser-preview-close" data-images-preview-close>Close</button>
  </div>
  <img class="images-browser-preview-image" data-images-preview-image alt="" />
  <figcaption class="images-browser-preview-caption" data-images-preview-caption></figcaption>
  <p class="images-browser-preview-status" data-images-generate-status aria-live="polite"></p>
</figure>`;

    previewOverlay.querySelector("[data-images-generate-webp]")?.addEventListener("click", (event) => {
      event.stopPropagation();
      generateAndPushWebpVariants(previewOverlay).catch((err) => {
        setGenerateStatus(previewOverlay, err?.message || String(err), "error");
      });
    });

    previewOverlay.querySelectorAll("[data-images-preview-close]").forEach((btn) => {
      btn.addEventListener("click", closeImagePreview);
    });
    previewOverlay.addEventListener("click", (event) => {
      if (event.target === previewOverlay) {
        closeImagePreview();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && previewOverlay && !previewOverlay.hidden) {
        closeImagePreview();
      }
    });

    document.body.appendChild(previewOverlay);
    return previewOverlay;
  }

  function openImagePreview({ src, title, url, entry, ctx }) {
    const fallbackSrc = String(src || "").trim();
    if (!fallbackSrc && !entry) {
      return;
    }
    const overlay = ensurePreviewOverlay();
    const img = overlay.querySelector("[data-images-preview-image]");
    const caption = overlay.querySelector("[data-images-preview-caption]");
    const genBtn = overlay.querySelector("[data-images-generate-webp]");
    if (!img || !caption) {
      return;
    }
    previewState = entry && ctx ? { entry, ctx } : null;
    img.removeAttribute("src");
    img.removeAttribute("crossorigin");
    img.alt = String(title || "").trim() || "Image preview";
    caption.textContent = String(url || title || "").trim();
    setGenerateStatus(overlay, "", null);
    if (genBtn) {
      const canGenerate = Boolean(previewState && isRasterImageFile(entry) && supportsWebpEncoding());
      genBtn.hidden = !canGenerate;
      genBtn.title = canGenerate
        ? "Move original into a folder named after the image, then add il_75x75, il_570xN, and il_fullxfull WebP variants (one commit)"
        : "WebP generation is not available for this file";
    }
    overlay.hidden = false;
    document.body.classList.add("images-browser-preview-open");
    overlay.querySelector(".images-browser-preview-close")?.focus();

    const loadPreview = async () => {
      if (entry && ctx && isRasterImageFile(entry)) {
        const objectUrl = await fetchImageObjectUrl(entry, ctx);
        if (objectUrl) {
          img.src = objectUrl;
          return;
        }
      }
      if (fallbackSrc) {
        img.src = fallbackSrc;
      }
    };
    loadPreview().catch(() => {
      if (fallbackSrc) {
        img.src = fallbackSrc;
      }
    });
  }

  function bindImagePreviewOpeners({ thumb, name, entry, publicUrl, ctx }) {
    const open = () => {
      const src = String(thumb?.src || thumb?.dataset.publicUrl || publicUrl || "").trim();
      if (!src && !entry) {
        return;
      }
      openImagePreview({ src, title: entry.name, url: publicUrl, entry, ctx });
    };
    thumb?.addEventListener("click", (event) => {
      event.stopPropagation();
      open();
    });
    name?.addEventListener("click", (event) => {
      event.stopPropagation();
      open();
    });
    name?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatBytes(size) {
    const n = Number(size);
    if (!Number.isFinite(n) || n <= 0) {
      return "";
    }
    if (n < 1024) {
      return `${n} B`;
    }
    if (n < 1024 * 1024) {
      return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
    }
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  function supportsWebpEncoding() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  }

  function buildImageSetPaths(sourcePath) {
    const normalized = String(sourcePath || "")
      .trim()
      .replace(/^\/+/, "");
    const parts = normalized.split("/").filter(Boolean);
    const fileName = parts.pop() || "image";
    const dir = parts.join("/");
    const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
    const parentFolder = parts.length ? parts[parts.length - 1] : "";
    const alreadyInSetFolder = parentFolder === baseName;

    const imageDir = alreadyInSetFolder ? dir : dir ? `${dir}/${baseName}` : baseName;
    const originalPath = `${imageDir}/${fileName}`;
    const deleteSourcePath = alreadyInSetFolder ? null : normalized;

    return {
      imageDir,
      originalPath,
      deleteSourcePath,
      variants: [
        { path: `${imageDir}/il_75x75.${baseName}.webp`, maxWidth: 75 },
        { path: `${imageDir}/il_570xN.${baseName}.webp`, maxWidth: 570 },
        { path: `${imageDir}/il_fullxfull.${baseName}.webp`, maxWidth: null },
      ],
    };
  }

  async function loadBitmapFromImage(img) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(img, { imageOrientation: "from-image" });
      } catch {
        /* fall through */
      }
    }
    return img;
  }

  async function imageToWebpBytes(source, maxWidth) {
    const isBitmap = typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap;
    let bitmap = source;
    let closeBitmap = false;
    if (!isBitmap) {
      bitmap = await loadBitmapFromImage(source);
      closeBitmap = bitmap !== source && typeof bitmap.close === "function";
    }
    try {
      const naturalWidth = bitmap.width ?? source.naturalWidth;
      const naturalHeight = bitmap.height ?? source.naturalHeight;
      if (!naturalWidth || !naturalHeight) {
        throw new Error("Image has no dimensions.");
      }
      const targetWidth = maxWidth ? Math.min(maxWidth, naturalWidth) : naturalWidth;
      const targetHeight = Math.max(1, Math.round(naturalHeight * (targetWidth / naturalWidth)));
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Canvas is not available.");
      }
      ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob(
          (result) => {
            if (result) {
              resolve(result);
            } else {
              reject(new Error("WebP encoding failed. Try a different browser."));
            }
          },
          "image/webp",
          WEBP_QUALITY,
        );
      });
      const buffer = await blob.arrayBuffer();
      return new Uint8Array(buffer);
    } finally {
      if (closeBitmap) {
        bitmap.close();
      }
    }
  }

  async function generateWebpVariantFiles(sourceImage, sourcePath, originalBytes) {
    const layout = buildImageSetPaths(sourcePath);
    const files = [];

    if (layout.deleteSourcePath) {
      if (!originalBytes?.length) {
        throw new Error("Could not read original file for move.");
      }
      files.push({ path: layout.originalPath, bytes: originalBytes });
    }

    for (const output of layout.variants) {
      const bytes = await imageToWebpBytes(sourceImage, output.maxWidth);
      files.push({ path: output.path, bytes });
    }

    return {
      files,
      deletes: layout.deleteSourcePath ? [layout.deleteSourcePath] : [],
      imageDir: layout.imageDir,
    };
  }

  function setGenerateStatus(overlay, message, kind) {
    const el = overlay?.querySelector("[data-images-generate-status]");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.classList.remove("images-browser-preview-status--error", "images-browser-preview-status--ok");
    if (kind === "error") {
      el.classList.add("images-browser-preview-status--error");
    } else if (kind === "ok") {
      el.classList.add("images-browser-preview-status--ok");
    }
  }

  async function generateAndPushWebpVariants(overlay) {
    if (!previewState?.entry || !previewState?.ctx) {
      throw new Error("No image selected.");
    }
    if (!window.githubAuth?.commitImagesRepoBinaryFiles) {
      throw new Error("GitHub image commit is not available.");
    }
    if (!supportsWebpEncoding()) {
      throw new Error("This browser cannot encode WebP.");
    }
    const { entry, ctx } = previewState;
    const btn = overlay.querySelector("[data-images-generate-webp]");
    if (btn) {
      btn.disabled = true;
    }
    let source = null;
    try {
      setGenerateStatus(overlay, "Loading image…", null);
      source = await loadImageForCanvas(entry, ctx);
      const originalBytes = new Uint8Array(await (await fetchImageBlob(entry, ctx)).arrayBuffer());
      setGenerateStatus(overlay, "Generating WebP variants…", null);
      const result = await generateWebpVariantFiles(source, entry.path, originalBytes);
      setGenerateStatus(overlay, "Pushing to GitHub…", null);
      const baseName = entry.path.split("/").pop() || entry.name;
      const commit = await window.githubAuth.commitImagesRepoBinaryFiles({
        message: `Add WebP set for ${baseName} in ${result.imageDir}/`,
        files: result.files,
        deletes: result.deletes,
      });
      const sha = commit?.sha ? String(commit.sha).slice(0, 7) : "ok";
      const paths = result.files.map((f) => f.path).join(", ");
      const moveNote = result.deletes.length ? ` Moved original into ${result.imageDir}/.` : "";
      setGenerateStatus(overlay, `Pushed ${result.files.length} files (${sha}): ${paths}.${moveNote}`, "ok");
      if (typeof reloadTreeCallback === "function") {
        reloadTreeCallback();
      }
    } finally {
      releaseCanvasSource(source);
      if (btn) {
        btn.disabled = false;
      }
    }
  }

  function sortEntries(entries) {
    return entries.slice().sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "dir" ? -1 : 1;
      }
      return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
    });
  }

  const FOLDER_PREVIEW_MAX_SUBDIRS = 10;

  async function listDirectoryCached(dirPath, ctx, state) {
    if (!state.dirCache) {
      state.dirCache = new Map();
    }
    const key = String(dirPath || "");
    if (state.dirCache.has(key)) {
      return state.dirCache.get(key);
    }
    const entries = await window.githubAuth.listRepoDirectory(
      ctx.owner,
      ctx.repo,
      dirPath,
      ctx.branch,
    );
    state.dirCache.set(key, entries);
    return entries;
  }

  function pickSmallerImage(a, b) {
    if (!a) {
      return b;
    }
    if (!b) {
      return a;
    }
    const sizeA = Number(a.size);
    const sizeB = Number(b.size);
    const bytesA = Number.isFinite(sizeA) && sizeA > 0 ? sizeA : Infinity;
    const bytesB = Number.isFinite(sizeB) && sizeB > 0 ? sizeB : Infinity;
    return bytesB < bytesA ? b : a;
  }

  function pickSmallestImage(entries) {
    let best = null;
    for (const entry of entries) {
      if (entry.type !== "file" || !isImageFile(entry)) {
        continue;
      }
      const name = entryBaseName(entry);
      if (/^il_75x75\./i.test(name) || /-75\.webp$/i.test(name)) {
        return entry;
      }
      best = pickSmallerImage(best, entry);
    }
    return best;
  }

  async function findSmallestImageInFolder(dirPath, ctx, state, depth = 0) {
    const MAX_DEPTH = 2;
    const entries = await listDirectoryCached(dirPath, ctx, state);
    let best = pickSmallestImage(entries);
    if (best && (/^il_75x75\./i.test(entryBaseName(best)) || /-75\.webp$/i.test(entryBaseName(best)))) {
      return best;
    }
    if (depth >= MAX_DEPTH) {
      return best;
    }

    const subdirs = entries
      .filter((entry) => entry.type === "dir")
      .sort((a, b) => {
        const aWebp = a.name.toLowerCase() === "webp" ? -1 : 0;
        const bWebp = b.name.toLowerCase() === "webp" ? -1 : 0;
        if (aWebp !== bWebp) {
          return aWebp - bWebp;
        }
        return String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" });
      })
      .slice(0, FOLDER_PREVIEW_MAX_SUBDIRS);

    for (const dir of subdirs) {
      try {
        const nested = await findSmallestImageInFolder(dir.path, ctx, state, depth + 1);
        if (nested && (/^il_75x75\./i.test(entryBaseName(nested)) || /-75\.webp$/i.test(entryBaseName(nested)))) {
          return nested;
        }
        best = pickSmallerImage(best, nested);
      } catch {
        /* skip unreadable subfolder */
      }
    }

    return best;
  }

  async function loadFolderPreviewThumb(thumb, wrap, folderEntry, ctx, state) {
    if (wrap.dataset.previewLoaded === "1" || wrap.dataset.previewLoading === "1") {
      return;
    }
    wrap.dataset.previewLoading = "1";
    try {
      const imageEntry = await findSmallestImageInFolder(folderEntry.path, ctx, state);
      if (!imageEntry || !thumb.isConnected) {
        return;
      }
      thumb.hidden = false;
      await loadThumbnail(thumb, imageEntry, ctx);
      if (!thumb.classList.contains("images-browser-thumb--failed")) {
        wrap.classList.add("images-browser-folder-preview-wrap--loaded");
        wrap.dataset.previewLoaded = "1";
      } else {
        thumb.hidden = true;
      }
    } catch {
      thumb.hidden = true;
    } finally {
      delete wrap.dataset.previewLoading;
    }
  }

  function scheduleFolderPreview(wrap, thumb, folderEntry, ctx, state, row) {
    const run = () => loadFolderPreviewThumb(thumb, wrap, folderEntry, ctx, state);
    const scrollRoot = state.scrollRoot || null;

    if (typeof IntersectionObserver === "undefined") {
      run();
      return;
    }

    let started = false;
    const startOnce = () => {
      if (started) {
        return;
      }
      started = true;
      observer.disconnect();
      run();
    };

    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) {
          startOnce();
        }
      },
      { root: scrollRoot, rootMargin: "64px", threshold: 0 },
    );
    observer.observe(row);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const rowRect = row.getBoundingClientRect();
        if (!rowRect.height) {
          return;
        }
        const rootRect = scrollRoot
          ? scrollRoot.getBoundingClientRect()
          : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
        const visible =
          rowRect.bottom > rootRect.top &&
          rowRect.top < rootRect.bottom &&
          rowRect.right > rootRect.left &&
          rowRect.left < rootRect.right;
        if (visible) {
          startOnce();
        }
      });
    });
  }

  function buildRepoSelectOptions(repos, selected) {
    const opts = ['<option value="">— Select images repository —</option>'];
    for (const r of repos) {
      const name = r.full_name;
      const sel = name === selected ? " selected" : "";
      opts.push(`<option value="${escapeHtml(name)}"${sel}>${escapeHtml(name)}</option>`);
    }
    return opts.join("");
  }

  async function loadReposIntoSelect(select, selected) {
    if (!select || !window.githubAuth?.fetchWritableRepos) {
      return;
    }
    select.disabled = true;
    try {
      const repos = await window.githubAuth.fetchWritableRepos();
      const current = selected || window.githubAuth.getSelectedImagesRepo?.() || "";
      select.innerHTML = buildRepoSelectOptions(repos, current);
      if (!window.githubAuth.getSelectedImagesRepo?.() && repos.length === 1) {
        select.value = repos[0].full_name;
        window.githubAuth.setSelectedImagesRepo(repos[0].full_name);
      }
    } finally {
      select.disabled = false;
    }
  }

  function getRepoContext() {
    const fullName = window.githubAuth?.getSelectedImagesRepo?.() || "";
    const parsed = window.githubAuth?.parseRepoFullName?.(fullName);
    if (!parsed) {
      return null;
    }
    return {
      ...parsed,
      branch: window.githubAuth.getBranch(),
    };
  }

  function setStatus(root, message, kind) {
    const el = root.querySelector("[data-images-browser-status]");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.classList.remove("images-browser-status--error", "images-browser-status--ok");
    if (kind === "error") {
      el.classList.add("images-browser-status--error");
    } else if (kind === "ok") {
      el.classList.add("images-browser-status--ok");
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      window.prompt("Copy URL:", text);
      return false;
    }
  }

  function createDeleteButton(entry) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "images-browser-delete";
    btn.textContent = "Delete";
    const isDir = entry.type === "dir";
    const label = String(entry.path || entry.name || "item").trim();
    btn.setAttribute("aria-label", isDir ? `Delete folder ${label}` : `Delete ${label}`);
    btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmMessage = isDir
        ? `Delete folder "${label}" and all files inside it from the images repository?`
        : `Delete "${label}" from the images repository?`;
      if (!window.confirm(confirmMessage)) {
        return;
      }
      if (!window.githubAuth?.deleteImagesRepoEntry) {
        window.alert("Delete is not available.");
        return;
      }
      btn.disabled = true;
      const previousText = btn.textContent;
      btn.textContent = "Deleting…";
      try {
        await window.githubAuth.deleteImagesRepoEntry(entry);
        if (typeof reloadTreeCallback === "function") {
          reloadTreeCallback();
        }
      } catch (err) {
        window.alert(err?.message || String(err));
      } finally {
        btn.disabled = false;
        btn.textContent = previousText;
      }
    });
    return btn;
  }

  function createFileRow(entry, depth, ctx, picker) {
    const row = document.createElement("div");
    row.className = "images-browser-row";
    row.style.setProperty("--tree-depth", String(depth));

    const spacer = document.createElement("span");
    spacer.className = "images-browser-toggle";
    spacer.setAttribute("aria-hidden", "true");
    row.appendChild(spacer);

    const publicUrl = buildImagePublicUrl(entry, ctx);
    const isImage = isImageFile(entry);

    if (isImage) {
      row.classList.add("images-browser-row--image");
      const thumb = document.createElement("img");
      thumb.className = "images-browser-thumb";
      thumb.alt = entry.name;
      thumb.decoding = "async";
      row.appendChild(thumb);
      loadThumbnail(thumb, entry, ctx);
    } else {
      const icon = document.createElement("span");
      icon.className = "images-browser-icon";
      icon.textContent = "📄";
      icon.setAttribute("aria-hidden", "true");
      row.appendChild(icon);
    }

    const nameWrap = document.createElement("div");
    nameWrap.className = "images-browser-name-wrap";

    const name = document.createElement("span");
    name.className = "images-browser-name";
    name.textContent = entry.name;
    name.title = publicUrl || entry.path;
    if (isImage) {
      name.tabIndex = 0;
      name.setAttribute("role", "button");
      name.setAttribute(
        "aria-label",
        picker?.onSelect ? `Use ${entry.name}` : `Preview ${entry.name}`,
      );
    }
    nameWrap.appendChild(name);

    if (publicUrl) {
      const pathHint = document.createElement("span");
      pathHint.className = "images-browser-path";
      pathHint.textContent = publicUrl;
      pathHint.title = publicUrl;
      nameWrap.appendChild(pathHint);
    }

    row.appendChild(nameWrap);

    const size = formatBytes(entry.size);
    if (size) {
      const meta = document.createElement("span");
      meta.className = "images-browser-meta";
      meta.textContent = size;
      row.appendChild(meta);
    }

    const actions = document.createElement("div");
    actions.className = "images-browser-actions";
    if (picker?.onSelect && isImage && publicUrl) {
      row.classList.add("images-browser-row--selectable");
      const selectBtn = document.createElement("button");
      selectBtn.type = "button";
      selectBtn.className = "images-browser-select";
      selectBtn.textContent = "Use";
      selectBtn.setAttribute("aria-label", `Use ${entry.name}`);
      const selectImage = (event) => {
        event.stopPropagation();
        picker.onSelect(publicUrl);
      };
      selectBtn.addEventListener("click", selectImage);
      actions.appendChild(selectBtn);
      const thumbEl = row.querySelector(".images-browser-thumb");
      thumbEl?.addEventListener("click", selectImage);
      name.addEventListener("click", selectImage);
    } else {
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "images-browser-copy";
      copyBtn.textContent = "Copy URL";
      copyBtn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const url = publicUrl || entry.path;
        const ok = await copyText(url);
        if (ok) {
          copyBtn.textContent = "Copied";
          window.setTimeout(() => {
            copyBtn.textContent = "Copy URL";
          }, 1500);
        }
      });
      actions.appendChild(copyBtn);
      actions.appendChild(createDeleteButton(entry));
      if (isImage) {
        bindImagePreviewOpeners({
          thumb: row.querySelector(".images-browser-thumb"),
          name,
          entry,
          publicUrl,
          ctx,
        });
      }
    }
    row.appendChild(actions);

    return row;
  }

  function createFolderNode(entry, depth, ctx, state, picker) {
    const block = document.createElement("div");
    block.className = "images-browser-node";
    block.dataset.dirPath = entry.path;

    const row = document.createElement("div");
    row.className = "images-browser-row";
    row.style.setProperty("--tree-depth", String(depth));

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "images-browser-toggle";
    toggle.textContent = "▸";
    toggle.setAttribute("aria-label", `Expand ${entry.name}`);
    toggle.setAttribute("aria-expanded", "false");
    row.appendChild(toggle);

    const previewWrap = document.createElement("span");
    previewWrap.className = "images-browser-folder-preview-wrap";

    const icon = document.createElement("span");
    icon.className = "images-browser-icon";
    icon.textContent = "📁";
    icon.setAttribute("aria-hidden", "true");
    previewWrap.appendChild(icon);

    const thumb = document.createElement("img");
    thumb.className = "images-browser-thumb";
    thumb.alt = "";
    thumb.decoding = "async";
    thumb.hidden = true;
    previewWrap.appendChild(thumb);

    row.appendChild(previewWrap);
    scheduleFolderPreview(previewWrap, thumb, entry, ctx, state, row);

    const name = document.createElement("span");
    name.className = "images-browser-name images-browser-name--dir";
    name.textContent = entry.name;
    name.title = entry.path;
    row.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "images-browser-actions";
    if (!picker?.onSelect) {
      actions.appendChild(createDeleteButton(entry));
    }
    row.appendChild(actions);

    const childrenWrap = document.createElement("div");
    childrenWrap.className = "images-browser-children";
    childrenWrap.hidden = true;

    let loaded = false;
    let loading = false;

    async function loadChildren() {
      if (loaded || loading) {
        return;
      }
      loading = true;
      childrenWrap.innerHTML = `<div class="images-browser-loading" style="padding:8px 12px">Loading…</div>`;
      try {
        const entries = await listDirectoryCached(entry.path, ctx, state);
        childrenWrap.innerHTML = "";
        renderEntries(childrenWrap, sortEntries(entries), depth + 1, ctx, state, picker);
        loaded = true;
      } catch (err) {
        childrenWrap.innerHTML = `<div class="images-browser-error" style="padding:8px 12px">${escapeHtml(err?.message || String(err))}</div>`;
      } finally {
        loading = false;
      }
    }

    function setExpanded(open) {
      toggle.classList.toggle("images-browser-toggle--open", open);
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? `Collapse ${entry.name}` : `Expand ${entry.name}`);
      childrenWrap.hidden = !open;
      if (open) {
        loadChildren();
      }
    }

    toggle.addEventListener("click", (event) => {
      event.stopPropagation();
      setExpanded(childrenWrap.hidden);
    });
    name.addEventListener("click", () => {
      setExpanded(childrenWrap.hidden);
    });

    block.appendChild(row);
    block.appendChild(childrenWrap);
    return block;
  }

  function renderEntries(container, entries, depth, ctx, state, picker) {
    for (const entry of entries) {
      if (entry.type === "dir") {
        container.appendChild(createFolderNode(entry, depth, ctx, state, picker));
      } else {
        container.appendChild(createFileRow(entry, depth, ctx, picker));
      }
    }
  }

  async function loadRootTree(treeRoot, panelRoot, picker) {
    const ctx = getRepoContext();
    if (!ctx) {
      treeRoot.innerHTML = `<div class="images-browser-tree--empty">Select an images repository above.</div>`;
      setStatus(panelRoot, "", null);
      return;
    }
    treeRoot.innerHTML = `<div class="images-browser-loading" style="padding:16px">Loading repository…</div>`;
    setStatus(panelRoot, `Loading ${ctx.owner}/${ctx.repo}@${ctx.branch}…`, null);
    try {
      const entries = await window.githubAuth.listRepoDirectory(ctx.owner, ctx.repo, "", ctx.branch);
      treeRoot.innerHTML = "";
      treeRoot.classList.remove("images-browser-tree--empty");
      if (!entries.length) {
        treeRoot.innerHTML = `<div class="images-browser-tree--empty">This repository is empty.</div>`;
      } else {
        const state = { scrollRoot: treeRoot };
        renderEntries(treeRoot, sortEntries(entries), 0, ctx, state, picker);
      }
      setStatus(panelRoot, `${ctx.owner}/${ctx.repo}@${ctx.branch}`, null);
    } catch (err) {
      treeRoot.innerHTML = "";
      setStatus(panelRoot, err?.message || String(err), "error");
    }
  }

  function renderSignedOutBody(body) {
    body.innerHTML = `<p class="images-browser-intro">Browse files in a separate GitHub repository (for example an images or assets repo). Expand folders to explore and copy <code>github.com/…/blob/…?raw=true</code> image URLs for use in content or product editors.</p>
<p class="images-browser-muted">Sign in to GitHub above, then open this section again.</p>`;
  }

  async function handleImageUpload(file, panelRoot) {
    if (!file) {
      return;
    }
    if (!window.imageRepoSave?.uploadLocalImageToRepo) {
      throw new Error("Image upload is not available.");
    }
    const ctx = getRepoContext();
    if (!ctx) {
      throw new Error("Select an images repository first.");
    }

    setStatus(panelRoot, `Uploading ${file.name}…`, null);
    const result = await window.imageRepoSave.uploadLocalImageToRepo(file);
    if (!result) {
      setStatus(panelRoot, "Upload cancelled.", null);
      return;
    }

    await copyText(result.publicUrl);
    setStatus(
      panelRoot,
      `Uploaded ${result.repoPath}. URL copied to clipboard.`,
      "ok",
    );
    if (typeof reloadTreeCallback === "function") {
      reloadTreeCallback();
    }
  }

  function mountSignedInBody(body, details) {
    body.innerHTML = `<p class="images-browser-intro">Browse files in a separate GitHub repository. Expand folders to explore. <strong>Upload image</strong> adds a local file (choose the destination folder in the dialog). Click a thumbnail to preview at hero size, then <strong>Generate WebP sizes</strong> to move the original into a folder named after the image and add <code>il_75x75</code>, <code>il_570xN</code>, and <code>il_fullxfull</code> WebP variants (one commit). <strong>Copy URL</strong> copies a <code>github.com/…/blob/…?raw=true</code> link.</p>
<div class="images-browser-toolbar">
  <label for="images-repo-select">Images repository</label>
  <select id="images-repo-select" data-images-repo-select aria-label="GitHub images repository"></select>
  <label class="images-browser-upload" data-images-upload>
    Upload image
    <input type="file" data-images-upload-input accept="image/*,.svg" hidden />
  </label>
  <button type="button" data-images-refresh-repos>Refresh repos</button>
  <button type="button" data-images-reload-tree>Reload tree</button>
</div>
<div class="images-browser-tree" data-images-browser-tree><div class="images-browser-tree--empty">Select an images repository to browse files.</div></div>
<p class="images-browser-status" data-images-browser-status></p>`;

    const toolbar = body.querySelector(".images-browser-toolbar");
    const select = toolbar.querySelector("[data-images-repo-select]");
    const reloadBtn = toolbar.querySelector("[data-images-reload-tree]");
    const refreshReposBtn = toolbar.querySelector("[data-images-refresh-repos]");
    const uploadLabel = toolbar.querySelector("[data-images-upload]");
    const uploadInput = toolbar.querySelector("[data-images-upload-input]");
    const tree = body.querySelector("[data-images-browser-tree]");

    let rootLoaded = false;

    const maybeLoadRoot = () => {
      if (!details.open) {
        return;
      }
      if (!window.githubAuth.getSelectedImagesRepo?.()) {
        return;
      }
      rootLoaded = true;
      loadRootTree(tree, body);
    };

    select.addEventListener("change", () => {
      window.githubAuth.setSelectedImagesRepo(select.value);
      rootLoaded = false;
      if (details.open) {
        maybeLoadRoot();
      } else {
        tree.innerHTML = `<div class="images-browser-tree--empty">Open this section to browse files.</div>`;
        setStatus(body, "", null);
      }
    });

    reloadBtn.addEventListener("click", () => {
      rootLoaded = false;
      maybeLoadRoot();
    });

    refreshReposBtn.addEventListener("click", () => {
      loadReposIntoSelect(select, select.value).catch((err) => {
        setStatus(body, err?.message || String(err), "error");
      });
    });

    uploadInput.addEventListener("click", (event) => {
      if (!getRepoContext()) {
        event.preventDefault();
        setStatus(body, "Select an images repository first.", "error");
      }
    });

    uploadInput.addEventListener("change", () => {
      const file = uploadInput.files?.[0];
      if (!file) {
        return;
      }
      uploadLabel.classList.add("images-browser-upload--disabled");
      handleImageUpload(file, body)
        .catch((err) => {
          setStatus(body, err?.message || String(err), "error");
        })
        .finally(() => {
          uploadLabel.classList.remove("images-browser-upload--disabled");
          uploadInput.value = "";
        });
    });

    loadReposIntoSelect(select).then(() => {
      if (window.githubAuth.getSelectedImagesRepo?.() && details.open) {
        maybeLoadRoot();
      }
    });

    reloadTreeCallback = () => {
      rootLoaded = false;
      maybeLoadRoot();
    };

    return { maybeLoadRoot, resetLoaded: () => {
      rootLoaded = false;
    } };
  }

  function initImagesBrowser(options = {}) {
    const rootId = options.rootId || "images-browser-root";
    const root = document.getElementById(rootId);
    if (!root) {
      return;
    }

    root.innerHTML = "";
    root.classList.add("images-browser-panel");

    const details = document.createElement("details");
    details.className = "images-browser-details";

    const summary = document.createElement("summary");
    summary.className = "images-browser-summary";
    summary.textContent = "Images";

    const body = document.createElement("div");
    body.className = "images-browser-body";

    let signedInController = null;

    const refreshAuthState = () => {
      if (!window.githubAuth?.isSignedIn?.()) {
        signedInController = null;
        renderSignedOutBody(body);
        return;
      }
      const needsSignedInUi = !body.querySelector("[data-images-upload]");
      if (!signedInController || needsSignedInUi) {
        signedInController = mountSignedInBody(body, details);
      }
      if (details.open) {
        signedInController.maybeLoadRoot();
      }
    };

    renderSignedOutBody(body);
    if (window.githubAuth?.isSignedIn?.()) {
      signedInController = mountSignedInBody(body, details);
    }

    details.addEventListener("toggle", () => {
      if (!details.open) {
        return;
      }
      refreshAuthState();
    });

    details.appendChild(summary);
    details.appendChild(body);
    root.appendChild(details);

    const hubRoot = document.getElementById("github-auth-root");
    if (hubRoot) {
      const observer = new MutationObserver(() => {
        if (!window.githubAuth?.isSignedIn?.()) {
          return;
        }
        const needsSignedInUi = !body.querySelector("[data-images-upload]");
        if (!signedInController || needsSignedInUi) {
          refreshAuthState();
        }
      });
      observer.observe(hubRoot, { childList: true, subtree: true });
    }
  }

  /**
   * @param {HTMLElement} container
   * @param {{ onSelect?: (url: string) => void }} [options]
   * @returns {{ reload: () => Promise<void>, destroy: () => void }}
   */
  function mountImagesRepoPicker(container, options = {}) {
    const onSelect = typeof options.onSelect === "function" ? options.onSelect : null;
    const picker = onSelect ? { onSelect } : null;

    container.classList.add("images-browser-picker");
    container.replaceChildren();

    const setPickerStatus = (message, kind) => {
      const el = container.querySelector("[data-images-browser-status]");
      if (!el) {
        return;
      }
      el.textContent = message || "";
      el.classList.remove("images-browser-status--error", "images-browser-status--ok");
      if (kind === "error") {
        el.classList.add("images-browser-status--error");
      } else if (kind === "ok") {
        el.classList.add("images-browser-status--ok");
      }
    };

    if (!window.githubAuth?.isSignedIn?.()) {
      container.innerHTML =
        '<p class="content-edit-product-empty">Sign in to GitHub to browse the images repository.</p>';
      return {
        reload: async () => {},
        destroy: () => {
          container.replaceChildren();
        },
      };
    }

    const ctx = getRepoContext();
    if (!ctx) {
      container.innerHTML =
        '<p class="content-edit-product-empty">Select an images repository in the site generator <strong>Images</strong> section first (the same GitHub settings apply here).</p>';
      return {
        reload: async () => {},
        destroy: () => {
          container.replaceChildren();
        },
      };
    }

    container.innerHTML = `<div class="content-edit-repo-picker-toolbar">
  <span class="content-edit-repo-picker-repo">${escapeHtml(`${ctx.owner}/${ctx.repo}@${ctx.branch}`)}</span>
  <button type="button" class="content-edit-repo-picker-reload" data-images-picker-reload>Reload</button>
</div>
<div class="images-browser-tree content-edit-repo-picker-tree" data-images-picker-tree></div>
<p class="images-browser-status content-edit-repo-picker-status" data-images-browser-status aria-live="polite"></p>`;

    const tree = container.querySelector("[data-images-picker-tree]");
    const reloadBtn = container.querySelector("[data-images-picker-reload]");

    const reload = async () => {
      if (!tree) {
        return;
      }
      reloadBtn.disabled = true;
      try {
        await loadRootTree(tree, container, picker);
      } finally {
        reloadBtn.disabled = false;
      }
    };

    reloadBtn?.addEventListener("click", () => {
      reload().catch((err) => {
        setPickerStatus(err?.message || String(err), "error");
      });
    });

    reload().catch((err) => {
      setPickerStatus(err?.message || String(err), "error");
    });

    return {
      reload,
      destroy: () => {
        container.replaceChildren();
        container.classList.remove("images-browser-picker");
      },
    };
  }

  window.imagesBrowser = {
    initImagesBrowser,
    mountImagesRepoPicker,
  };
})();
