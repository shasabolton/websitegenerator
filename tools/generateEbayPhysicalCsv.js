const fs = require("fs");
const path = require("path");
const data = require("../shared-assets/config/productData.json");
const shop = require("../shared-assets/config/shopData.json");

// eBay AU leaf category IDs (best-effort — verify in Seller Hub category template)
const CATEGORY_MAP = {
  automata: "1188",
  "magic tricks": "11739",
  "puzzle boxes": "2613",
  "toys and games": "19169",
  whirligigs: "11743",
};

const HEADERS = [
  "Action",
  "Custom label (SKU)",
  "Category ID",
  "Title",
  "Relationship",
  "Relationship details",
  "Start price",
  "Quantity",
  "Condition ID",
  "Description",
  "Format",
  "Duration",
  "Item photo URL",
  "PostalCode",
  "Country",
  "Currency",
  "SiteID",
  "C:ShippingPolicy",
  "C:PaymentPolicy",
  "C:ReturnPolicy",
  "Brand",
  "P:UPC",
];

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function truncateTitle(title, max = 80) {
  const t = String(title || "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).replace(/\s+\S*$/, "").trim() || t.slice(0, max);
}

function descriptionHtml(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("");
}

function imageUrls(p) {
  const urls = [];
  for (let i = 1; i <= 10; i++) {
    const u = (p[`IMAGE${i}`] || "").trim();
    if (u) urls.push(u);
  }
  return urls.join("|");
}

function parseList(s) {
  if (!s || !String(s).trim()) return [];
  return String(s)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseDeltas(s, n) {
  const parts = String(s || "")
    .split(",")
    .map((x) => x.trim());
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = parts[i];
    out.push(v === undefined || v === "" ? 0 : Number(v) || 0);
  }
  return out;
}

function slugPart(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function variationCombos(p) {
  const name1 = (p["VARIATION 1 NAME"] || "").trim();
  const vals1 = parseList(p["VARIATION 1 VALUES"]);
  const deltas1 = parseDeltas(p["VARIATION 1 PRICE DELTA"], vals1.length);
  const name2 = (p["VARIATION 2 NAME"] || "").trim();
  const vals2 = parseList(p["VARIATION 2 VALUES"]);
  const deltas2 = parseDeltas(p["VARIATION 2 PRICE DELTA"], vals2.length);

  if (!name1 || !vals1.length) return null;

  // Parent: Trait=Val1;Val2|Trait2=... — no spaces around = or ;
  const parentParts = [`${name1}=${vals1.join(";")}`];
  if (name2 && vals2.length) parentParts.push(`${name2}=${vals2.join(";")}`);
  const parentDetails = parentParts.join("|");

  const combos = [];
  if (name2 && vals2.length) {
    for (let i = 0; i < vals1.length; i++) {
      for (let j = 0; j < vals2.length; j++) {
        combos.push({
          details: `${name1}=${vals1[i]}|${name2}=${vals2[j]}`,
          priceDelta: (deltas1[i] || 0) + (deltas2[j] || 0),
          skuSuffix: `${slugPart(vals1[i])}-${slugPart(vals2[j])}`,
        });
      }
    }
  } else {
    for (let i = 0; i < vals1.length; i++) {
      combos.push({
        details: `${name1}=${vals1[i]}`,
        priceDelta: deltas1[i] || 0,
        skuSuffix: slugPart(vals1[i]),
      });
    }
  }

  return { parentDetails, combos };
}

function money(n) {
  return (Math.round(Number(n) * 100) / 100).toFixed(2);
}

function blankRow() {
  return Object.fromEntries(HEADERS.map((h) => [h, ""]));
}

const physical = data.products.filter(
  (p) => p.DIGITAL === false && !p.HIDE && !p.DRAFT
);
const rows = [];
const brand = shop.shopName || "Contraption Cart";

for (const p of physical) {
  const basePrice = Number(p.PRICE) || 0;
  const qty = Math.max(0, parseInt(p.QUANTITY, 10) || 0);
  const categoryId = CATEGORY_MAP[(p.CATEGORY || "").toLowerCase()] || "2613";
  const title = truncateTitle(p.TITLE);
  const desc = descriptionHtml(p.DESCRIPTION);
  const photos = imageUrls(p);
  const sku = p.SKU || p.SLUG || title;
  const vars = variationCombos(p);

  const parent = {
    ...blankRow(),
    Action: "Add",
    "Custom label (SKU)": sku,
    "Category ID": categoryId,
    Title: title,
    "Condition ID": "1000",
    Description: desc,
    Format: "FixedPrice",
    Duration: "GTC",
    "Item photo URL": photos,
    PostalCode: "7306",
    Country: "AU",
    Currency: "AUD",
    SiteID: "15",
    "C:ShippingPolicy": "REPLACE_WITH_SHIPPING_POLICY",
    "C:PaymentPolicy": "REPLACE_WITH_PAYMENT_POLICY",
    "C:ReturnPolicy": "REPLACE_WITH_RETURN_POLICY",
    Brand: brand,
  };

  if (!vars) {
    rows.push({
      ...parent,
      "Start price": money(basePrice),
      Quantity: String(qty),
      "P:UPC": "Does not apply",
    });
    continue;
  }

  rows.push({
    ...parent,
    "Relationship details": vars.parentDetails,
    "P:UPC": "",
  });

  // Full qty on first combo; 0 on others — adjust stock before upload
  vars.combos.forEach((c, idx) => {
    rows.push({
      ...blankRow(),
      Relationship: "Variation",
      "Relationship details": c.details,
      "Start price": money(basePrice + c.priceDelta),
      Quantity: idx === 0 ? String(qty) : "0",
      "Custom label (SKU)": `${sku} / ${c.skuSuffix}`,
      "P:UPC": "Does not apply",
    });
  });
}

const outDir = path.join(__dirname, "..", "shared-assets", "data");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "ebay-physical-listings.csv");
const lines = [
  HEADERS.join(","),
  ...rows.map((r) => HEADERS.map((h) => csvEscape(r[h] ?? "")).join(",")),
];
fs.writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(
  JSON.stringify(
    {
      outPath,
      physicalProducts: physical.length,
      csvRows: rows.length,
      parentListings: rows.filter((r) => r.Action === "Add").length,
      variationChildren: rows.filter((r) => r.Relationship === "Variation")
        .length,
      bytes: fs.statSync(outPath).size,
    },
    null,
    2
  )
);
