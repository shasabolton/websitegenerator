(function () {
  const IMAGE_EXT = /\.(avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;
  const RASTER_IMAGE_EXT = /\.(avif|bmp|gif|ico|jpe?g|png|webp)$/i;
  const WEBP_QUALITY = 0.85;

  let reloadTreeCallback = null;
  let previewState = null;

  function buildImageMediaUrl(entry, ctx) {
    if (!window.githubAuth?.buildMediaContentUrl) {
      return "";
    }
    return window.githubAuth.buildMediaContentUrl(ctx.owner, ctx.repo, entry.path, ctx.branch);
  }

  async function fetchImageBlob(entry, ctx) {
    const mediaUrl = buildImageMediaUrl(entry, ctx);
    if (mediaUrl) {
      try {
        const response = await fetch(mediaUrl, { mode: "cors", cache: "no-store" });
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
        return new Blob([bytes], { type: "image/jpeg" });
      }
    }

    throw new Error("Could not download image for processing.");
  }

  async function fetchImageObjectUrl(entry, ctx) {
    try {
      const blob = await fetchImageBlob(entry, ctx);
      return URL.createObjectURL(blob);
    } catch {
      return null;
    }
  }

  async function loadImageForCanvas(entry, ctx) {
    const blob = await fetchImageBlob(entry, ctx);
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

  function loadThumbnail(thumb, entry, ctx) {
    const mediaUrl = buildImageMediaUrl(entry, ctx);
    if (!mediaUrl) {
      thumb.classList.add("images-browser-thumb--failed");
      return;
    }
    thumb.dataset.mediaUrl = mediaUrl;
    thumb.classList.add("images-browser-thumb--loading");
    thumb.addEventListener(
      "load",
      () => {
        thumb.classList.remove("images-browser-thumb--loading", "images-browser-thumb--failed");
      },
      { once: true },
    );
    thumb.addEventListener(
      "error",
      () => {
        fetchImageObjectUrl(entry, ctx)
          .then((objectUrl) => {
            if (!objectUrl) {
              thumb.classList.add("images-browser-thumb--failed");
              thumb.classList.remove("images-browser-thumb--loading");
              return;
            }
            thumb.src = objectUrl;
            thumb.classList.remove("images-browser-thumb--loading");
          })
          .catch(() => {
            thumb.classList.add("images-browser-thumb--failed");
            thumb.classList.remove("images-browser-thumb--loading");
          });
      },
      { once: true },
    );
    thumb.crossOrigin = "anonymous";
    thumb.src = mediaUrl;
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
    const imageSrc = String(src || "").trim();
    if (!imageSrc) {
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
    img.crossOrigin = "anonymous";
    img.onerror = () => {
      if (!entry || !ctx) {
        return;
      }
      fetchImageObjectUrl(entry, ctx).then((objectUrl) => {
        if (!objectUrl) {
          return;
        }
        img.removeAttribute("crossorigin");
        img.src = objectUrl;
      });
    };
    img.src = imageSrc;
    img.alt = String(title || "").trim() || "Image preview";
    caption.textContent = String(url || title || "").trim();
    setGenerateStatus(overlay, "", null);
    if (genBtn) {
      const canGenerate = Boolean(previewState && isRasterImageFile(entry?.name) && supportsWebpEncoding());
      genBtn.hidden = !canGenerate;
      genBtn.title = canGenerate
        ? "Create 75px, 570px, and full WebP files in a webp/ folder (one commit)"
        : "WebP generation is not available for this file";
    }
    overlay.hidden = false;
    document.body.classList.add("images-browser-preview-open");
    overlay.querySelector(".images-browser-preview-close")?.focus();
  }

  function bindImagePreviewOpeners({ thumb, name, entry, mediaUrl, ctx }) {
    const open = () => {
      if (thumb?.classList.contains("images-browser-thumb--failed")) {
        return;
      }
      const src = String(thumb?.src || thumb?.dataset.mediaUrl || mediaUrl || "").trim();
      if (!src) {
        return;
      }
      openImagePreview({ src, title: entry.name, url: mediaUrl, entry, ctx });
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

  function isImageFile(name) {
    return IMAGE_EXT.test(String(name || ""));
  }

  function isRasterImageFile(name) {
    return RASTER_IMAGE_EXT.test(String(name || ""));
  }

  function supportsWebpEncoding() {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    return canvas.toDataURL("image/webp").startsWith("data:image/webp");
  }

  function buildVariantOutputPaths(sourcePath) {
    const normalized = String(sourcePath || "")
      .trim()
      .replace(/^\/+/, "");
    const parts = normalized.split("/");
    const fileName = parts.pop() || "image";
    const dir = parts.join("/");
    const baseName = fileName.replace(/\.[^.]+$/, "") || "image";
    const webpDir = dir ? `${dir}/webp` : "webp";
    return [
      { path: `${webpDir}/${baseName}-75.webp`, maxWidth: 75 },
      { path: `${webpDir}/${baseName}-570.webp`, maxWidth: 570 },
      { path: `${webpDir}/${baseName}.webp`, maxWidth: null },
    ];
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

  async function generateWebpVariantFiles(sourceImage, sourcePath) {
    const outputs = buildVariantOutputPaths(sourcePath);
    const files = [];
    for (const output of outputs) {
      const bytes = await imageToWebpBytes(sourceImage, output.maxWidth);
      files.push({ path: output.path, bytes });
    }
    return files;
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
      setGenerateStatus(overlay, "Generating WebP variants…", null);
      const files = await generateWebpVariantFiles(source, entry.path);
      setGenerateStatus(overlay, "Pushing to GitHub…", null);
      const baseName = entry.path.split("/").pop() || entry.name;
      const commit = await window.githubAuth.commitImagesRepoBinaryFiles({
        message: `Add WebP variants for ${baseName}`,
        files,
      });
      const sha = commit?.sha ? String(commit.sha).slice(0, 7) : "ok";
      const paths = files.map((f) => f.path).join(", ");
      setGenerateStatus(overlay, `Pushed ${files.length} files (${sha}): ${paths}`, "ok");
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

  function createFileRow(entry, depth, ctx) {
    const row = document.createElement("div");
    row.className = "images-browser-row";
    row.style.setProperty("--tree-depth", String(depth));

    const spacer = document.createElement("span");
    spacer.className = "images-browser-toggle";
    spacer.setAttribute("aria-hidden", "true");
    row.appendChild(spacer);

    const mediaUrl = buildImageMediaUrl(entry, ctx);
    const isImage = isImageFile(entry.name);

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
    name.title = mediaUrl || entry.path;
    if (isImage) {
      name.tabIndex = 0;
      name.setAttribute("role", "button");
      name.setAttribute("aria-label", `Preview ${entry.name}`);
    }
    nameWrap.appendChild(name);

    if (mediaUrl) {
      const pathHint = document.createElement("span");
      pathHint.className = "images-browser-path";
      pathHint.textContent = mediaUrl;
      pathHint.title = mediaUrl;
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
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "images-browser-copy";
    copyBtn.textContent = "Copy URL";
    copyBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const url = mediaUrl || entry.path;
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
    row.appendChild(actions);

    if (isImage) {
      bindImagePreviewOpeners({
        thumb: row.querySelector(".images-browser-thumb"),
        name,
        entry,
        mediaUrl,
        ctx,
      });
    }

    return row;
  }

  function createFolderNode(entry, depth, ctx, state) {
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

    const icon = document.createElement("span");
    icon.className = "images-browser-icon";
    icon.textContent = "📁";
    icon.setAttribute("aria-hidden", "true");
    row.appendChild(icon);

    const name = document.createElement("span");
    name.className = "images-browser-name images-browser-name--dir";
    name.textContent = entry.name;
    name.title = entry.path;
    row.appendChild(name);

    const actions = document.createElement("div");
    actions.className = "images-browser-actions";
    actions.appendChild(createDeleteButton(entry));
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
        const entries = await window.githubAuth.listRepoDirectory(
          ctx.owner,
          ctx.repo,
          entry.path,
          ctx.branch,
        );
        childrenWrap.innerHTML = "";
        renderEntries(childrenWrap, sortEntries(entries), depth + 1, ctx, state);
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

  function renderEntries(container, entries, depth, ctx, state) {
    for (const entry of entries) {
      if (entry.type === "dir") {
        container.appendChild(createFolderNode(entry, depth, ctx, state));
      } else {
        container.appendChild(createFileRow(entry, depth, ctx));
      }
    }
  }

  async function loadRootTree(treeRoot, panelRoot) {
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
        const state = {};
        renderEntries(treeRoot, sortEntries(entries), 0, ctx, state);
      }
      setStatus(panelRoot, `${ctx.owner}/${ctx.repo}@${ctx.branch}`, null);
    } catch (err) {
      treeRoot.innerHTML = "";
      setStatus(panelRoot, err?.message || String(err), "error");
    }
  }

  function renderSignedOutBody(body) {
    body.innerHTML = `<p class="images-browser-intro">Browse files in a separate GitHub repository (for example an images or assets repo). Expand folders to explore and copy <code>media.githubusercontent.com</code> URLs for use in content or product editors.</p>
<p class="images-browser-muted">Sign in to GitHub above, then open this section again.</p>`;
  }

  function mountSignedInBody(body, details) {
    body.innerHTML = `<p class="images-browser-intro">Browse files in a separate GitHub repository. Expand folders to explore. Click a thumbnail to preview at hero size, then <strong>Generate WebP sizes</strong> to add 75px, 570px, and full WebP files in a <code>webp/</code> folder (one commit). <strong>Copy URL</strong> copies a <code>media.githubusercontent.com</code> link.</p>
<div class="images-browser-toolbar">
  <label for="images-repo-select">Images repository</label>
  <select id="images-repo-select" data-images-repo-select aria-label="GitHub images repository"></select>
  <button type="button" data-images-refresh-repos>Refresh repos</button>
  <button type="button" data-images-reload-tree>Reload tree</button>
</div>
<div class="images-browser-tree" data-images-browser-tree><div class="images-browser-tree--empty">Select an images repository to browse files.</div></div>
<p class="images-browser-status" data-images-browser-status></p>`;

    const toolbar = body.querySelector(".images-browser-toolbar");
    const select = toolbar.querySelector("[data-images-repo-select]");
    const reloadBtn = toolbar.querySelector("[data-images-reload-tree]");
    const refreshReposBtn = toolbar.querySelector("[data-images-refresh-repos]");
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
      if (!signedInController) {
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
        if (window.githubAuth?.isSignedIn?.() && !signedInController) {
          refreshAuthState();
        }
      });
      observer.observe(hubRoot, { childList: true, subtree: true });
    }
  }

  window.imagesBrowser = {
    initImagesBrowser,
  };
})();
