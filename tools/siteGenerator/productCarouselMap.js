/**
 * Maps product catalog rows (IMAGE1–IMAGE10, VIDEO1) ↔ carousel editor items.
 * Product page generator keeps VIDEO1 as the second carousel slide when present.
 */
(function () {
  function getYoutubeParser() {
    return window.generateProductBody?.parseYoutubeVideoId || null;
  }

  function normalizeImageItem(url) {
    return {
      kind: "image",
      url: String(url || "").trim(),
      alt: "",
      caption: "",
      width: "",
    };
  }

  function normalizeVideoItem(videoUrl, videoId) {
    const id = String(videoId || "").trim();
    const url = String(videoUrl || "").trim();
    return {
      kind: "video",
      videoId: id,
      url: url || (id ? `https://www.youtube.com/watch?v=${id}` : ""),
      caption: "",
    };
  }

  /**
   * Build carousel items from a product row (matches generateProductBody order).
   * @param {object} row
   * @returns {object[]}
   */
  function productRowToCarouselItems(row) {
    const collectImages = window.productData?.collectProductImageUrls;
    const imageUrls = typeof collectImages === "function" ? collectImages(row) : [];
    const items = imageUrls.map((url) => normalizeImageItem(url));

    const videoUrl = String(row?.VIDEO1 ?? row?.video01 ?? "").trim() || String(row?.VIDEO_1 ?? "").trim();
    const parseId = getYoutubeParser();
    const videoId = typeof parseId === "function" ? parseId(videoUrl) : null;
    if (videoId) {
      const videoItem = normalizeVideoItem(videoUrl, videoId);
      if (items.length > 0) {
        items.splice(1, 0, videoItem);
      } else {
        items.push(videoItem);
      }
    }
    return items;
  }

  /**
   * Reorder items so video is at index 1 when images exist (second slide).
   * @param {object[]} items
   * @returns {object[]}
   */
  function enforceProductCarouselVideoPosition(items) {
    const list = Array.isArray(items) ? items.map((item) => ({ ...item })) : [];
    const videoIdx = list.findIndex((item) => String(item?.kind || "").toLowerCase() === "video");
    if (videoIdx < 0) {
      return list;
    }
    const video = list[videoIdx];
    const rest = list.filter((_, index) => index !== videoIdx);
    const images = rest.filter((item) => String(item?.kind || "image").toLowerCase() !== "video");
    const out = [];
    if (images.length) {
      out.push(images[0]);
    }
    out.push(video);
    for (let i = 1; i < images.length; i += 1) {
      out.push(images[i]);
    }
    return out;
  }

  /**
   * Write carousel items into product row IMAGE* and VIDEO1 fields.
   * @param {object[]} items
   * @param {object} baseRow
   * @returns {object}
   */
  function carouselItemsToProductRow(items, baseRow) {
    const row = baseRow && typeof baseRow === "object" ? { ...baseRow } : {};
    const ordered = enforceProductCarouselVideoPosition(items);

    for (let i = 1; i <= 10; i += 1) {
      row[`IMAGE${i}`] = "";
    }
    row.VIDEO1 = "";

    const imageUrls = [];
    let videoUrl = "";
    for (const item of ordered) {
      const kind = String(item?.kind || "image").trim().toLowerCase();
      if (kind === "video") {
        const parseId = getYoutubeParser();
        const fromId = String(item.videoId || "").trim();
        const fromUrl = String(item.url || "").trim();
        if (fromUrl) {
          videoUrl = fromUrl;
        } else if (fromId) {
          videoUrl = `https://www.youtube.com/watch?v=${fromId}`;
        } else if (typeof parseId === "function" && fromUrl) {
          const parsed = parseId(fromUrl);
          if (parsed) {
            videoUrl = fromUrl;
          }
        }
        continue;
      }
      const url = String(item.url || item.src || "").trim();
      if (url) {
        imageUrls.push(url);
      }
    }

    for (let i = 0; i < 10; i += 1) {
      row[`IMAGE${i + 1}`] = imageUrls[i] || "";
    }
    row.VIDEO1 = videoUrl;

    return row;
  }

  window.productCarouselMap = {
    productRowToCarouselItems,
    enforceProductCarouselVideoPosition,
    carouselItemsToProductRow,
  };
})();
