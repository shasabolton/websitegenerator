(function () {
  const BANNER_URL = "../../shared-assets/config/banner.json";
  const THEMES = [
    { value: "brass", label: "General brass" },
    { value: "christmas", label: "Christmas" },
    { value: "halloween", label: "Halloween" },
  ];
  const MESSAGE_MAX = 140;

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function defaultBanner() {
    return {
      version: 1,
      enabled: false,
      code: "",
      theme: "brass",
      message: "",
      endsAt: "",
    };
  }

  function normalizeBanner(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    const themeRaw = String(input.theme ?? "")
      .trim()
      .toLowerCase();
    const theme = THEMES.some((item) => item.value === themeRaw) ? themeRaw : "brass";
    const code = String(input.code ?? "")
      .trim()
      .toUpperCase();
    const message = String(input.message ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MESSAGE_MAX);
    let endsAt = "";
    const endsRaw = String(input.endsAt ?? "").trim();
    if (endsRaw) {
      const fromLocal = fromDatetimeLocalValue(endsRaw);
      if (fromLocal) {
        endsAt = fromLocal;
      } else {
        const ends = Date.parse(endsRaw);
        if (Number.isFinite(ends)) {
          endsAt = new Date(ends).toISOString();
        }
      }
    }
    const enabled = input.enabled === true && Boolean(code) && Boolean(message);
    return {
      version: 1,
      enabled,
      code: enabled ? code : "",
      theme,
      message,
      endsAt,
    };
  }

  function formatBannerJsonText(data) {
    return `${JSON.stringify(normalizeBanner(data), null, 2)}\n`;
  }

  async function fetchStaticBanner() {
    const resolved = new URL(BANNER_URL, window.location.href).href;
    const response = await fetch(resolved, { cache: "no-store" });
    if (!response.ok) {
      return defaultBanner();
    }
    return normalizeBanner(await response.json());
  }

  async function fetchBannerJson() {
    if (typeof window.githubAuth?.loadJson === "function") {
      try {
        return normalizeBanner(await window.githubAuth.loadJson(BANNER_URL));
      } catch (err) {
        const message = String(err?.message || err);
        if (!/missing/i.test(message) && err?.status !== 404) {
          throw err;
        }
      }
    }
    try {
      return await fetchStaticBanner();
    } catch {
      return defaultBanner();
    }
  }

  function suggestMessage(entry) {
    if (!entry) {
      return "";
    }
    const code = String(entry.code || "").trim().toUpperCase();
    if (entry.type === "percent") {
      const scope = Array.isArray(entry.skus) && entry.skus.length ? "selected items" : "everything";
      const qty = Number(entry.minQuantity) > 1 ? ` on ${Math.floor(entry.minQuantity)} or more` : "";
      return `${entry.value}% off ${scope}${qty}. Use code ${code} at checkout.`.slice(0, MESSAGE_MAX);
    }
    const amount = Number(entry.value);
    const money = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
    return `$${money} off. Use code ${code} at checkout.`.slice(0, MESSAGE_MAX);
  }

  function codeOptionLabel(entry) {
    if (entry.type === "percent") {
      const bits = [`${entry.value}% off`];
      if (Array.isArray(entry.skus) && entry.skus.length) {
        bits.push("selected items");
      }
      if (Number(entry.minQuantity) > 1) {
        bits.push(`${Math.floor(entry.minQuantity)}+`);
      }
      return `${entry.code} — ${bits.join(", ")}`;
    }
    return `${entry.code} — $${entry.value} off`;
  }

  function themeLabel(theme) {
    return THEMES.find((item) => item.value === theme)?.label || "General brass";
  }

  function summaryText(banner) {
    if (!banner?.enabled || !banner.code) {
      return "Sale banner · off";
    }
    return `Sale banner · ${banner.code} · ${themeLabel(banner.theme)}`;
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function toDatetimeLocalValue(iso) {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) {
      return "";
    }
    const date = new Date(ms);
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  }

  /**
   * datetime-local has no timezone. Parse the parts as local time.
   * Date.parse of that string is not reliable across browsers.
   */
  function fromDatetimeLocalValue(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!match) {
      return "";
    }
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6] || 0),
    );
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString();
  }

  function activeCodes(discountData) {
    const codes = Array.isArray(discountData?.codes) ? discountData.codes : [];
    return codes
      .filter((entry) => entry && entry.active !== false && String(entry.code || "").trim())
      .slice()
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }

  function field(label, name, options = {}) {
    const wrap = document.createElement("div");
    wrap.className = "banner-editor-field";

    const id = `banner-editor-${name}`;
    const lab = document.createElement("label");
    lab.className = "banner-editor-label";
    lab.htmlFor = id;
    lab.textContent = label;
    wrap.appendChild(lab);

    let control;
    if (options.type === "select") {
      control = document.createElement("select");
    } else {
      control = document.createElement("input");
      control.type = options.inputType || "text";
      if (options.maxLength) {
        control.maxLength = options.maxLength;
      }
    }
    control.id = id;
    control.name = name;
    if (options.placeholder) {
      control.placeholder = options.placeholder;
    }
    wrap.appendChild(control);

    if (options.hint) {
      const hint = document.createElement("p");
      hint.className = "banner-editor-hint";
      hint.textContent = options.hint;
      wrap.appendChild(hint);
    }

    return wrap;
  }

  async function initBannerEditor(options = {}) {
    const rootId = options.rootId || "banner-editor-root";
    const root = document.getElementById(rootId);
    if (!root) {
      return;
    }

    root.innerHTML = "";
    root.classList.add("banner-editor-panel");

    const details = document.createElement("details");
    details.className = "banner-editor-details";

    const summary = document.createElement("summary");
    summary.className = "banner-editor-summary";
    summary.textContent = "Sale banner";

    const body = document.createElement("div");
    body.className = "banner-editor-body";
    body.innerHTML = `<p class="banner-editor-loading">Loading sale banner…</p>`;

    details.appendChild(summary);
    details.appendChild(body);
    root.appendChild(details);

    let banner;
    let codes = [];
    try {
      const discountPromise =
        typeof window.discountCodesEditor?.fetchDiscountCodesJson === "function"
          ? window.discountCodesEditor.fetchDiscountCodesJson()
          : Promise.resolve({ codes: [] });
      const [bannerData, discountData] = await Promise.all([fetchBannerJson(), discountPromise]);
      banner = bannerData;
      codes = activeCodes(discountData);
    } catch (err) {
      body.innerHTML = `<p class="banner-editor-error">${escapeHtml(err?.message || String(err))}</p>`;
      return;
    }

    summary.textContent = summaryText(banner);
    body.innerHTML = "";

    const intro = document.createElement("p");
    intro.className = "banner-editor-intro";
    intro.textContent =
      "Choose an active promo code to show one line above the header, about as tall as the logo. Save here, then regenerate the site once so every page has the banner slot. After that, banner edits go live without regenerating pages.";
    body.appendChild(intro);

    const form = document.createElement("form");
    form.className = "banner-editor-form";
    form.noValidate = true;

    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "your local time";
    form.appendChild(field("Promo code", "bannerCode", { type: "select" }));
    form.appendChild(
      field("Theme", "bannerTheme", {
        type: "select",
        hint: "General brass, Christmas, or Halloween. Motion stays slow and stops when the visitor asks for reduced motion.",
      }),
    );
    form.appendChild(
      field("Message", "bannerMessage", {
        maxLength: MESSAGE_MAX,
        placeholder: "20% off everything until Sunday 22 November. Use code XMAS at checkout.",
        hint: "One line. Prefilled from the code, and you can rewrite it.",
      }),
    );
    form.appendChild(
      field("End", "bannerEnds", {
        inputType: "datetime-local",
        hint: `Optional. Hides the banner after this time (${timeZone}). The promo code stays active until you turn it off under Discount codes.`,
      }),
    );

    const themeSelect = form.querySelector('[name="bannerTheme"]');
    for (const theme of THEMES) {
      const option = document.createElement("option");
      option.value = theme.value;
      option.textContent = theme.label;
      themeSelect.appendChild(option);
    }

    const codeSelect = form.querySelector('[name="bannerCode"]');
    const messageInput = form.querySelector('[name="bannerMessage"]');
    const endsInput = form.querySelector('[name="bannerEnds"]');

    function fillCodeOptions(nextCodes, selectedCode) {
      codes = nextCodes;
      const selected = String(selectedCode || "").trim().toUpperCase();
      codeSelect.innerHTML = "";
      const off = document.createElement("option");
      off.value = "";
      off.textContent = "Off";
      codeSelect.appendChild(off);
      const known = new Set();
      for (const entry of codes) {
        const option = document.createElement("option");
        option.value = entry.code;
        option.textContent = codeOptionLabel(entry);
        codeSelect.appendChild(option);
        known.add(entry.code);
      }
      if (selected && !known.has(selected)) {
        const stale = document.createElement("option");
        stale.value = selected;
        stale.textContent = `${selected} — inactive`;
        codeSelect.appendChild(stale);
      }
      codeSelect.value = selected;
    }

    function applyEndValue() {
      const next = toDatetimeLocalValue(banner?.endsAt);
      if (endsInput.value !== next) {
        endsInput.value = next;
      }
    }

    function applyBanner(next) {
      banner = normalizeBanner(next);
      fillCodeOptions(codes, banner.enabled ? banner.code : "");
      themeSelect.value = banner.theme;
      messageInput.value = banner.message;
      const entry = codes.find((item) => item.code === banner.code);
      const suggestion = suggestMessage(entry);
      messageInput.dataset.autofill = banner.message && banner.message === suggestion ? suggestion : "";
      applyEndValue();
      summary.textContent = summaryText(banner);
    }

    codeSelect.addEventListener("change", () => {
      const entry = codes.find((item) => item.code === codeSelect.value);
      const suggestion = suggestMessage(entry);
      const current = messageInput.value;
      if (!current.trim() || current === messageInput.dataset.autofill) {
        messageInput.value = suggestion;
        messageInput.dataset.autofill = suggestion;
      }
      summary.textContent = codeSelect.value
        ? `Sale banner · ${codeSelect.value} · ${themeLabel(themeSelect.value)}`
        : "Sale banner · off";
    });

    themeSelect.addEventListener("change", () => {
      summary.textContent = codeSelect.value
        ? `Sale banner · ${codeSelect.value} · ${themeLabel(themeSelect.value)}`
        : "Sale banner · off";
    });

    const footer = document.createElement("div");
    footer.className = "banner-editor-footer";

    const status = document.createElement("span");
    status.className = "banner-editor-status";
    status.setAttribute("aria-live", "polite");

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "banner-editor-btn banner-editor-btn--muted";
    resetBtn.textContent = "Reload from file";

    const pushBtn = document.createElement("button");
    pushBtn.type = "button";
    pushBtn.className = "banner-editor-btn banner-editor-btn--primary";
    pushBtn.textContent = "Save sale banner to GitHub";

    footer.appendChild(resetBtn);
    footer.appendChild(pushBtn);
    footer.appendChild(status);
    form.appendChild(footer);
    body.appendChild(form);
    applyBanner(banner);
    endsInput.addEventListener("change", () => {
      banner = normalizeBanner({ ...banner, endsAt: fromDatetimeLocalValue(endsInput.value) });
    });

    function setStatus(message, kind) {
      status.textContent = message || "";
      status.classList.remove("banner-editor-status--ok", "banner-editor-status--error");
      if (kind === "ok") {
        status.classList.add("banner-editor-status--ok");
      } else if (kind === "error") {
        status.classList.add("banner-editor-status--error");
      }
    }

    function bannerFromForm() {
      const code = String(codeSelect.value || "")
        .trim()
        .toUpperCase();
      const message = String(messageInput.value || "")
        .replace(/\s+/g, " ")
        .trim();
      const endsRaw = String(endsInput.value || "").trim();
      const endsAt = fromDatetimeLocalValue(endsRaw);
      if (code && !codes.some((entry) => entry.code === code)) {
        throw new Error("Choose an active promo code, or select Off.");
      }
      if (code && !message) {
        throw new Error("Write the one-line banner message.");
      }
      if (message.length > MESSAGE_MAX) {
        throw new Error(`Banner message must be ${MESSAGE_MAX} characters or fewer.`);
      }
      if (endsRaw && !endsAt) {
        throw new Error("End time is not a valid date.");
      }
      return normalizeBanner({
        enabled: Boolean(code),
        code,
        theme: themeSelect.value,
        message,
        endsAt,
      });
    }

    async function reloadCodes() {
      if (typeof window.discountCodesEditor?.fetchDiscountCodesJson !== "function") {
        return;
      }
      const discountData = await window.discountCodesEditor.fetchDiscountCodesJson();
      const selected = String(codeSelect.value || "").trim().toUpperCase();
      fillCodeOptions(activeCodes(discountData), selected);
    }

    details.addEventListener("toggle", () => {
      if (!details.open) {
        return;
      }
      applyEndValue();
      requestAnimationFrame(() => applyEndValue());
      reloadCodes().catch(() => {
        /* Keep the codes already shown. */
      });
    });

    resetBtn.addEventListener("click", async () => {
      resetBtn.disabled = true;
      setStatus("Reloading…", null);
      try {
        const [refreshed, discountData] = await Promise.all([
          fetchBannerJson(),
          typeof window.discountCodesEditor?.fetchDiscountCodesJson === "function"
            ? window.discountCodesEditor.fetchDiscountCodesJson()
            : Promise.resolve({ codes }),
        ]);
        codes = activeCodes(discountData);
        applyBanner(refreshed);
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
        const payload = bannerFromForm();
        if (!window.githubAuth?.pushBanner) {
          throw new Error("GitHub banner push is not available.");
        }
        await window.githubAuth.pushBanner(payload);
        const refreshed = await fetchBannerJson();
        applyBanner(refreshed);
        const when = refreshed.endsAt ? Date.parse(refreshed.endsAt) : NaN;
        if (refreshed.enabled && Number.isFinite(when) && when <= Date.now()) {
          setStatus("Saved. The end time has already passed, so the banner stays hidden.", "ok");
        } else {
          setStatus("Saved to GitHub.", "ok");
        }
      } catch (err) {
        setStatus(err?.message || String(err), "error");
      } finally {
        pushBtn.disabled = false;
      }
    });
  }

  window.bannerEditor = {
    fetchBannerJson,
    normalizeBanner,
    formatBannerJsonText,
    initBannerEditor,
  };
})();
