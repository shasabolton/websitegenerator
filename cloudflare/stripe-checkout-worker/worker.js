/**
 * Cloudflare Worker: Stripe Checkout for the shop cart + order notification email.
 *
 * Secrets (npx wrangler secret put NAME):
 *   STRIPE_SECRET_KEY       sk_live_... (or sk_test_... while testing)
 *   STRIPE_WEBHOOK_SECRET   whsec_... from the Stripe webhook endpoint
 *   RESEND_API_KEY          re_... (same Resend account as the newsletter worker)
 * Vars (wrangler.jsonc):
 *   SITE_ORIGIN   https://www.contraptioncart.com (prices/config are read from here)
 *   NOTIFY_TO     order notification recipient
 *   FROM_EMAIL    Resend sender
 *
 * Routes:
 *   POST /api/checkout/session   cart -> Stripe Checkout Session URL
 *   GET  /api/checkout/session?id=cs_...   minimal status for the cart success message
 *   POST /api/checkout/webhook   Stripe events -> order email
 */

const STRIPE_API = "https://api.stripe.com/v1";
const STRIPE_VERSION = "2026-09-30.endive";
const MAX_BODY_BYTES = 16384;
const MAX_LINES = 50;
const MAX_QTY_PER_LINE = 99;
const DEFAULT_UNIT_WEIGHT_KG = 0.25;
const WEBHOOK_TOLERANCE_SECONDS = 300;
/** The Stripe account is shared with other sites (e.g. phonebot); their events reach this webhook too. */
const CHECKOUT_SOURCE = "contraptioncart";

