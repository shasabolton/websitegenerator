/**
 * Client-side discount code evaluation for the shopping cart.
 * Config shape: shared-assets/config/discountCodes.json
 */
(function initDiscountCodes() {
  if (window.discountCodes) {
    return;
  }

  /**
   * @param {unknown} input
   * @returns {string}
   */
  function normalizeCode(input) {
    return String(input ?? "")
      .trim()
      .toUpperCase();
  }

  /**
   * @param {unknown} line
   * @returns {number}
   */
  function lineSubtotal(line) {
    const qty = Math.max(1, Math.floor(Number(line?.quantity)) || 1);
    const price = Number(line?.unitPrice);
    const unit = Number.isFinite(price) && price >= 0 ? price : 0;
    return qty * unit;
  }

  /**
   * @param {object[]} lines
   * @returns {number}
   */
  function sumLineSubtotals(lines) {
    let sum = 0;
    for (const line of lines) {
      sum += lineSubtotal(line);
    }
    return Math.round(sum * 100) / 100;
  }

  /**
   * @param {object[]} lines
   * @returns {number}
   */
  function sumLineQuantities(lines) {
    let sum = 0;
    for (const line of lines) {
      sum += Math.max(1, Math.floor(Number(line?.quantity)) || 1);
    }
    return sum;
  }

  /**
   * @param {object} def
   * @param {object[]} items
   * @returns {object[]}
   */
  function eligibleLinesForDefinition(def, items) {
    const list = Array.isArray(items) ? items : [];
    const skus = Array.isArray(def?.skus) ? def.skus : null;
    if (!skus || skus.length === 0) {
      return list;
    }
    const allowed = new Set(skus.map((s) => String(s).trim()).filter(Boolean));
    return list.filter((line) => allowed.has(String(line?.sku ?? "").trim()));
  }

  /**
   * @param {object} config
   * @param {unknown} codeInput
   * @returns {object | null}
   */
  function findCodeDefinition(config, codeInput) {
    const code = normalizeCode(codeInput);
    if (!code) {
      return null;
    }
    const codes = Array.isArray(config?.codes) ? config.codes : [];
    for (const entry of codes) {
      if (!entry || entry.active === false) {
        continue;
      }
      if (normalizeCode(entry.code) === code) {
        return entry;
      }
    }
    return null;
  }

  /**
   * @param {object} def
   * @param {number} amount
   * @returns {string}
   */
  function discountLabel(def, amount) {
    const code = normalizeCode(def.code);
    const type = String(def.type ?? "")
      .trim()
      .toLowerCase();
    if (type === "percent") {
      return `${code} (${def.value}% off)`;
    }
    if (type === "fixed") {
      return code;
    }
    return code || "Discount";
  }

  /**
   * @param {object} config
   * @param {unknown} codeInput
   * @param {object[]} cartItems
   * @returns {{ ok: true, code: string, type: string, value: number, amount: number, eligibleSubtotal: number, scoped: boolean, label: string } | { ok: false, reason: string }}
   */
  function evaluateDiscount(config, codeInput, cartItems) {
    const def = findCodeDefinition(config, codeInput);
    if (!def) {
      return { ok: false, reason: "Invalid or inactive discount code." };
    }

    const type = String(def.type ?? "")
      .trim()
      .toLowerCase();
    const value = Number(def.value);
    if (type !== "percent" && type !== "fixed") {
      return { ok: false, reason: "Discount configuration is invalid." };
    }
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, reason: "Discount configuration is invalid." };
    }
    if (type === "percent" && value > 100) {
      return { ok: false, reason: "Discount configuration is invalid." };
    }

    const eligible = eligibleLinesForDefinition(def, cartItems);
    if (eligible.length === 0) {
      return { ok: false, reason: "This code does not apply to any items in your cart." };
    }

    const eligibleSubtotal = sumLineSubtotals(eligible);
    const eligibleQuantity = sumLineQuantities(eligible);

    const minSubtotal = Number(def.minSubtotal);
    if (Number.isFinite(minSubtotal) && minSubtotal > 0 && eligibleSubtotal < minSubtotal) {
      return {
        ok: false,
        reason: `Eligible items must total at least $${minSubtotal.toFixed(2)}.`,
      };
    }

    const minQuantity = Number(def.minQuantity);
    if (Number.isFinite(minQuantity) && minQuantity > 0 && eligibleQuantity < minQuantity) {
      const need = Math.floor(minQuantity);
      return {
        ok: false,
        reason: `At least ${need} eligible item${need === 1 ? "" : "s"} required.`,
      };
    }

    let amount = 0;
    if (type === "percent") {
      amount = Math.round(eligibleSubtotal * value) / 100;
    } else {
      amount = value;
    }
    amount = Math.min(amount, eligibleSubtotal);
    amount = Math.round(amount * 100) / 100;
    if (amount <= 0) {
      return { ok: false, reason: "No discount applies to this cart." };
    }

    const scoped = Array.isArray(def.skus) && def.skus.length > 0;
    return {
      ok: true,
      code: normalizeCode(def.code),
      type,
      value,
      amount,
      eligibleSubtotal,
      scoped,
      label: discountLabel(def, amount),
    };
  }

  /**
   * PayPal amount object: total = item_total - discount + shipping.
   * @param {number} itemTotal
   * @param {number} shippingVal
   * @param {number} discountVal
   * @param {string} currencyCode
   */
  function orderAmountWithDiscount(itemTotal, shippingVal, discountVal, currencyCode) {
    const cur = String(currencyCode || "AUD").trim() || "AUD";
    let itemCents = Math.round(Math.max(0, Number(itemTotal) || 0) * 100);
    let discountCents = Math.round(Math.max(0, Number(discountVal) || 0) * 100);
    const shipCents = Math.round(Math.max(0, Number(shippingVal) || 0) * 100);
    if (discountCents > itemCents) {
      discountCents = itemCents;
    }
    let totalCents = itemCents - discountCents + shipCents;
    if (totalCents < 0) {
      totalCents = 0;
    }
    const itemStr = (itemCents / 100).toFixed(2);
    const shipStr = (shipCents / 100).toFixed(2);
    const totalStr = (totalCents / 100).toFixed(2);
    /** @type {{ currency_code: string, value: string, breakdown: Record<string, { currency_code: string, value: string }> }} */
    const amount = {
      currency_code: cur,
      value: totalStr,
      breakdown: {
        item_total: { currency_code: cur, value: itemStr },
        shipping: { currency_code: cur, value: shipStr },
      },
    };
    if (discountCents > 0) {
      amount.breakdown.discount = {
        currency_code: cur,
        value: (discountCents / 100).toFixed(2),
      };
    }
    return amount;
  }

  window.discountCodes = {
    normalizeCode,
    findCodeDefinition,
    evaluateDiscount,
    orderAmountWithDiscount,
  };
})();
