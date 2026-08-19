/**
 * Footer newsletter form: Turnstile + Worker, with Google Form fallback.
 */
(function initNewsletterSignup() {
  if (window.newsletterSignup && typeof window.newsletterSignup.init === "function") {
    return;
  }

  const TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js";
  const ACTION = "newsletter";

  function setStatus(form, message, kind) {
    const status = form.querySelector("[data-newsletter-status]");
    if (!status) {
      return;
    }
    status.hidden = !message;
    status.textContent = message || "";
    status.classList.toggle("footer-form-status--error", kind === "error");
    status.classList.toggle("footer-form-status--ok", kind === "ok");
  }

  function loadTurnstile() {
    if (window.turnstile) {
      return Promise.resolve();
    }
    if (window.__turnstileLoader) {
      return window.__turnstileLoader;
    }
    window.__turnstileLoader = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${TURNSTILE_SRC}"]`);
      if (existing) {
        existing.addEventListener("load", () => resolve(), { once: true });
        existing.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
          once: true,
        });
        return;
      }
      const script = document.createElement("script");
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", () => resolve(), { once: true });
      script.addEventListener("error", () => reject(new Error("Turnstile failed to load")), {
        once: true,
      });
      document.head.appendChild(script);
    });
    return window.__turnstileLoader;
  }

  function renderWidget(form, sitekey) {
    const mount = form.querySelector("[data-turnstile-mount]");
    if (!mount || !window.turnstile) {
      return "";
    }
    if (form.dataset.turnstileWidgetId) {
      return form.dataset.turnstileWidgetId;
    }
    const widgetId = window.turnstile.render(mount, {
      sitekey,
      action: ACTION,
      theme: "dark",
    });
    form.dataset.turnstileWidgetId = String(widgetId);
    return widgetId;
  }

  function resetWidget(form) {
    const widgetId = form.dataset.turnstileWidgetId;
    if (widgetId && window.turnstile) {
      window.turnstile.reset(widgetId);
    }
  }

  async function onSubmit(event) {
    const form = event.currentTarget;
    const apiUrl = String(form.dataset.signupApiUrl || "").trim();
    const sitekey = String(form.dataset.turnstileSitekey || "").trim();
    if (!apiUrl || !sitekey) {
      return;
    }

    event.preventDefault();
    const button = form.querySelector(".footer-subscribe-button");
    const nameInput = form.querySelector("#footer-subscribe-name");
    const emailInput = form.querySelector("#footer-subscribe-email");
    const honeypot = form.querySelector("#footer-subscribe-website");
    const email = String(emailInput?.value || "").trim();
    if (!email) {
      setStatus(form, "Please enter your email address.", "error");
      emailInput?.focus();
      return;
    }

    const widgetId = form.dataset.turnstileWidgetId;
    const token =
      (widgetId && window.turnstile?.getResponse(widgetId)) ||
      String(form.querySelector("[name='cf-turnstile-response']")?.value || "").trim();
    if (!token) {
      setStatus(form, "Please complete the verification check.", "error");
      return;
    }

    if (button) {
      button.disabled = true;
    }
    setStatus(form, "Sending…", "");

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(nameInput?.value || "").trim(),
          email,
          website: String(honeypot?.value || "").trim(),
          turnstileToken: token,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Signup failed");
      }
      form.reset();
      setStatus(form, "Thanks — you’re on the list.", "ok");
    } catch {
      setStatus(form, "Something went wrong. Please try again in a moment.", "error");
    } finally {
      resetWidget(form);
      if (button) {
        button.disabled = false;
      }
    }
  }

  async function initForm(form) {
    const apiUrl = String(form.dataset.signupApiUrl || "").trim();
    const sitekey = String(form.dataset.turnstileSitekey || "").trim();
    if (!apiUrl || !sitekey) {
      return;
    }
    try {
      await loadTurnstile();
      renderWidget(form, sitekey);
    } catch {
      setStatus(form, "Verification could not load. Refresh the page to try again.", "error");
      return;
    }
    form.addEventListener("submit", onSubmit);
  }

  function init() {
    document.querySelectorAll("form.footer-subscribe-form").forEach((form) => {
      void initForm(form);
    });
  }

  window.newsletterSignup = { init };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