const EU_COUNTRY_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/** Stripe Checkout shipping_address_collection enum, minus unsupported SD and placeholder ZZ. */
const STRIPE_SHIPPING_COUNTRIES = [
  "AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AT", "AU", "AW", "AX", "AZ",
  "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS",
  "BT", "BV", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO",
  "CR", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER",
  "ES", "ET", "FI", "FJ", "FK", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL",
  "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID",
  "IE", "IL", "IM", "IN", "IO", "IQ", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI",
  "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
  "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MS", "MT",
  "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NU",
  "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PY", "QA",
  "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM",
  "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SZ", "TA", "TC", "TD", "TF", "TG", "TH", "TJ", "TK",
  "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC",
  "VE", "VG", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

const SHIP_TO = {
  AU: { label: "Australia", postageCountry: "AU", countries: ["AU"] },
  NZ: { label: "New Zealand", postageCountry: "NZ", countries: ["NZ"] },
  __EU__: { label: "European Union", postageCountry: "DE", countries: EU_COUNTRY_CODES },
  __OTHER__: {
    label: "Other countries",
    postageCountry: "US",
    countries: STRIPE_SHIPPING_COUNTRIES.filter(
      (cc) => cc !== "AU" && cc !== "NZ" && !EU_COUNTRY_CODES.includes(cc),
    ),
  },
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidEmail(value) {
  const email = String(value ?? "").trim();
  return email.length >= 5 && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function money(cents, currency = "AUD") {
  return `${currency} ${(Math.max(0, Number(cents) || 0) / 100).toFixed(2)}`;
}

function toCents(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
}

function siteOrigin(env) {
  return String(env.SITE_ORIGIN || "https://www.contraptioncart.com").replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Catalog + pricing (mirrors the cart page so totals match what the buyer saw)
// ---------------------------------------------------------------------------

async function fetchSiteJson(env, fileName) {
  const url = `${siteOrigin(env)}/shared-assets/config/${fileName}`;
  const res = await fetch(url, { cf: { cacheTtl: 60, cacheEverything: true } });
  if (!res.ok) {
    throw new Error(`Could not load ${fileName} (${res.status})`);
  }
  return res.json();
}

function splitCommaList(raw) {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function choicePairsFromLineId(lineId) {
  const s = String(lineId || "").trim();
  const sep = s.indexOf("::");
  if (sep < 0) {
    return [];
  }
  const pairs = [];
  for (const part of s.slice(sep + 2).split("&")) {
    const eq = part.indexOf("=");
    if (eq < 0) {
      continue;
    }
    try {
      pairs.push([decodeURIComponent(part.slice(0, eq)).trim(), decodeURIComponent(part.slice(eq + 1)).trim()]);
    } catch {
      pairs.push([part.slice(0, eq).trim(), part.slice(eq + 1).trim()]);
    }
  }
  return pairs;
}

/** Base PRICE plus per-axis deltas; throws when a chosen option no longer exists. */
function priceLineFromRow(row, lineId) {
  let cents = toCents(row.PRICE);
  const options = [];
  const chosen = new Map(choicePairsFromLineId(lineId));
  for (let i = 1; i <= 2; i += 1) {
    const axisName = String(row[`VARIATION ${i} NAME`] || "").trim();
    const values = splitCommaList(row[`VARIATION ${i} VALUES`]);
    if (!axisName || values.length === 0 || !chosen.has(axisName)) {
      continue;
    }
    const value = chosen.get(axisName);
    const idx = values.indexOf(value);
    if (idx < 0) {
      throw new UserError(
        `The option "${axisName}: ${value}" is no longer available. Please remove it from your cart and add it again.`,
        409,
      );
    }
    const delta = parseFloat(String(String(row[`VARIATION ${i} PRICE DELTA`] ?? "").split(",")[idx] ?? "").trim());
    if (Number.isFinite(delta)) {
      cents += Math.round(delta * 100);
    }
    options.push(`${axisName}: ${value}`);
  }
  return { unitCents: Math.max(0, cents), options: options.join("; ") };
}

function resolveShippingZone(shippingRates, countryCode) {
  const zones = Array.isArray(shippingRates?.rates) ? shippingRates.rates : [];
  let fallback = null;
  for (const zone of zones) {
    if (zone?.default === true) {
      fallback = zone;
    }
    if (Array.isArray(zone?.countryCodes) && zone.countryCodes.includes(countryCode)) {
      return zone;
    }
  }
  return fallback;
}

function postageCents(shippingRates, countryCode, grams) {
  const tiers = resolveShippingZone(shippingRates, countryCode)?.rates;
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return 0;
  }
  const sorted = tiers.slice().sort((a, b) => (Number(a.weight) || 0) - (Number(b.weight) || 0));
  const tier = sorted.find((t) => grams <= (Number(t.weight) || 0)) || sorted[sorted.length - 1];
  return toCents(tier.price);
}

/** Same rules as shared-assets/script/discountCodes.js evaluateDiscount, in cents. */
function evaluateDiscount(discountConfig, codeInput, lines) {
  const code = String(codeInput ?? "").trim().toUpperCase();
  if (!code) {
    return null;
  }
  const def = (Array.isArray(discountConfig?.codes) ? discountConfig.codes : []).find(
    (entry) => entry && entry.active !== false && String(entry.code ?? "").trim().toUpperCase() === code,
  );
  if (!def) {
    throw new UserError("Your discount code is no longer valid. Please remove it and try again.", 409);
  }
  const type = String(def.type ?? "").trim().toLowerCase();
  const value = Number(def.value);
  if ((type !== "percent" && type !== "fixed") || !Number.isFinite(value) || value < 0 || (type === "percent" && value > 100)) {
    throw new UserError("Your discount code could not be applied. Please remove it and try again.", 409);
  }
  const skus = Array.isArray(def.skus) && def.skus.length > 0 ? new Set(def.skus.map((s) => String(s).trim())) : null;
  const eligible = skus ? lines.filter((l) => skus.has(l.sku)) : lines;
  const eligibleCents = eligible.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const eligibleQty = eligible.reduce((sum, l) => sum + l.quantity, 0);
  const minSubtotal = Number(def.minSubtotal);
  const minQuantity = Number(def.minQuantity);
  if (
    eligible.length === 0 ||
    (Number.isFinite(minSubtotal) && minSubtotal > 0 && eligibleCents < Math.round(minSubtotal * 100)) ||
    (Number.isFinite(minQuantity) && minQuantity > 0 && eligibleQty < minQuantity)
  ) {
    throw new UserError("Your discount code no longer applies to this cart. Please remove it and try again.", 409);
  }
  let amountCents = type === "percent" ? Math.round((eligibleCents * value) / 100) : Math.round(value * 100);
  amountCents = Math.min(amountCents, eligibleCents);
  if (amountCents <= 0) {
    return null;
  }
  const label = type === "percent" ? `${code} (${value}% off)` : code;
  return { code, label, amountCents };
}

async function priceCart(env, payload) {
  const shipTo = String(payload.shipTo ?? "").trim();
  const shipToDef = SHIP_TO[shipTo];
  if (!shipToDef) {
    throw new UserError("Select a ship-to country before checking out.");
  }
  const email = String(payload.email ?? "").trim();
  if (!isValidEmail(email)) {
    throw new UserError("Enter a valid email address before checking out.");
  }
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (rawItems.length === 0) {
    throw new UserError("Your cart is empty.");
  }
  if (rawItems.length > MAX_LINES) {
    throw new UserError("Too many lines in the cart.");
  }

  const [productData, shippingRates, discountConfig] = await Promise.all([
    fetchSiteJson(env, "productData.json"),
    fetchSiteJson(env, "shippingRates.json"),
    fetchSiteJson(env, "discountCodes.json"),
  ]);
  const products = Array.isArray(productData?.products) ? productData.products : [];
  const currency = String(shippingRates?.currency || "AUD").trim().toUpperCase() || "AUD";

  const lines = rawItems.map((raw) => {
    const sku = String(raw?.sku ?? "").trim();
    const row = products.find((p) => p && String(p.SKU ?? "").trim() === sku);
    if (!row) {
      throw new UserError(`"${sku || "An item"}" is no longer available. Please remove it from your cart.`, 409);
    }
    const quantity = Math.min(MAX_QTY_PER_LINE, Math.max(1, Math.floor(Number(raw?.quantity)) || 1));
    const { unitCents, options } = priceLineFromRow(row, raw?.lineId);
    const weight = parseFloat(String(row.WEIGHT_KG ?? ""));
    const image = String(row.IMAGE1 || "").trim();
    return {
      sku,
      title: String(row.SHORT_TITLE || "").trim() || String(row.TITLE || "").trim() || sku,
      options,
      quantity,
      unitCents,
      unitWeightKg: Number.isFinite(weight) && weight >= 0 ? weight : DEFAULT_UNIT_WEIGHT_KG,
      image: /^https:\/\//i.test(image) ? image : "",
    };
  });

  const itemTotalCents = lines.reduce((sum, l) => sum + l.unitCents * l.quantity, 0);
  const grams = Math.ceil(lines.reduce((sum, l) => sum + l.unitWeightKg * l.quantity, 0) * 1000);
  const discount = evaluateDiscount(discountConfig, payload.discountCode, lines);
  const discountCents = discount ? discount.amountCents : 0;
  const postage = postageCents(shippingRates, shipToDef.postageCountry, grams);

  let dutyCents = 0;
  let vatCents = 0;
  if (shipTo === "__EU__") {
    const eu = shippingRates?.euImport || {};
    const dutyAud = Number.isFinite(Number(eu.dutyAud)) && Number(eu.dutyAud) >= 0 ? Number(eu.dutyAud) : 5;
    const vatRate = Number.isFinite(Number(eu.vatRate)) && Number(eu.vatRate) >= 0 ? Number(eu.vatRate) : 0.2;
    dutyCents = Math.round(dutyAud * 100);
    vatCents = Math.round(vatRate * (itemTotalCents - discountCents + postage + dutyCents));
  }

  return {
    shipTo,
    shipToDef,
    email,
    currency,
    lines,
    grams,
    itemTotalCents,
    discount,
    discountCents,
    postageCents: postage,
    dutyCents,
    vatCents,
    totalCents: itemTotalCents - discountCents + postage + dutyCents + vatCents,
  };
}

// ---------------------------------------------------------------------------
// Stripe API
// ---------------------------------------------------------------------------

function appendForm(params, key, value) {
  if (value === undefined || value === null || value === "") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => appendForm(params, `${key}[${i}]`, v));
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      appendForm(params, key ? `${key}[${k}]` : k, v);
    }
  } else {
    params.append(key, String(value));
  }
}

async function stripeRequest(env, method, path, body) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }
  const init = {
    method,
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Stripe-Version": STRIPE_VERSION,
    },
    signal: AbortSignal.timeout(15_000),
  };
  if (body) {
    const params = new URLSearchParams();
    appendForm(params, "", body);
    init.body = params;
    init.headers["Content-Type"] = "application/x-www-form-urlencoded";
  }
  const res = await fetch(`${STRIPE_API}${path}`, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Stripe error ${res.status}`);
    err.stripe = data?.error || null;
    throw err;
  }
  return data;
}

function newOrderRef() {
  const d = new Date();
  const ymd = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(5));
  return `CC-${ymd}-${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

async function createCheckoutSession(env, order) {
  const cur = order.currency.toLowerCase();
  const orderRef = newOrderRef();
  const origin = siteOrigin(env);

  let discounts;
  if (order.discount) {
    const coupon = await stripeRequest(env, "POST", "/coupons", {
      amount_off: order.discountCents,
      currency: cur,
      duration: "once",
      max_redemptions: 1,
      name: order.discount.label.slice(0, 40),
      metadata: { order_ref: orderRef, code: order.discount.code },
    });
    discounts = [{ coupon: coupon.id }];
  }

  const importCents = order.dutyCents + order.vatCents;
  const shippingName =
    importCents > 0
      ? `Postage to ${order.shipToDef.label} + EU duty & VAT`
      : `Postage to ${order.shipToDef.label}`;

  const metadata = {
    source: CHECKOUT_SOURCE,
    order_ref: orderRef,
    ship_to: order.shipTo,
    ship_to_label: order.shipToDef.label,
    cart_email: order.email,
    item_total_cents: order.itemTotalCents,
    discount_code: order.discount?.code || "",
    discount_cents: order.discountCents,
    postage_cents: order.postageCents,
    eu_duty_cents: order.dutyCents,
    eu_vat_cents: order.vatCents,
    weight_grams: order.grams,
  };

  return stripeRequest(env, "POST", "/checkout/sessions", {
    mode: "payment",
    submit_type: "pay",
    client_reference_id: orderRef,
    customer_email: order.email,
    customer_creation: "if_required",
    billing_address_collection: "auto",
    phone_number_collection: { enabled: true },
    shipping_address_collection: { allowed_countries: order.shipToDef.countries },
    shipping_options: [
      {
        shipping_rate_data: {
          type: "fixed_amount",
          display_name: shippingName,
          fixed_amount: { amount: order.postageCents + importCents, currency: cur },
        },
      },
    ],
    line_items: order.lines.map((line) => ({
      quantity: line.quantity,
      price_data: {
        currency: cur,
        unit_amount: line.unitCents,
        product_data: {
          name: line.title.slice(0, 250),
          description: line.options || undefined,
          images: line.image ? [line.image] : undefined,
          metadata: { sku: line.sku, options: line.options },
        },
      },
    })),
    discounts,
    metadata,
    payment_intent_data: {
      description: `Contraption Cart order ${orderRef}`,
      metadata,
    },
    success_url: `${origin}/cart/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/cart/?checkout=cancelled`,
  });
}

// ---------------------------------------------------------------------------
// Webhook + order email
// ---------------------------------------------------------------------------

function timingSafeEqualHex(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(env, rawBody, header) {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !header) {
    return false;
  }
  let timestamp = "";
  const signatures = [];
  for (const part of header.split(",")) {
    const [k, v] = part.split("=");
    if (k === "t") {
      timestamp = v;
    } else if (k === "v1" && v) {
      signatures.push(v);
    }
  }
  const t = Number(timestamp);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > WEBHOOK_TOLERANCE_SECONDS || signatures.length === 0) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const expected = Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, "0")).join("");
  return signatures.some((sig) => timingSafeEqualHex(sig, expected));
}

