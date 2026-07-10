(function () {
  const DISCOUNT_CODES_URL = "../../shared-assets/config/discountCodes.json";

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function defaultDiscountCodes() {
    return {
      version: 1,
      currency: "AUD",
      notes: "",
      codes: [],
    };
  }

  function parseSkuList(raw) {
    if (Array.isArray(raw)) {
      return raw.map((s) => String(s ?? "").trim()).filter(Boolean);
    }
    return String(raw || "")
      .split(/[\r\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function skuListToText(skus) {
    return Array.isArray(skus) ? skus.map((s) => String(s ?? "").trim()).filter(Boolean).join("\n") : "";
  }

  function normalizeCodeEntry(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const code = String(input.code ?? "")
      .trim()
      .toUpperCase();
    if (!code) {
      return null;
    }
    const type = String(input.type ?? "")
      .trim()
      .toLowerCase();
    if (type !== "percent" && type !== "fixed") {
      return null;
    }
    const value = Number(input.value);
    if (!Number.isFinite(value) || value < 0) {
      return null;
    }
    if (type === "percent" && value > 100) {
      return null;
    }

    const entry = {
      active: input.active !== false,
      code,
      type,
      value,
    };

    const skus = parseSkuList(input.skus);
    if (skus.length > 0) {
      entry.skus = skus;
    }

    const minSubtotal = Number(input.minSubtotal);
    if (Number.isFinite(minSubtotal) && minSubtotal > 0) {
      entry.minSubtotal = minSubtotal;
    }

    const minQuantity = Number(input.minQuantity);
    if (Number.isFinite(minQuantity) && minQuantity > 0) {
      entry.minQuantity = Math.floor(minQuantity);
    }

    const note = String(input.note ?? "").trim();
    if (note) {
      entry.note = note;
    }

    return entry;
  }

  function normalizeDiscountCodes(raw) {
    const base = defaultDiscountCodes();
    const input = raw && typeof raw === "object" ? raw : {};
    const next = cloneJson(base);

    const version = Number(input.version);
    next.version = Number.isFinite(version) && version >= 0 ? Math.floor(version) : 1;

    next.currency = String(input.currency ?? "AUD").trim() || "AUD";
    next.notes = String(input.notes ?? "").trim();

    const codes = Array.isArray(input.codes) ? input.codes : [];
    next.codes = codes.map((entry) => normalizeCodeEntry(entry)).filter(Boolean);

    return next;
  }

  function formatDiscountCodesJsonText(data) {
    return `${JSON.stringify(data, null, 2)}\n`;
  }

  async function fetchDiscountCodesJson() {
    const data =
      typeof window.githubAuth?.loadJson === "function"
        ? await window.githubAuth.loadJson(DISCOUNT_CODES_URL)
        : await (async () => {
            const resolved = new URL(DISCOUNT_CODES_URL, window.location.href).href;
            const response = await fetch(resolved, { cache: "no-store" });
            if (!response.ok) {
              throw new Error(`Failed to load discount codes: ${DISCOUNT_CODES_URL} (${response.status})`);
            }
            return response.json();
          })();
    return normalizeDiscountCodes(data);
  }

  function field(label, name, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = "discount-codes-field";

    const id = `discount-codes-${name}`;

    if (options.type === "checkbox") {
      const lab = document.createElement("label");
      lab.className = "discount-codes-label discount-codes-label--checkbox";
      lab.htmlFor = id;
      const control = document.createElement("input");
      control.type = "checkbox";
      control.id = id;
      control.name = name;
      lab.appendChild(control);
      lab.appendChild(document.createTextNode(` ${label}`));
      wrap.appendChild(lab);
    } else {
      const lab = document.createElement("label");
      lab.className = "discount-codes-label";
      lab.htmlFor = id;
      lab.textContent = label;
      wrap.appendChild(lab);

      let control;
      if (options.type === "textarea") {
        control = document.createElement("textarea");
        control.rows = options.rows || 3;
      } else if (options.type === "select") {
        control = document.createElement("select");
        for (const opt of options.options || []) {
          const o = document.createElement("option");
          o.value = opt.value;
          o.textContent = opt.label;
          control.appendChild(o);
        }
      } else {
        control = document.createElement("input");
        control.type = options.inputType || "text";
        if (options.inputType === "number") {
          control.step = options.step || "any";
          control.min = options.min ?? "";
        }
      }
      control.id = id;
      control.name = name;
      if (options.placeholder) {
        control.placeholder = options.placeholder;
      }
      wrap.appendChild(control);
    }

    if (options.hint) {
      const hint = document.createElement("p");
      hint.className = "discount-codes-hint";
      hint.textContent = options.hint;
      wrap.appendChild(hint);
    }

    return wrap;
  }

  function readCodeCard(card) {
    const get = (sel) => card.querySelector(sel);
    const active = get('[name="codeActive"]')?.checked !== false;
    const code = String(get('[name="codeValue"]')?.value ?? "")
      .trim()
      .toUpperCase();
    const type = String(get('[name="codeType"]')?.value ?? "percent").trim();
    const value = Number(get('[name="codeAmount"]')?.value);
    const skus = parseSkuList(get('[name="codeSkus"]')?.value);
    const minSubtotalRaw = get('[name="codeMinSubtotal"]')?.value;
    const minQuantityRaw = get('[name="codeMinQuantity"]')?.value;
    const note = String(get('[name="codeNote"]')?.value ?? "").trim();

    const entry = { active, code, type, value };
    if (skus.length > 0) {
      entry.skus = skus;
    }
    if (minSubtotalRaw !== "" && minSubtotalRaw != null) {
      entry.minSubtotal = Number(minSubtotalRaw);
    }
    if (minQuantityRaw !== "" && minQuantityRaw != null) {
      entry.minQuantity = Number(minQuantityRaw);
    }
    if (note) {
      entry.note = note;
    }
    return entry;
  }

  function fillCodeCard(card, entry) {
    const data = entry && typeof entry === "object" ? entry : {};
    const set = (sel, val) => {
      const el = card.querySelector(sel);
      if (el) {
        el.value = val;
      }
    };
    const activeEl = card.querySelector('[name="codeActive"]');
    if (activeEl) {
      activeEl.checked = data.active !== false;
    }
    set('[name="codeValue"]', data.code || "");
    set('[name="codeType"]', data.type === "fixed" ? "fixed" : "percent");
    set('[name="codeAmount"]', data.value != null ? String(data.value) : "");
    set('[name="codeSkus"]', skuListToText(data.skus));
    set(
      '[name="codeMinSubtotal"]',
      data.minSubtotal != null && Number.isFinite(Number(data.minSubtotal)) ? String(data.minSubtotal) : "",
    );
    set(
      '[name="codeMinQuantity"]',
      data.minQuantity != null && Number.isFinite(Number(data.minQuantity)) ? String(data.minQuantity) : "",
    );
    set('[name="codeNote"]', data.note || "");
  }

  function buildCodeCard(entry, index, skuHint) {
    const card = document.createElement("fieldset");
    card.className = "discount-codes-code-card";
    card.dataset.discountIndex = String(index);

    const legend = document.createElement("legend");
    const codeLabel = String(entry?.code || "").trim() || `Code ${index + 1}`;
    legend.textContent = codeLabel;
    card.appendChild(legend);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "discount-codes-btn discount-codes-btn--danger discount-codes-remove-code";
    removeBtn.textContent = "Remove";
    card.appendChild(removeBtn);

    card.appendChild(field("Active", "codeActive", { type: "checkbox" }));
    card.appendChild(
      field("Code", "codeValue", {
        placeholder: "NEWDESIGN",
        hint: "Case-insensitive; stored uppercase.",
      }),
    );
    card.appendChild(
      field("Type", "codeType", {
        type: "select",
        options: [
          { value: "percent", label: "Percent off" },
          { value: "fixed", label: "Fixed amount off" },
        ],
      }),
    );
    card.appendChild(
      field("Value", "codeAmount", {
        inputType: "number",
        min: 0,
        step: "0.01",
        hint: "Percent (0–100) or fixed currency amount.",
      }),
    );
    card.appendChild(
      field("SKUs (one per line, optional)", "codeSkus", {
        type: "textarea",
        rows: 3,
        hint: skuHint || "Leave blank to apply to the whole cart.",
      }),
    );
    card.appendChild(
      field("Min eligible subtotal", "codeMinSubtotal", {
        inputType: "number",
        min: 0,
        step: "0.01",
        placeholder: "Optional",
      }),
    );
    card.appendChild(
      field("Min eligible quantity", "codeMinQuantity", {
        inputType: "number",
        min: 0,
        step: 1,
        placeholder: "Optional",
      }),
    );
    card.appendChild(field("Note (internal)", "codeNote", { placeholder: "Optional description" }));

    fillCodeCard(card, entry);
    return card;
  }

  function discountCodesFromForm(form, options = {}) {
    const version = Number(form.querySelector('[name="configVersion"]')?.value);
    const currency = String(form.querySelector('[name="configCurrency"]')?.value ?? "").trim();
    const notes = String(form.querySelector('[name="configNotes"]')?.value ?? "").trim();
    const cards = form.querySelectorAll(".discount-codes-code-card");
    const codes = [];
    for (const card of cards) {
      codes.push(readCodeCard(card));
    }
    const raw = { version, currency, notes, codes };
    if (options.validate) {
      validateDiscountCodes(raw, { rawCardCount: cards.length });
    }
    return normalizeDiscountCodes(raw);
  }

  function validateDiscountCodes(data, options = {}) {
    const codes = Array.isArray(data?.codes) ? data.codes : [];
    const cardCount = Number(options.rawCardCount);
    if (Number.isFinite(cardCount) && cardCount !== codes.length) {
      throw new Error("Unexpected discount code form state.");
    }
    const seen = new Set();
    for (let i = 0; i < codes.length; i += 1) {
      const entry = codes[i];
      const code = String(entry?.code ?? "")
        .trim()
        .toUpperCase();
      if (!code) {
        throw new Error(`Discount code ${i + 1} needs a code value.`);
      }
      const type = String(entry?.type ?? "")
        .trim()
        .toLowerCase();
      if (type !== "percent" && type !== "fixed") {
        throw new Error(`Discount code ${code} needs a valid type.`);
      }
      const value = Number(entry?.value);
      if (!Number.isFinite(value) || value < 0) {
        throw new Error(`Discount code ${code} needs a valid value.`);
      }
      if (type === "percent" && value > 100) {
        throw new Error(`Discount code ${code}: percent value cannot exceed 100.`);
      }
      if (seen.has(code)) {
        throw new Error(`Duplicate discount code: ${code}`);
      }
      seen.add(code);
    }
    return normalizeDiscountCodes(data);
  }

  function fillForm(form, data) {
    const normalized = normalizeDiscountCodes(data);
    const set = (name, val) => {
      const el = form.querySelector(`[name="${name}"]`);
      if (el) {
        el.value = val;
      }
    };
    set("configVersion", String(normalized.version));
    set("configCurrency", normalized.currency);
    set("configNotes", normalized.notes);

    const list = form.querySelector('[data-discount-codes-list]');
    if (!list) {
      return;
    }
    list.innerHTML = "";
    const skuHint = list.dataset.skuHint || "";
    normalized.codes.forEach((entry, index) => {
      list.appendChild(buildCodeCard(entry, index, skuHint));
    });
    bindCodeListEvents(form);
  }

  function bindCodeListEvents(form) {
    const list = form.querySelector("[data-discount-codes-list]");
    if (!list) {
      return;
    }

    list.querySelectorAll(".discount-codes-remove-code").forEach((btn) => {
      btn.replaceWith(btn.cloneNode(true));
    });
    list.querySelectorAll(".discount-codes-remove-code").forEach((btn) => {
      btn.addEventListener("click", () => {
        btn.closest(".discount-codes-code-card")?.remove();
        reindexCodeCards(list);
      });
    });

    list.querySelectorAll('[name="codeValue"]').forEach((input) => {
      input.addEventListener("input", () => {
        const card = input.closest(".discount-codes-code-card");
        const legend = card?.querySelector("legend");
        if (legend) {
          const val = String(input.value || "").trim();
          legend.textContent = val || "New code";
        }
      });
    });
  }

  function reindexCodeCards(list) {
    list.querySelectorAll(".discount-codes-code-card").forEach((card, index) => {
      card.dataset.discountIndex = String(index);
    });
  }

  async function initDiscountCodesEditor(options = {}) {
    const rootId = options.rootId || "discount-codes-editor-root";
    const root = document.getElementById(rootId);
    if (!root) {
      return;
    }

    root.innerHTML = "";
    root.classList.add("discount-codes-panel");

    const details = document.createElement("details");
    details.className = "discount-codes-details";

    const summary = document.createElement("summary");
    summary.className = "discount-codes-summary";
    summary.textContent = "Discount codes";

    const body = document.createElement("div");
    body.className = "discount-codes-body";
    body.innerHTML = `<p class="discount-codes-loading">Loading discount codes…</p>`;

    details.appendChild(summary);
    details.appendChild(body);
    root.appendChild(details);

    let productSkus = [];
    let baseData;
    try {
      const productDataPromise =
        typeof window.productData?.fetchProductDataJson === "function"
          ? window.productData.fetchProductDataJson()
          : Promise.resolve({ products: [] });
      const [discountData, productData] = await Promise.all([fetchDiscountCodesJson(), productDataPromise]);
      baseData = discountData;
      const products = Array.isArray(productData?.products) ? productData.products : [];
      productSkus = products
        .map((p) => String(p?.SKU ?? p?.sku ?? "").trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    } catch (err) {
      body.innerHTML = `<p class="discount-codes-error">${escapeHtml(err?.message || String(err))}</p>`;
      return;
    }

    const codeCount = baseData.codes.length;
    summary.textContent = codeCount > 0 ? `Discount codes · ${codeCount} code${codeCount === 1 ? "" : "s"}` : "Discount codes";

    body.innerHTML = "";

    const intro = document.createElement("p");
    intro.className = "discount-codes-intro";
    intro.textContent =
      "Edit shared-assets/config/discountCodes.json. Codes apply at checkout in the shopping cart. Save to GitHub to update the live site.";
    body.appendChild(intro);

    const form = document.createElement("form");
    form.className = "discount-codes-form";
    form.noValidate = true;

    const configSection = document.createElement("fieldset");
    configSection.className = "discount-codes-section";
    const configLegend = document.createElement("legend");
    configLegend.textContent = "Config";
    configSection.appendChild(configLegend);
    configSection.appendChild(
      field("Version", "configVersion", { inputType: "number", min: 0, step: 1, hint: "Bump when changing rules." }),
    );
    configSection.appendChild(field("Currency", "configCurrency", { placeholder: "AUD" }));
    configSection.appendChild(
      field("Notes", "configNotes", {
        type: "textarea",
        rows: 3,
        hint: "Documentation only — not shown to customers.",
      }),
    );
    form.appendChild(configSection);

    const codesSection = document.createElement("fieldset");
    codesSection.className = "discount-codes-section";
    const codesLegend = document.createElement("legend");
    codesLegend.textContent = "Codes";
    codesSection.appendChild(codesLegend);

    const skuHint =
      productSkus.length > 0
        ? `Leave blank for whole cart. Product SKUs: ${productSkus.slice(0, 12).join(", ")}${productSkus.length > 12 ? "…" : ""}`
        : "Leave blank to apply to the whole cart.";

    const codesList = document.createElement("div");
    codesList.className = "discount-codes-list";
    codesList.dataset.discountCodesList = "true";
    codesList.dataset.skuHint = skuHint;
    codesSection.appendChild(codesList);

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "discount-codes-btn";
    addBtn.textContent = "+ Add discount code";
    addBtn.addEventListener("click", () => {
      const index = codesList.querySelectorAll(".discount-codes-code-card").length;
      codesList.appendChild(
        buildCodeCard({ active: true, code: "", type: "percent", value: 0 }, index, skuHint),
      );
      bindCodeListEvents(form);
    });
    codesSection.appendChild(addBtn);
    form.appendChild(codesSection);

    fillForm(form, baseData);

    const footer = document.createElement("div");
    footer.className = "discount-codes-footer";

    const status = document.createElement("span");
    status.className = "discount-codes-status";
    status.setAttribute("aria-live", "polite");

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "discount-codes-btn discount-codes-btn--muted";
    resetBtn.textContent = "Reload from file";

    const pushBtn = document.createElement("button");
    pushBtn.type = "button";
    pushBtn.className = "discount-codes-btn discount-codes-btn--primary";
    pushBtn.textContent = "Save discount codes to GitHub";

    footer.appendChild(resetBtn);
    footer.appendChild(pushBtn);
    footer.appendChild(status);
    form.appendChild(footer);
    body.appendChild(form);

    function setStatus(message, kind) {
      status.textContent = message || "";
      status.classList.remove("discount-codes-status--ok", "discount-codes-status--error");
      if (kind === "ok") {
        status.classList.add("discount-codes-status--ok");
      } else if (kind === "error") {
        status.classList.add("discount-codes-status--error");
      }
    }

    resetBtn.addEventListener("click", async () => {
      resetBtn.disabled = true;
      setStatus("Reloading…", null);
      try {
        const refreshed = await fetchDiscountCodesJson();
        fillForm(form, refreshed);
        const count = refreshed.codes.length;
        summary.textContent =
          count > 0 ? `Discount codes · ${count} code${count === 1 ? "" : "s"}` : "Discount codes";
        setStatus("Reloaded from file.", "ok");
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      } finally {
        resetBtn.disabled = false;
      }
    });

    pushBtn.addEventListener("click", async () => {
      pushBtn.disabled = true;
      setStatus("Saving…", null);
      try {
        const payload = discountCodesFromForm(form, { validate: true });
        if (!window.githubAuth?.pushDiscountCodes) {
          throw new Error("GitHub discount codes push is not available.");
        }
        await window.githubAuth.pushDiscountCodes(payload);
        const refreshed = await fetchDiscountCodesJson();
        fillForm(form, refreshed);
        const count = refreshed.codes.length;
        summary.textContent =
          count > 0 ? `Discount codes · ${count} code${count === 1 ? "" : "s"}` : "Discount codes";
        setStatus("Saved to GitHub.", "ok");
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      } finally {
        pushBtn.disabled = false;
      }
    });
  }

  window.discountCodesEditor = {
    fetchDiscountCodesJson,
    normalizeDiscountCodes,
    formatDiscountCodesJsonText,
    initDiscountCodesEditor,
  };
})();
