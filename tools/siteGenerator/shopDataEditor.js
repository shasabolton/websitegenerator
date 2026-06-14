(function () {
  const SHOP_DATA_URL = "../../shared-assets/config/shopData.json";
  const SHOP_DATA_OVERLAY_KEY = "siteGenerator.shopDataOverlay";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function stripHtml(html) {
    return String(html || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultShopData() {
    return {
      shopName: "",
      owner: "",
      about: "",
      shopFocus: [],
      websites: { primary: "", etsy: "", newsletterSignup: "" },
      paypal: { clientId: "", environment: "sandbox", buyerCountry: "" },
      branding: { faviconPath: "" },
      blog: { title: "Blog", description: "" },
      contact: {
        email: "",
        phone: "",
        address: { line1: "", city: "", state: "", postalCode: "", country: "" },
      },
      social: {
        instagram: { handle: "", url: "", verified: false, notes: "" },
        facebook: { handle: "", url: "", verified: false, notes: "" },
      },
    };
  }

  function normalizeShopData(raw) {
    const base = defaultShopData();
    const input = raw && typeof raw === "object" ? raw : {};
    const next = cloneJson(base);
    next.shopName = String(input.shopName ?? "").trim();
    next.owner = String(input.owner ?? "").trim();
    next.about = aboutToPlainText(input.about);
    next.shopFocus = Array.isArray(input.shopFocus)
      ? input.shopFocus.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    next.websites = { ...next.websites, ...(input.websites && typeof input.websites === "object" ? input.websites : {}) };
    next.paypal = { ...next.paypal, ...(input.paypal && typeof input.paypal === "object" ? input.paypal : {}) };
    next.branding = {
      ...next.branding,
      ...(input.branding && typeof input.branding === "object" ? input.branding : {}),
    };
    next.blog = { ...next.blog, ...(input.blog && typeof input.blog === "object" ? input.blog : {}) };
    next.contact = {
      ...next.contact,
      ...(input.contact && typeof input.contact === "object" ? input.contact : {}),
      address: {
        ...next.contact.address,
        ...(input.contact?.address && typeof input.contact.address === "object" ? input.contact.address : {}),
      },
    };
    for (const key of ["instagram", "facebook"]) {
      const social = input.social?.[key];
      if (social && typeof social === "object") {
        next.social[key] = { ...next.social[key], ...social };
      }
    }
    return next;
  }

  /** Plain text for the editor; legacy HTML is stripped on load. */
  function aboutToPlainText(about) {
    const raw = String(about ?? "").trim();
    if (!raw) {
      return "";
    }
    if (raw.includes("<")) {
      return stripHtml(raw);
    }
    return raw.replace(/\s+/g, " ").trim();
  }

  function readShopDataOverlay() {
    try {
      const raw = sessionStorage.getItem(SHOP_DATA_OVERLAY_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeShopDataOverlay(data) {
    sessionStorage.setItem(SHOP_DATA_OVERLAY_KEY, JSON.stringify(normalizeShopData(data)));
  }

  function clearShopDataOverlay() {
    sessionStorage.removeItem(SHOP_DATA_OVERLAY_KEY);
  }

  function hasShopDataOverlay() {
    return readShopDataOverlay() !== null;
  }

  function applyShopDataOverlay(base) {
    const overlay = readShopDataOverlay();
    if (!overlay) {
      return normalizeShopData(base);
    }
    return normalizeShopData({ ...normalizeShopData(base), ...overlay });
  }

  async function fetchShopDataJson() {
    const resolved = new URL(SHOP_DATA_URL, window.location.href).href;
    const response = await fetch(resolved, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load shop data: ${SHOP_DATA_URL} (${response.status})`);
    }
    const data = await response.json();
    return applyShopDataOverlay(data);
  }

  function shopFocusFromText(raw) {
    return String(raw || "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function shopFocusToText(list) {
    return (Array.isArray(list) ? list : [])
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .join("\n");
  }

  function shopDataFromForm(form) {
    const get = (name) => {
      const el = form.elements.namedItem(name);
      if (!el) {
        return "";
      }
      if (el.type === "checkbox") {
        return el.checked;
      }
      return String(el.value ?? "").trim();
    };

    return normalizeShopData({
      shopName: get("shopName"),
      owner: get("owner"),
      about: get("about"),
      shopFocus: shopFocusFromText(get("shopFocus")),
      websites: {
        primary: get("websitesPrimary"),
        etsy: get("websitesEtsy"),
        newsletterSignup: get("websitesNewsletter"),
      },
      paypal: {
        clientId: get("paypalClientId"),
        environment: get("paypalEnvironment") || "sandbox",
        buyerCountry: get("paypalBuyerCountry"),
      },
      branding: {
        faviconPath: get("faviconPath"),
      },
      blog: {
        title: get("blogTitle"),
        description: get("blogDescription"),
      },
      contact: {
        email: get("contactEmail"),
        phone: get("contactPhone"),
        address: {
          line1: get("addressLine1"),
          city: get("addressCity"),
          state: get("addressState"),
          postalCode: get("addressPostalCode"),
          country: get("addressCountry"),
        },
      },
      social: {
        instagram: {
          handle: get("instagramHandle"),
          url: get("instagramUrl"),
          verified: get("instagramVerified") === true,
          notes: get("instagramNotes"),
        },
        facebook: {
          handle: get("facebookHandle"),
          url: get("facebookUrl"),
          verified: get("facebookVerified") === true,
          notes: get("facebookNotes"),
        },
      },
    });
  }

  function fillForm(form, data) {
    const shop = normalizeShopData(data);
    const set = (name, value) => {
      const el = form.elements.namedItem(name);
      if (!el) {
        return;
      }
      if (el.type === "checkbox") {
        el.checked = Boolean(value);
        return;
      }
      el.value = value == null ? "" : String(value);
    };

    set("shopName", shop.shopName);
    set("owner", shop.owner);
    set("about", shop.about);
    set("shopFocus", shopFocusToText(shop.shopFocus));
    set("websitesPrimary", shop.websites?.primary);
    set("websitesEtsy", shop.websites?.etsy);
    set("websitesNewsletter", shop.websites?.newsletterSignup);
    set("paypalClientId", shop.paypal?.clientId);
    set("paypalEnvironment", shop.paypal?.environment || "sandbox");
    set("paypalBuyerCountry", shop.paypal?.buyerCountry);
    set("faviconPath", shop.branding?.faviconPath);
    set("blogTitle", shop.blog?.title);
    set("blogDescription", shop.blog?.description);
    set("contactEmail", shop.contact?.email);
    set("contactPhone", shop.contact?.phone);
    set("addressLine1", shop.contact?.address?.line1);
    set("addressCity", shop.contact?.address?.city);
    set("addressState", shop.contact?.address?.state);
    set("addressPostalCode", shop.contact?.address?.postalCode);
    set("addressCountry", shop.contact?.address?.country);
    set("instagramHandle", shop.social?.instagram?.handle);
    set("instagramUrl", shop.social?.instagram?.url);
    set("instagramVerified", shop.social?.instagram?.verified);
    set("instagramNotes", shop.social?.instagram?.notes);
    set("facebookHandle", shop.social?.facebook?.handle);
    set("facebookUrl", shop.social?.facebook?.url);
    set("facebookVerified", shop.social?.facebook?.verified);
    set("facebookNotes", shop.social?.facebook?.notes);
  }

  function field(labelText, name, options = {}) {
    const id = `shop-data-${name}`;
    const wrap = document.createElement("div");
    wrap.className = "shop-data-field";
    const label = document.createElement("label");
    label.className = "shop-data-label";
    label.setAttribute("for", id);
    label.textContent = labelText;
    wrap.appendChild(label);

    let control;
    if (options.type === "textarea") {
      control = document.createElement("textarea");
      control.rows = options.rows || 3;
    } else if (options.type === "select") {
      control = document.createElement("select");
      for (const opt of options.options || []) {
        const option = document.createElement("option");
        option.value = opt.value;
        option.textContent = opt.label;
        control.appendChild(option);
      }
    } else if (options.type === "checkbox") {
      control = document.createElement("input");
      control.type = "checkbox";
      label.className = "shop-data-label shop-data-label--checkbox";
      label.insertBefore(control, label.firstChild);
      control.id = id;
      control.name = name;
      wrap.appendChild(label);
      if (options.hint) {
        const hint = document.createElement("p");
        hint.className = "shop-data-hint";
        hint.textContent = options.hint;
        wrap.appendChild(hint);
      }
      return wrap;
    } else {
      control = document.createElement("input");
      control.type = options.inputType || "text";
    }

    control.id = id;
    control.name = name;
    if (options.placeholder) {
      control.placeholder = options.placeholder;
    }
    if (!options.type || options.type !== "checkbox") {
      wrap.appendChild(control);
    }
    if (options.hint) {
      const hint = document.createElement("p");
      hint.className = "shop-data-hint";
      hint.textContent = options.hint;
      wrap.appendChild(hint);
    }
    return wrap;
  }

  function section(title) {
    const el = document.createElement("fieldset");
    el.className = "shop-data-section";
    const legend = document.createElement("legend");
    legend.textContent = title;
    el.appendChild(legend);
    return el;
  }

  async function initShopDataEditor(options = {}) {
    const rootId = options.rootId || "shop-data-editor-root";
    const root = document.getElementById(rootId);
    if (!root) {
      return;
    }

    root.innerHTML = `<p class="shop-data-loading">Loading shop data…</p>`;

    let baseData;
    try {
      baseData = await fetchShopDataJson();
    } catch (err) {
      root.innerHTML = `<p class="shop-data-error">${escapeHtml(err?.message || String(err))}</p>`;
      return;
    }

    root.innerHTML = "";

    const intro = document.createElement("p");
    intro.className = "shop-data-intro";
    intro.textContent =
      "Edit shared-assets/config/shopData.json. The shop intro is a single plain-text paragraph on the shop page. Publish the site after saving to update live HTML.";
    root.appendChild(intro);

    const form = document.createElement("form");
    form.className = "shop-data-form";
    form.noValidate = true;

    const shopSection = section("Shop");
    shopSection.appendChild(field("Shop name", "shopName"));
    shopSection.appendChild(field("Owner", "owner"));
    shopSection.appendChild(
      field("Shop intro (short paragraph)", "about", {
        type: "textarea",
        rows: 4,
        hint: "Plain text only — shown as one paragraph on the shop landing page.",
      }),
    );
    shopSection.appendChild(
      field("Shop focus tags (one per line)", "shopFocus", {
        type: "textarea",
        rows: 4,
      }),
    );
    form.appendChild(shopSection);

    const webSection = section("Websites");
    webSection.appendChild(field("Primary site URL", "websitesPrimary", { inputType: "url" }));
    webSection.appendChild(field("Etsy shop URL", "websitesEtsy", { inputType: "url" }));
    webSection.appendChild(field("Newsletter signup URL", "websitesNewsletter", { inputType: "url" }));
    form.appendChild(webSection);

    const paySection = section("PayPal");
    paySection.appendChild(field("Client ID", "paypalClientId"));
    paySection.appendChild(
      field("Environment", "paypalEnvironment", {
        type: "select",
        options: [
          { value: "sandbox", label: "sandbox" },
          { value: "live", label: "live" },
        ],
      }),
    );
    paySection.appendChild(field("Buyer country (ISO)", "paypalBuyerCountry", { placeholder: "AU" }));
    form.appendChild(paySection);

    const brandSection = section("Branding");
    brandSection.appendChild(field("Favicon path", "faviconPath"));
    form.appendChild(brandSection);

    const blogSection = section("Blog");
    blogSection.appendChild(field("Blog title", "blogTitle"));
    blogSection.appendChild(field("Blog description", "blogDescription", { type: "textarea", rows: 2 }));
    form.appendChild(blogSection);

    const contactSection = section("Contact");
    contactSection.appendChild(field("Email", "contactEmail", { inputType: "email" }));
    contactSection.appendChild(field("Phone", "contactPhone", { inputType: "tel" }));
    contactSection.appendChild(field("Address line 1", "addressLine1"));
    contactSection.appendChild(field("City", "addressCity"));
    contactSection.appendChild(field("State / region", "addressState"));
    contactSection.appendChild(field("Postal code", "addressPostalCode"));
    contactSection.appendChild(field("Country", "addressCountry"));
    form.appendChild(contactSection);

    const socialSection = section("Social");
    socialSection.appendChild(field("Instagram handle", "instagramHandle"));
    socialSection.appendChild(field("Instagram URL", "instagramUrl", { inputType: "url" }));
    socialSection.appendChild(field("Instagram verified", "instagramVerified", { type: "checkbox" }));
    socialSection.appendChild(field("Instagram notes", "instagramNotes", { type: "textarea", rows: 2 }));
    socialSection.appendChild(field("Facebook handle", "facebookHandle"));
    socialSection.appendChild(field("Facebook URL", "facebookUrl", { inputType: "url" }));
    socialSection.appendChild(field("Facebook verified", "facebookVerified", { type: "checkbox" }));
    socialSection.appendChild(field("Facebook notes", "facebookNotes", { type: "textarea", rows: 2 }));
    form.appendChild(socialSection);

    fillForm(form, baseData);

    const footer = document.createElement("div");
    footer.className = "shop-data-footer";

    const status = document.createElement("span");
    status.className = "shop-data-status";
    status.setAttribute("aria-live", "polite");

    const saveLocalBtn = document.createElement("button");
    saveLocalBtn.type = "button";
    saveLocalBtn.className = "shop-data-btn";
    saveLocalBtn.textContent = "Apply to preview";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "shop-data-btn shop-data-btn--muted";
    resetBtn.textContent = "Discard local edits";

    const pushBtn = document.createElement("button");
    pushBtn.type = "button";
    pushBtn.className = "shop-data-btn shop-data-btn--primary";
    pushBtn.textContent = "Save shop data to GitHub";

    footer.appendChild(saveLocalBtn);
    footer.appendChild(resetBtn);
    footer.appendChild(pushBtn);
    footer.appendChild(status);

    form.appendChild(footer);
    root.appendChild(form);

    function setStatus(message, kind) {
      status.textContent = message || "";
      status.classList.remove("shop-data-status--ok", "shop-data-status--error");
      if (kind === "ok") {
        status.classList.add("shop-data-status--ok");
      } else if (kind === "error") {
        status.classList.add("shop-data-status--error");
      }
    }

    saveLocalBtn.addEventListener("click", () => {
      writeShopDataOverlay(shopDataFromForm(form));
      setStatus("Preview uses these values until you discard or push.", "ok");
    });

    resetBtn.addEventListener("click", async () => {
      clearShopDataOverlay();
      try {
        const resolved = new URL(SHOP_DATA_URL, window.location.href).href;
        const response = await fetch(resolved, { cache: "no-store" });
        const data = await response.json();
        fillForm(form, normalizeShopData(data));
        setStatus("Local edits discarded.", "ok");
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      }
    });

    pushBtn.addEventListener("click", async () => {
      const payload = shopDataFromForm(form);
      pushBtn.disabled = true;
      setStatus("Saving…", null);
      try {
        if (!window.githubAuth?.pushShopData) {
          throw new Error("GitHub shop data push is not available.");
        }
        await window.githubAuth.pushShopData(payload);
        clearShopDataOverlay();
        fillForm(form, payload);
        setStatus("Saved to GitHub. Publish the site to update live HTML.", "ok");
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      } finally {
        pushBtn.disabled = false;
      }
    });
  }

  window.shopDataEditor = {
    fetchShopDataJson,
    normalizeShopData,
    aboutToPlainText,
    hasShopDataOverlay,
    clearShopDataOverlay,
    initShopDataEditor,
  };
})();