function addressLines(address) {
  if (!address) {
    return [];
  }
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(" "),
    address.country,
  ]
    .map((s) => String(s ?? "").trim())
    .filter(Boolean);
}

function shippingCountryMatches(shipTo, countryCode) {
  const def = SHIP_TO[shipTo];
  return Boolean(def && countryCode && def.countries.includes(countryCode));
}

function paymentMethodLabel(session) {
  const details = session.payment_intent?.latest_charge?.payment_method_details;
  if (!details) {
    return "";
  }
  const wallet = details.card?.wallet?.type;
  if (wallet) {
    return wallet.replaceAll("_", " ");
  }
  if (details.type === "card" && details.card) {
    return `card (${details.card.brand || ""} •••• ${details.card.last4 || ""})`;
  }
  return String(details.type || "").replaceAll("_", " ");
}

function buildOrderEmail(session) {
  const meta = session.metadata || {};
  const cur = String(session.currency || "aud").toUpperCase();
  const customer = session.customer_details || {};
  const shipping = session.collected_information?.shipping_details || session.shipping_details || null;
  const shipCountry = String(shipping?.address?.country || "").toUpperCase();
  const countryOk = shippingCountryMatches(meta.ship_to, shipCountry);
  const orderRef = meta.order_ref || session.client_reference_id || session.id;
  const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
  const dashboardUrl = paymentIntentId
    ? `https://dashboard.stripe.com/${session.livemode ? "" : "test/"}payments/${paymentIntentId}`
    : "";
  const buyerEmail = customer.email || meta.cart_email || "";
  const items = (session.line_items?.data || []).map((li) => {
    const product = typeof li.price?.product === "object" ? li.price.product : null;
    return {
      title: product?.name || li.description || "Item",
      sku: product?.metadata?.sku || "",
      options: product?.metadata?.options || "",
      quantity: li.quantity || 1,
      unitCents: li.price?.unit_amount ?? 0,
      lineCents: li.amount_subtotal ?? 0,
    };
  });

  const totals = [
    ["Items subtotal", money(meta.item_total_cents ?? session.amount_subtotal, cur)],
    Number(meta.discount_cents) > 0 ? [`Discount (${meta.discount_code})`, `−${money(meta.discount_cents, cur)}`] : null,
    ["Postage", money(meta.postage_cents, cur)],
    Number(meta.eu_duty_cents) > 0 ? ["EU duty", money(meta.eu_duty_cents, cur)] : null,
    Number(meta.eu_vat_cents) > 0 ? ["EU VAT", money(meta.eu_vat_cents, cur)] : null,
    ["Total paid", money(session.amount_total, cur)],
  ].filter(Boolean);

  const shipAddress = addressLines(shipping?.address);
  const billAddress = addressLines(customer.address);
  const countryCheck = countryOk
    ? `OK (${shipCountry} is in "${meta.ship_to_label}")`
    : `MISMATCH: cart said "${meta.ship_to_label || meta.ship_to}", address country is ${shipCountry || "missing"}`;
  const method = paymentMethodLabel(session);

  const subject = `${countryOk ? "" : "[CHECK COUNTRY] "}New order ${orderRef}: ${shipping?.name || customer.name || buyerEmail} (${shipCountry || "?"}) ${money(session.amount_total, cur)}`;

  const text = [
    `New order ${orderRef}`,
    "",
    "CUSTOMER",
    `Name: ${shipping?.name || customer.name || ""}`,
    `Email: ${buyerEmail}`,
    meta.cart_email && meta.cart_email.toLowerCase() !== String(customer.email || "").toLowerCase()
      ? `Email entered in cart: ${meta.cart_email}`
      : null,
    `Phone: ${customer.phone || ""}`,
    "",
    "SHIP TO",
    ...shipAddress,
    `Cart ship-to selection: ${meta.ship_to_label || meta.ship_to}`,
    `Country check: ${countryCheck}`,
    `Weight: ${meta.weight_grams} g`,
    "",
    "ITEMS",
    ...items.map(
      (i) =>
        `${i.quantity} × ${i.title}${i.options ? ` (${i.options})` : ""} [SKU ${i.sku}] @ ${money(i.unitCents, cur)} = ${money(i.lineCents, cur)}`,
    ),
    "",
    ...totals.map(([k, v]) => `${k}: ${v}`),
    "",
    method ? `Paid with: ${method}` : null,
    billAddress.length ? `Billing address: ${billAddress.join(", ")}` : null,
    dashboardUrl ? `Stripe: ${dashboardUrl}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const td = 'style="padding:4px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top"';
  const html = `<h2 style="margin:0 0 12px">New order ${escapeHtml(orderRef)}</h2>
${countryOk ? "" : `<p style="color:#b91c1c;font-weight:700">Country check: ${escapeHtml(countryCheck)}</p>`}
<h3 style="margin:16px 0 4px">Customer</h3>
<p style="margin:0">${escapeHtml(shipping?.name || customer.name || "")}<br />
<a href="mailto:${escapeHtml(buyerEmail)}">${escapeHtml(buyerEmail)}</a><br />
${escapeHtml(customer.phone || "")}${
    meta.cart_email && meta.cart_email.toLowerCase() !== String(customer.email || "").toLowerCase()
      ? `<br />Email entered in cart: ${escapeHtml(meta.cart_email)}`
      : ""
  }</p>
<h3 style="margin:16px 0 4px">Ship to</h3>
<p style="margin:0">${shipAddress.map(escapeHtml).join("<br />")}</p>
<p style="margin:4px 0 0;color:#4b5563">Cart selection: ${escapeHtml(meta.ship_to_label || meta.ship_to)} · Country check: ${escapeHtml(countryCheck)} · Weight: ${escapeHtml(meta.weight_grams)} g</p>
<h3 style="margin:16px 0 4px">Items</h3>
<table style="border-collapse:collapse;font-size:14px">
<tr><th ${td} align="left">Qty</th><th ${td} align="left">Item</th><th ${td} align="left">SKU</th><th ${td} align="right">Each</th><th ${td} align="right">Total</th></tr>
${items
  .map(
    (i) =>
      `<tr><td ${td}>${i.quantity}</td><td ${td}>${escapeHtml(i.title)}${i.options ? `<br /><small>${escapeHtml(i.options)}</small>` : ""}</td><td ${td}>${escapeHtml(i.sku)}</td><td ${td} align="right">${escapeHtml(money(i.unitCents, cur))}</td><td ${td} align="right">${escapeHtml(money(i.lineCents, cur))}</td></tr>`,
  )
  .join("\n")}
${totals
  .map(([k, v]) => `<tr><td ${td} colspan="4" align="right">${escapeHtml(k)}</td><td ${td} align="right">${escapeHtml(v)}</td></tr>`)
  .join("\n")}
</table>
<p style="margin:16px 0 0;color:#4b5563">${method ? `Paid with: ${escapeHtml(method)}<br />` : ""}${
    billAddress.length ? `Billing address: ${escapeHtml(billAddress.join(", "))}<br />` : ""
  }${dashboardUrl ? `<a href="${escapeHtml(dashboardUrl)}">View payment in Stripe</a>` : ""}</p>`;

  return { subject, text, html, replyTo: buyerEmail };
}

async function sendOrderEmail(env, sessionId) {
  const query = new URLSearchParams();
  query.append("expand[]", "line_items.data.price.product");
  query.append("expand[]", "payment_intent.latest_charge");
  const session = await stripeRequest(env, "GET", `/checkout/sessions/${encodeURIComponent(sessionId)}?${query}`);
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
    return;
  }
  const notifyTo = String(env.NOTIFY_TO || "").trim();
  const fromEmail = String(env.FROM_EMAIL || "").trim();
  if (!notifyTo || !fromEmail || !env.RESEND_API_KEY) {
    throw new Error("Email not configured (NOTIFY_TO, FROM_EMAIL, RESEND_API_KEY)");
  }
  const email = buildOrderEmail(session);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `order-${session.id}`,
    },
    signal: AbortSignal.timeout(10_000),
    body: JSON.stringify({
      from: fromEmail,
      to: [notifyTo],
      reply_to: isValidEmail(email.replyTo) ? email.replyTo : undefined,
      subject: email.subject,
      text: email.text,
      html: email.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend failed (${res.status}): ${await res.text().catch(() => "")}`);
  }
}

