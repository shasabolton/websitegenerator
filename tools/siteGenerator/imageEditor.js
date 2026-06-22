/**
 * In-browser image editor (crop now; adjustments later).
 */
(function () {
  const HANDLE_RADIUS = 7;
  const MIN_CROP_SIZE = 32;

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
    return "image/jpeg";
  }

  function exportQuality(mime) {
    if (mime === "image/jpeg") {
      return 0.92;
    }
    if (mime === "image/webp") {
      return 0.85;
    }
    return undefined;
  }

  function deriveEditedFileName(sourcePath) {
    const base = String(sourcePath || "image.jpg")
      .trim()
      .replace(/^\/+/, "")
      .split("/")
      .pop() || "image.jpg";
    const dot = base.lastIndexOf(".");
    if (dot <= 0) {
      return `${base}-edited.jpg`;
    }
    return `${base.slice(0, dot)}-edited${base.slice(dot)}`;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function getSourceDimensions(source) {
    return {
      width: source.width ?? source.naturalWidth ?? 0,
      height: source.height ?? source.naturalHeight ?? 0,
    };
  }

  function createCropState(naturalWidth, naturalHeight) {
    const size = Math.max(MIN_CROP_SIZE, Math.min(naturalWidth, naturalHeight));
    return {
      x: Math.round((naturalWidth - size) / 2),
      y: Math.round((naturalHeight - size) / 2),
      size,
    };
  }

  function clampCrop(crop, naturalWidth, naturalHeight) {
    const maxSize = Math.min(naturalWidth, naturalHeight);
    crop.size = clamp(Math.round(crop.size), MIN_CROP_SIZE, maxSize);
    crop.x = clamp(Math.round(crop.x), 0, naturalWidth - crop.size);
    crop.y = clamp(Math.round(crop.y), 0, naturalHeight - crop.size);
    return crop;
  }

  function computeDisplayLayout(naturalWidth, naturalHeight, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);
    const displayWidth = Math.max(1, Math.round(naturalWidth * scale));
    const displayHeight = Math.max(1, Math.round(naturalHeight * scale));
    return {
      scale,
      displayWidth,
      displayHeight,
      offsetX: 0,
      offsetY: 0,
    };
  }

  function naturalToDisplay(crop, layout) {
    return {
      x: layout.offsetX + crop.x * layout.scale,
      y: layout.offsetY + crop.y * layout.scale,
      size: crop.size * layout.scale,
    };
  }

  function displayToNatural(point, layout) {
    return {
      x: (point.x - layout.offsetX) / layout.scale,
      y: (point.y - layout.offsetY) / layout.scale,
    };
  }

  function hitTestHandles(displayCrop, x, y) {
    const corners = [
      { id: "nw", cx: displayCrop.x, cy: displayCrop.y },
      { id: "ne", cx: displayCrop.x + displayCrop.size, cy: displayCrop.y },
      { id: "sw", cx: displayCrop.x, cy: displayCrop.y + displayCrop.size },
      { id: "se", cx: displayCrop.x + displayCrop.size, cy: displayCrop.y + displayCrop.size },
    ];
    for (const corner of corners) {
      const dx = x - corner.cx;
      const dy = y - corner.cy;
      if (Math.hypot(dx, dy) <= HANDLE_RADIUS + 2) {
        return corner.id;
      }
    }
    return null;
  }

  function isInsideCrop(displayCrop, x, y) {
    return (
      x >= displayCrop.x &&
      x <= displayCrop.x + displayCrop.size &&
      y >= displayCrop.y &&
      y <= displayCrop.y + displayCrop.size
    );
  }

  async function canvasToBytes(canvas, mime) {
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Could not encode edited image."));
          }
        },
        mime,
        exportQuality(mime),
      );
    });
    return new Uint8Array(await blob.arrayBuffer());
  }

  function drawCropOverlay(ctx, layout, displayCrop) {
    const { displayWidth, displayHeight, offsetX, offsetY } = layout;
    ctx.save();
    ctx.fillStyle = "rgba(15, 23, 42, 0.55)";
    ctx.fillRect(offsetX, offsetY, displayWidth, Math.max(0, displayCrop.y - offsetY));
    ctx.fillRect(
      offsetX,
      displayCrop.y + displayCrop.size,
      displayWidth,
      Math.max(0, offsetY + displayHeight - (displayCrop.y + displayCrop.size)),
    );
    ctx.fillRect(
      offsetX,
      displayCrop.y,
      Math.max(0, displayCrop.x - offsetX),
      displayCrop.size,
    );
    ctx.fillRect(
      displayCrop.x + displayCrop.size,
      displayCrop.y,
      Math.max(0, offsetX + displayWidth - (displayCrop.x + displayCrop.size)),
      displayCrop.size,
    );

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.strokeRect(displayCrop.x, displayCrop.y, displayCrop.size, displayCrop.size);

    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#2563eb";
    ctx.lineWidth = 2;
    const corners = [
      [displayCrop.x, displayCrop.y],
      [displayCrop.x + displayCrop.size, displayCrop.y],
      [displayCrop.x, displayCrop.y + displayCrop.size],
      [displayCrop.x + displayCrop.size, displayCrop.y + displayCrop.size],
    ];
    for (const [cx, cy] of corners) {
      ctx.beginPath();
      ctx.arc(cx, cy, HANDLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function renderPreviewCanvas(previewCanvas, source, crop, adjustments = {}) {
    const ctx = previewCanvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const size = Math.max(1, Math.round(crop.size));
    previewCanvas.width = size;
    previewCanvas.height = size;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(source, crop.x, crop.y, size, size, 0, 0, size, size);
    applyWhitesToCanvas(previewCanvas, adjustments.whites ?? 0);
  }

  function applyWhitesToCanvas(canvas, whites) {
    const amount = Number(whites);
    if (!Number.isFinite(amount) || amount === 0) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    if (!width || !height) {
      return;
    }
    const imageData = ctx.getImageData(0, 0, width, height);
    applyWhitesToImageData(imageData, amount);
    ctx.putImageData(imageData, 0, 0);
  }

  function applyWhitesToImageData(imageData, whites) {
    const amount = clamp(Number(whites) / 100, -1, 1);
    if (amount === 0) {
      return imageData;
    }
    const data = imageData.data;
    const strength = 0.8;
    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const mask = (Math.max(0, (luminance - 0.18) / 0.82)) ** 2;
      if (amount > 0) {
        const boost = amount * mask * strength;
        r += (1 - r) * boost;
        g += (1 - g) * boost;
        b += (1 - b) * boost;
      } else {
        const cut = -amount * mask * strength;
        r *= 1 - cut;
        g *= 1 - cut;
        b *= 1 - cut;
      }
      data[i] = Math.round(clamp(r, 0, 1) * 255);
      data[i + 1] = Math.round(clamp(g, 0, 1) * 255);
      data[i + 2] = Math.round(clamp(b, 0, 1) * 255);
    }
    return imageData;
  }

  function buildExportCanvas(source, crop, adjustments = {}) {
    const size = Math.max(1, Math.round(crop.size));
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = size;
    exportCanvas.height = size;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) {
      throw new Error("Canvas is not available.");
    }
    exportCtx.drawImage(source, crop.x, crop.y, size, size, 0, 0, size, size);
    applyWhitesToCanvas(exportCanvas, adjustments.whites ?? 0);
    return exportCanvas;
  }

  function resizeCropFromHandle(handle, anchor, pointer, naturalWidth, naturalHeight) {
    const dx = pointer.x - anchor.x;
    const dy = pointer.y - anchor.y;
    let size;
    let x;
    let y;

    if (handle === "se") {
      size = Math.max(dx, dy);
      x = anchor.x;
      y = anchor.y;
    } else if (handle === "nw") {
      size = Math.max(anchor.x - pointer.x, anchor.y - pointer.y);
      x = anchor.x - size;
      y = anchor.y - size;
    } else if (handle === "ne") {
      size = Math.max(pointer.x - anchor.x, anchor.y - pointer.y);
      x = anchor.x;
      y = anchor.y - size;
    } else {
      size = Math.max(anchor.x - pointer.x, pointer.y - anchor.y);
      x = anchor.x - size;
      y = anchor.y;
    }

    return clampCrop({ x, y, size }, naturalWidth, naturalHeight);
  }

  function mountEditorDom() {
    let overlay = document.querySelector("[data-image-editor-overlay]");
    if (overlay) {
      return overlay;
    }
    overlay = document.createElement("div");
    overlay.className = "images-browser-editor";
    overlay.setAttribute("data-image-editor-overlay", "");
    overlay.hidden = true;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "Image editor");
    overlay.innerHTML = `<div class="images-browser-editor-panel">
  <header class="images-browser-editor-header">
    <h2 class="images-browser-editor-title">Edit image</h2>
    <button type="button" class="images-browser-editor-close" data-image-editor-close aria-label="Close editor">Close</button>
  </header>
  <div class="images-browser-editor-workspace">
    <section class="images-browser-editor-source-wrap" aria-label="Crop area">
      <p class="images-browser-editor-section-label">Crop</p>
      <div class="images-browser-editor-source">
        <canvas class="images-browser-editor-canvas" data-image-editor-source-canvas aria-label="Image crop canvas"></canvas>
      </div>
    </section>
    <section class="images-browser-editor-preview-wrap" aria-label="Edited preview">
      <p class="images-browser-editor-section-label">Preview</p>
      <div class="images-browser-editor-preview-box">
        <canvas class="images-browser-editor-preview-canvas" data-image-editor-preview-canvas aria-label="Edited image preview"></canvas>
      </div>
    </section>
  </div>
  <div class="images-browser-editor-tools">
    <p class="images-browser-editor-hint">Drag the square to reposition the crop. Drag a corner handle to resize.</p>
    <div class="images-browser-editor-adjustments">
      <div class="images-browser-editor-adjustment">
        <label for="image-editor-whites">Whites</label>
        <input type="range" id="image-editor-whites" data-image-editor-whites min="-100" max="100" value="0" step="1" />
        <output data-image-editor-whites-value for="image-editor-whites">0</output>
      </div>
    </div>
    <p class="images-browser-editor-future" aria-hidden="true">Brightness, contrast, and tint controls coming soon.</p>
  </div>
  <div class="images-browser-editor-actions">
    <button type="button" class="images-browser-editor-save" data-image-editor-save>Save to images repo</button>
    <button type="button" class="images-browser-editor-cancel" data-image-editor-cancel>Cancel</button>
  </div>
  <p class="images-browser-editor-status" data-image-editor-status aria-live="polite"></p>
</div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function setEditorStatus(overlay, message, kind) {
    const el = overlay.querySelector("[data-image-editor-status]");
    if (!el) {
      return;
    }
    el.textContent = message || "";
    el.classList.remove("images-browser-editor-status--error", "images-browser-editor-status--ok");
    if (kind === "error") {
      el.classList.add("images-browser-editor-status--error");
    } else if (kind === "ok") {
      el.classList.add("images-browser-editor-status--ok");
    }
  }

  /**
   * @param {{ source: CanvasImageSource, sourcePath?: string, fileName?: string, onSaved?: (result: { repoPath: string, publicUrl: string }) => void, onClose?: () => void }} options
   */
  function openImageEditor(options = {}) {
    const source = options.source;
    if (!source) {
      return;
    }
    const { width: naturalWidth, height: naturalHeight } = getSourceDimensions(source);
    if (!naturalWidth || !naturalHeight) {
      window.alert("Image has no dimensions.");
      return;
    }

    const overlay = mountEditorDom();
    const sourceCanvas = overlay.querySelector("[data-image-editor-source-canvas]");
    const previewCanvas = overlay.querySelector("[data-image-editor-preview-canvas]");
    const saveBtn = overlay.querySelector("[data-image-editor-save]");
    const cancelBtn = overlay.querySelector("[data-image-editor-cancel]");
    const closeBtn = overlay.querySelector("[data-image-editor-close]");
    const sourceWrap = overlay.querySelector(".images-browser-editor-source");
    const whitesInput = overlay.querySelector("[data-image-editor-whites]");
    const whitesValue = overlay.querySelector("[data-image-editor-whites-value]");

    if (!sourceCanvas || !previewCanvas || !sourceWrap) {
      return;
    }

    const sourcePath = String(options.sourcePath || options.fileName || "").trim();
    const outputFileName = String(options.fileName || deriveEditedFileName(sourcePath)).trim();
    const outputMime = mimeTypeFromPath(outputFileName || sourcePath);

    let crop = createCropState(naturalWidth, naturalHeight);
    let layout = computeDisplayLayout(naturalWidth, naturalHeight, 520, 520);
    let adjustments = { whites: 0 };
    let dragState = null;
    let closed = false;

    const syncWhitesUi = () => {
      if (whitesInput) {
        whitesInput.value = String(adjustments.whites);
      }
      if (whitesValue) {
        whitesValue.textContent = String(adjustments.whites);
      }
    };

    const closeEditor = () => {
      if (closed) {
        return;
      }
      closed = true;
      dragState = null;
      overlay._editorCleanup?.();
      overlay.hidden = true;
      document.body.classList.remove("images-browser-editor-open");
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
      document.removeEventListener("keydown", onKeyDown);
      if (typeof options.onClose === "function") {
        options.onClose();
      }
    };

    const syncLayout = () => {
      const maxWidth = Math.max(200, sourceWrap.clientWidth - 2);
      const maxHeight = Math.max(200, Math.min(window.innerHeight * 0.45, 520));
      layout = computeDisplayLayout(naturalWidth, naturalHeight, maxWidth, maxHeight);
      sourceCanvas.width = layout.displayWidth;
      sourceCanvas.height = layout.displayHeight;
      sourceCanvas.style.width = `${layout.displayWidth}px`;
      sourceCanvas.style.height = `${layout.displayHeight}px`;
    };

    const redraw = () => {
      const ctx = sourceCanvas.getContext("2d");
      if (!ctx) {
        return;
      }
      ctx.clearRect(0, 0, layout.displayWidth, layout.displayHeight);
      ctx.drawImage(source, 0, 0, layout.displayWidth, layout.displayHeight);
      const displayCrop = naturalToDisplay(crop, layout);
      drawCropOverlay(ctx, layout, displayCrop);
      renderPreviewCanvas(previewCanvas, source, crop, adjustments);
    };

    const onWhitesInput = () => {
      adjustments = { whites: Number(whitesInput?.value || 0) };
      syncWhitesUi();
      redraw();
    };

    const pointerToCanvas = (event) => {
      const rect = sourceCanvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * sourceCanvas.width,
        y: ((event.clientY - rect.top) / rect.height) * sourceCanvas.height,
      };
    };

    const onPointerDown = (event) => {
      if (event.button !== 0) {
        return;
      }
      const point = pointerToCanvas(event);
      const displayCrop = naturalToDisplay(crop, layout);
      const handle = hitTestHandles(displayCrop, point.x, point.y);
      if (handle) {
        dragState = {
          mode: "resize",
          handle,
          startCrop: { ...crop },
          startPointer: displayToNatural(point, layout),
        };
        sourceCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
      if (isInsideCrop(displayCrop, point.x, point.y)) {
        dragState = {
          mode: "move",
          startCrop: { ...crop },
          startPointer: displayToNatural(point, layout),
        };
        sourceCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      }
    };

    const onPointerMove = (event) => {
      if (!dragState) {
        return;
      }
      const point = pointerToCanvas(event);
      const pointerNatural = displayToNatural(point, layout);
      if (dragState.mode === "move") {
        const dx = pointerNatural.x - dragState.startPointer.x;
        const dy = pointerNatural.y - dragState.startPointer.y;
        crop = clampCrop(
          {
            x: dragState.startCrop.x + dx,
            y: dragState.startCrop.y + dy,
            size: dragState.startCrop.size,
          },
          naturalWidth,
          naturalHeight,
        );
      } else {
        const start = dragState.startCrop;
        let anchor;
        if (dragState.handle === "se") {
          anchor = { x: start.x, y: start.y };
        } else if (dragState.handle === "nw") {
          anchor = { x: start.x + start.size, y: start.y + start.size };
        } else if (dragState.handle === "ne") {
          anchor = { x: start.x, y: start.y + start.size };
        } else {
          anchor = { x: start.x + start.size, y: start.y };
        }
        crop = resizeCropFromHandle(
          dragState.handle,
          anchor,
          pointerNatural,
          naturalWidth,
          naturalHeight,
        );
      }
      redraw();
    };

    const onPointerUp = () => {
      dragState = null;
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeEditor();
      }
    };

    const onSave = async () => {
      if (!window.imageRepoSave?.saveImageBytesToRepo) {
        setEditorStatus(overlay, "Save to images repo is not available.", "error");
        return;
      }
      saveBtn.disabled = true;
      setEditorStatus(overlay, "Encoding edited image…", null);
      try {
        const exportCanvas = buildExportCanvas(source, crop, adjustments);
        const bytes = await canvasToBytes(exportCanvas, outputMime);
        setEditorStatus(overlay, "Saving to GitHub…", null);
        const result = await window.imageRepoSave.saveImageBytesToRepo(bytes, outputFileName);
        if (!result) {
          setEditorStatus(overlay, "Save cancelled.", null);
          return;
        }
        setEditorStatus(overlay, `Saved ${result.repoPath}. URL copied to clipboard.`, "ok");
        if (typeof options.onSaved === "function") {
          options.onSaved(result);
        }
      } catch (err) {
        setEditorStatus(overlay, err?.message || String(err), "error");
      } finally {
        saveBtn.disabled = false;
      }
    };

    sourceCanvas.onpointerdown = onPointerDown;
    whitesInput?.addEventListener("input", onWhitesInput);
    saveBtn.onclick = () => {
      onSave().catch((err) => {
        setEditorStatus(overlay, err?.message || String(err), "error");
      });
    };
    cancelBtn.onclick = closeEditor;
    closeBtn.onclick = closeEditor;
    overlay.onclick = (event) => {
      if (event.target === overlay) {
        closeEditor();
      }
    };

    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("keydown", onKeyDown);

    setEditorStatus(overlay, "", null);
    saveBtn.disabled = false;
    adjustments = { whites: 0 };
    syncWhitesUi();
    overlay.hidden = false;
    document.body.classList.add("images-browser-editor-open");

    syncLayout();
    redraw();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncLayout();
            redraw();
          })
        : null;
    resizeObserver?.observe(sourceWrap);
    overlay._editorResizeObserver = resizeObserver;
    overlay._editorCleanup = () => {
      resizeObserver?.disconnect();
      sourceCanvas.onpointerdown = null;
      whitesInput?.removeEventListener("input", onWhitesInput);
    };
  }

  window.imageEditor = {
    openImageEditor,
    deriveEditedFileName,
  };
})();
