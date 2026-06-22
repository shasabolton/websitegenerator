/**
 * Save an external or catalog image URL to the selected GitHub images repository.
 */
(function () {
  const JPEG_QUALITY = 0.92;
  const PRODUCT_IMAGE_SIZE_TOKEN = /\/il_(?:full[xX]full|\d+x[A-Za-z0-9]+)(?=\.\d)/i;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function resolveFullxfullUrl(url) {
    const u = String(url || "").trim();
    if (!u) {
      return "";
    }
    if (typeof window.productData?.productImageUrlForDisplay === "function") {
      return window.productData.productImageUrlForDisplay(u, "full");
    }
    if (PRODUCT_IMAGE_SIZE_TOKEN.test(u)) {
      return u.replace(PRODUCT_IMAGE_SIZE_TOKEN, "/il_fullxfull");
    }
    return u;
  }

  function deriveJpegFileName(imageUrl) {
    try {
      const pathname = new URL(imageUrl).pathname;
      const base = pathname.split("/").pop() || "";
      if (/\.jpe?g$/i.test(base)) {
        return base;
      }
      if (base) {
        const stem = base.replace(/\.[^.]+$/, "");
        return `${stem}.jpg`;
      }
    } catch {
      /* fall through */
    }
    return `il_fullxfull.${Date.now()}.jpg`;
  }

  function getImagesRepoContext() {
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

  function normalizeFolderPath(raw) {
    return String(raw || "")
      .trim()
      .replace(/^\/+/, "")
      .replace(/\/+$/, "");
  }

  function joinRepoPath(folder, fileName) {
    const dir = normalizeFolderPath(folder);
    const file = String(fileName || "")
      .trim()
      .replace(/^\/+/, "");
    return dir ? `${dir}/${file}` : file;
  }

  function sanitizeNewFolderName(raw) {
    return String(raw || "")
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\/+$/, "")
      .split("/")
      .filter(Boolean)
      .join("/");
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
    return "image/jpeg";
  }

  /**
   * @param {string} url
   * @returns {{ owner: string, repo: string, branch: string, path: string } | null}
   */
  function parseGithubContentUrl(url) {
    try {
      const u = new URL(String(url || "").trim());
      const host = u.hostname.toLowerCase();
      const parts = u.pathname.split("/").filter(Boolean);
      if (host === "raw.githubusercontent.com" && parts.length >= 3) {
        return {
          owner: parts[0],
          repo: parts[1],
          branch: parts[2],
          path: parts.slice(3).join("/"),
        };
      }
      if (host === "media.githubusercontent.com" && parts[0] === "media" && parts.length >= 4) {
        return {
          owner: parts[1],
          repo: parts[2],
          branch: parts[3],
          path: parts.slice(4).join("/"),
        };
      }
      if (host === "github.com" && parts.length >= 4 && parts[2] === "blob") {
        return {
          owner: parts[0],
          repo: parts[1],
          branch: parts[3],
          path: parts.slice(4).join("/"),
        };
      }
    } catch {
      /* not a GitHub content URL */
    }
    return null;
  }

  function isLikelyExternalCatalogUrl(url) {
    try {
      const host = new URL(String(url || "").trim()).hostname.toLowerCase();
      if (host === window.location.hostname.toLowerCase()) {
        return false;
      }
      return !parseGithubContentUrl(url);
    } catch {
      return true;
    }
  }

  function buildCorsProxyUrl(url) {
    const target = String(url || "").trim();
    return `https://wsrv.nl/?url=${encodeURIComponent(target)}&output=jpg`;
  }

  async function fetchUrlAsBlob(url, options) {
    const opts = options && typeof options === "object" ? options : {};
    const response = await fetch(url, {
      mode: "cors",
      cache: "no-store",
      referrerPolicy: opts.referrerPolicy || "no-referrer",
    });
    if (!response.ok) {
      throw new Error(`Could not download image (${response.status}).`);
    }
    const blob = await response.blob();
    if (!blob.size) {
      throw new Error("Downloaded image is empty.");
    }
    return blob;
  }

  async function fetchGithubRepoBlob(parsed) {
    if (!window.githubAuth?.getFileMeta) {
      throw new Error("GitHub file access is not available.");
    }
    const branch = parsed.branch || window.githubAuth.getBranch();
    const publicUrl =
      window.githubAuth.buildBlobRawContentUrl?.(parsed.owner, parsed.repo, parsed.path, branch) ||
      window.githubAuth.buildRawContentUrl?.(parsed.owner, parsed.repo, parsed.path, branch);
    if (publicUrl) {
      try {
        return await fetchUrlAsBlob(publicUrl);
      } catch {
        /* try authenticated download */
      }
    }

    const meta = await window.githubAuth.getFileMeta(parsed.owner, parsed.repo, parsed.path, branch);
    const downloadUrl = meta?.download_url || null;
    const token = window.githubAuth.getToken?.();
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

    const encoded = meta?.content;
    if (encoded) {
      const normalized = String(encoded).replace(/\s+/g, "");
      const binary = atob(normalized);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return new Blob([bytes], { type: mimeTypeFromPath(parsed.path) });
    }

    throw new Error("Could not download image from GitHub.");
  }

  async function imageElementToJpegBytes(img) {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    if (!width || !height) {
      throw new Error("Image has no dimensions.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas is not available.");
    }
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("JPEG encoding failed."));
          }
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function blobToJpegBytes(blob) {
    if (blob.type === "image/jpeg") {
      return new Uint8Array(await blob.arrayBuffer());
    }
    const objectUrl = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("Failed to decode image."));
        img.src = objectUrl;
      });
      return imageElementToJpegBytes(img);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function blobToJpegBytesIfNeeded(blob, sourceUrl) {
    if (blob.type === "image/jpeg" || /\.jpe?g($|\?)/i.test(String(sourceUrl || ""))) {
      return new Uint8Array(await blob.arrayBuffer());
    }
    return blobToJpegBytes(blob);
  }

  async function fetchImageAsJpegBytes(imageUrl) {
    const fullUrl = resolveFullxfullUrl(imageUrl);
    if (!fullUrl) {
      throw new Error("No image URL.");
    }

    const attempts = [];

    const githubRef = parseGithubContentUrl(fullUrl);
    if (githubRef?.path) {
      attempts.push(async () => {
        const blob = await fetchGithubRepoBlob(githubRef);
        return blobToJpegBytesIfNeeded(blob, fullUrl);
      });
    }

    attempts.push(async () => {
      const blob = await fetchUrlAsBlob(fullUrl);
      return blobToJpegBytesIfNeeded(blob, fullUrl);
    });

    if (isLikelyExternalCatalogUrl(fullUrl)) {
      attempts.push(async () => {
        const blob = await fetchUrlAsBlob(buildCorsProxyUrl(fullUrl));
        return blobToJpegBytesIfNeeded(blob, fullUrl);
      });
    }

    let lastError = null;
    for (const attempt of attempts) {
      try {
        return await attempt();
      } catch (err) {
        lastError = err;
      }
    }

    throw new Error(
      lastError?.message ||
        "Could not download image. The host may block browser downloads (CORS).",
    );
  }

  async function pathExistsInRepo(ctx, repoPath) {
    if (!window.githubAuth?.getFileMeta) {
      return false;
    }
    const meta = await window.githubAuth.getFileMeta(ctx.owner, ctx.repo, repoPath, ctx.branch);
    return Boolean(meta);
  }

  async function listFolders(ctx, dirPath) {
    const entries = await window.githubAuth.listRepoDirectory(ctx.owner, ctx.repo, dirPath, ctx.branch);
    return entries
      .filter((entry) => entry.type === "dir")
      .sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { sensitivity: "base" }));
  }

  function ensureFolderPickerDom() {
    let backdrop = document.querySelector("[data-image-repo-folder-modal]");
    if (backdrop) {
      return backdrop;
    }
    backdrop = document.createElement("div");
    backdrop.className = "content-edit-modal-backdrop image-repo-folder-backdrop";
    backdrop.setAttribute("data-image-repo-folder-modal", "");
    backdrop.hidden = true;
    backdrop.innerHTML = `<div class="content-edit-modal image-repo-folder-modal" role="dialog" aria-modal="true" aria-labelledby="image-repo-folder-title">
  <h2 id="image-repo-folder-title">Save to images repo</h2>
  <p class="image-repo-folder-file" data-image-repo-folder-file></p>
  <p class="image-repo-folder-repo" data-image-repo-folder-repo></p>
  <div class="image-repo-folder-nav">
    <span class="image-repo-folder-path" data-image-repo-folder-path></span>
    <button type="button" class="image-repo-folder-up" data-image-repo-folder-up hidden>← Up</button>
  </div>
  <div class="image-repo-folder-list" data-image-repo-folder-list role="listbox" aria-label="Folders"></div>
  <p class="image-repo-folder-status" data-image-repo-folder-status aria-live="polite"></p>
  <div class="content-edit-field">
    <label for="image-repo-new-folder">New folder (under current location)</label>
    <input id="image-repo-new-folder" type="text" data-image-repo-new-folder placeholder="e.g. hummingbird" autocomplete="off" />
  </div>
  <div class="content-edit-modal-actions">
    <button type="button" class="content-edit-modal-cancel" data-image-repo-folder-cancel>Cancel</button>
    <button type="button" class="content-edit-modal-ok" data-image-repo-folder-save>Save here</button>
  </div>
</div>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function setFolderPickerStatus(backdrop, message, kind) {
    const el = backdrop.querySelector("[data-image-repo-folder-status]");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.classList.remove("image-repo-folder-status--error", "image-repo-folder-status--ok");
    if (kind === "error") {
      el.classList.add("image-repo-folder-status--error");
    } else if (kind === "ok") {
      el.classList.add("image-repo-folder-status--ok");
    }
  }

  function openFolderPickerModal({ fileName, ctx }) {
    return new Promise((resolve) => {
      const backdrop = ensureFolderPickerDom();
      const fileEl = backdrop.querySelector("[data-image-repo-folder-file]");
      const repoEl = backdrop.querySelector("[data-image-repo-folder-repo]");
      const pathEl = backdrop.querySelector("[data-image-repo-folder-path]");
      const listEl = backdrop.querySelector("[data-image-repo-folder-list]");
      const upBtn = backdrop.querySelector("[data-image-repo-folder-up]");
      const newFolderInput = backdrop.querySelector("[data-image-repo-new-folder]");
      const cancelBtn = backdrop.querySelector("[data-image-repo-folder-cancel]");
      const saveBtn = backdrop.querySelector("[data-image-repo-folder-save]");

      let settled = false;
      let currentPath = "";
      let selectedPath = "";
      let loading = false;

      const finish = (result) => {
        if (settled) {
          return;
        }
        settled = true;
        backdrop.classList.remove("content-edit-modal-backdrop--open");
        backdrop.hidden = true;
        resolve(result);
      };

      const updatePathUi = () => {
        const label = currentPath || "(repository root)";
        if (pathEl) {
          pathEl.textContent = `Location: ${label}`;
        }
        if (upBtn) {
          upBtn.hidden = !currentPath;
        }
        selectedPath = currentPath;
      };

      const renderFolders = async () => {
        if (!listEl || loading) {
          return;
        }
        loading = true;
        listEl.innerHTML = `<div class="image-repo-folder-loading">Loading folders…</div>`;
        setFolderPickerStatus(backdrop, "", null);
        try {
          const folders = await listFolders(ctx, currentPath);
          listEl.textContent = "";
          if (!folders.length) {
            const empty = document.createElement("p");
            empty.className = "image-repo-folder-empty";
            empty.textContent = "No subfolders here. Save at this location or create a new folder below.";
            listEl.appendChild(empty);
          } else {
            for (const folder of folders) {
              const row = document.createElement("button");
              row.type = "button";
              row.className = "image-repo-folder-row";
              row.setAttribute("role", "option");
              row.innerHTML = `<span class="image-repo-folder-row-icon" aria-hidden="true">📁</span><span class="image-repo-folder-row-name">${escapeHtml(folder.name)}</span><span class="image-repo-folder-row-action">Open</span>`;
              row.addEventListener("click", () => {
                currentPath = folder.path;
                if (newFolderInput) {
                  newFolderInput.value = "";
                }
                updatePathUi();
                renderFolders();
              });
              listEl.appendChild(row);
            }
          }
          updatePathUi();
        } catch (err) {
          listEl.textContent = "";
          setFolderPickerStatus(backdrop, err?.message || String(err), "error");
        } finally {
          loading = false;
        }
      };

      if (fileEl) {
        fileEl.textContent = `File: ${fileName}`;
      }
      if (repoEl) {
        repoEl.textContent = `${ctx.owner}/${ctx.repo}@${ctx.branch}`;
      }
      if (newFolderInput) {
        newFolderInput.value = "";
      }
      currentPath = "";
      updatePathUi();
      setFolderPickerStatus(backdrop, "", null);

      const onUp = (event) => {
        event.preventDefault();
        if (!currentPath) {
          return;
        }
        const parts = currentPath.split("/").filter(Boolean);
        parts.pop();
        currentPath = parts.join("/");
        if (newFolderInput) {
          newFolderInput.value = "";
        }
        renderFolders();
      };

      const onCancel = (event) => {
        event.preventDefault();
        finish(null);
      };

      const onSave = async (event) => {
        event.preventDefault();
        if (loading || saveBtn?.disabled) {
          return;
        }
        const newFolder = sanitizeNewFolderName(newFolderInput?.value || "");
        const folderPath = newFolder ? joinRepoPath(currentPath, newFolder) : selectedPath;
        finish({ folderPath });
      };

      upBtn?.addEventListener("click", onUp, { once: true });
      cancelBtn?.addEventListener("click", onCancel, { once: true });
      saveBtn?.addEventListener("click", onSave, { once: true });
      backdrop.addEventListener(
        "click",
        (event) => {
          if (event.target === backdrop) {
            onCancel(event);
          }
        },
        { once: true },
      );

      backdrop.hidden = false;
      backdrop.classList.add("content-edit-modal-backdrop--open");
      renderFolders();
    });
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

  /**
   * @param {string} imageUrl
   * @returns {Promise<{ repoPath: string, publicUrl: string } | null>}
   */
  async function saveImageUrlToRepo(imageUrl) {
    if (!window.githubAuth?.isSignedIn?.()) {
      throw new Error("Sign in to GitHub on the site generator page first.");
    }
    if (!window.githubAuth?.commitImagesRepoBinaryFiles) {
      throw new Error("GitHub image commit is not available.");
    }
    const ctx = getImagesRepoContext();
    if (!ctx) {
      throw new Error("Select an images repository in the site generator Images section.");
    }

    const fullUrl = resolveFullxfullUrl(imageUrl);
    if (!fullUrl) {
      throw new Error("Enter an image URL first.");
    }

    const fileName = deriveJpegFileName(fullUrl);
    const bytes = await fetchImageAsJpegBytes(fullUrl);

    const folderResult = await openFolderPickerModal({ fileName, ctx });
    if (!folderResult) {
      return null;
    }

    const repoPath = joinRepoPath(folderResult.folderPath, fileName);
    if (await pathExistsInRepo(ctx, repoPath)) {
      const ok = window.confirm(`"${repoPath}" already exists in the images repo. Overwrite?`);
      if (!ok) {
        return null;
      }
    }
    await window.githubAuth.commitImagesRepoBinaryFiles({
      message: `Add ${repoPath} from editor`,
      files: [{ path: repoPath, bytes }],
    });

    const publicUrl = window.githubAuth.buildBlobRawContentUrl(ctx.owner, ctx.repo, repoPath, ctx.branch);
    return { repoPath, publicUrl };
  }

  /**
   * @param {string} imageUrl
   * @param {{ onUrlInput?: (url: string) => void }} [options]
   */
  async function saveSlideImageToRepo(imageUrl, options) {
    const result = await saveImageUrlToRepo(imageUrl);
    if (!result) {
      return null;
    }
    await copyText(result.publicUrl);
    const useInSlide = window.confirm(
      `Saved to ${result.repoPath}.\n\nThe repo URL was copied to your clipboard.\n\nUse this URL for the slide?`,
    );
    if (useInSlide && typeof options?.onUrlInput === "function") {
      options.onUrlInput(result.publicUrl);
    }
    return result;
  }

  window.imageRepoSave = {
    resolveFullxfullUrl,
    saveImageUrlToRepo,
    saveSlideImageToRepo,
  };
})();