async function handleWebhook(request, env) {
  const rawBody = await request.text();
  const ok = await verifyStripeSignature(env, rawBody, request.headers.get("Stripe-Signature"));
  if (!ok) {
    return jsonResponse(400, { error: "Invalid signature" });
  }
  const event = JSON.parse(rawBody);
  const session = event?.data?.object;
  if (session?.metadata?.source !== CHECKOUT_SOURCE) {
    return jsonResponse(200, { received: true, ignored: true });
  }
  const shouldEmail =
    (event.type === "checkout.session.completed" && session?.payment_status === "paid") ||
    event.type === "checkout.session.async_payment_succeeded";
  if (shouldEmail && session?.id) {
    try {
      await sendOrderEmail(env, session.id);
    } catch (err) {
      console.error(JSON.stringify({ event: "order_email_failed", session: session.id, message: err?.message }));
      // Non-2xx makes Stripe retry the webhook later.
      return jsonResponse(500, { error: "Order email failed" });
    }
  }
  return jsonResponse(200, { received: true });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function handleCreateSession(request, env) {
  if (env.CHECKOUT_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.CHECKOUT_LIMITER.limit({ key: ip });
    if (!success) {
      return jsonResponse(429, { error: "Too many checkout attempts. Please wait a minute and try again." });
    }
  }
  const lengthHeader = Number(request.headers.get("Content-Length") || 0);
  if (lengthHeader > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: "Cart too large" });
  }
  let payload;
  try {
    payload = JSON.parse(await request.text());
  } catch {
    return jsonResponse(400, { error: "Invalid request" });
  }
  try {
    const order = await priceCart(env, payload || {});
    const session = await createCheckoutSession(env, order);
    return jsonResponse(200, { url: session.url, id: session.id, totalCents: order.totalCents });
  } catch (err) {
    if (err instanceof UserError) {
      return jsonResponse(err.status, { error: err.message });
    }
    console.error(JSON.stringify({ event: "create_session_failed", message: err?.message, stripe: err?.stripe }));
    return jsonResponse(502, { error: "Checkout is temporarily unavailable. Please try again shortly." });
  }
}

async function handleSessionStatus(url, env) {
  const id = String(url.searchParams.get("id") || "");
  if (!/^cs_[A-Za-z0-9_]+$/.test(id)) {
    return jsonResponse(400, { error: "Invalid session id" });
  }
  try {
    const session = await stripeRequest(env, "GET", `/checkout/sessions/${encodeURIComponent(id)}`);
    if (session.metadata?.source !== CHECKOUT_SOURCE) {
      return jsonResponse(404, { error: "Session not found" });
    }
    return jsonResponse(200, {
      status: session.status,
      paymentStatus: session.payment_status,
      orderRef: session.client_reference_id || "",
      amountTotal: (session.amount_total || 0) / 100,
      currency: String(session.currency || "aud").toUpperCase(),
    });
  } catch {
    return jsonResponse(404, { error: "Session not found" });
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    if (path === "/api/checkout/session" && request.method === "POST") {
      return handleCreateSession(request, env);
    }
    if (path === "/api/checkout/session" && request.method === "GET") {
      return handleSessionStatus(url, env);
    }
    if (path === "/api/checkout/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }
    return jsonResponse(404, { error: "Not found" });
  },
};
