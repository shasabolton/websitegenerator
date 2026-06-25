/**
 * Shared ship-to / display-currency country map (ISO 3166-1 alpha-2).
 * Cart ship-to dropdown and display currency locale detection use this list.
 */
(function initShipCountries() {
  if (window.siteShipCountries) {
    return;
  }

  var OTHER_VALUE = "__OTHER__";

  var COUNTRY_TO_CURRENCY = {
    AU: "AUD",
    NZ: "NZD",
    US: "USD",
    GB: "GBP",
    CA: "CAD",
    JP: "JPY",
    SG: "SGD",
    HK: "HKD",
    CH: "CHF",
    SE: "SEK",
    NO: "NOK",
    DE: "EUR",
    FR: "EUR",
    IT: "EUR",
    ES: "EUR",
    NL: "EUR",
    IE: "EUR",
    AT: "EUR",
    BE: "EUR",
    PT: "EUR",
    FI: "EUR",
  };

  var COUNTRY_LABELS = {
    AU: "Australia",
    NZ: "New Zealand",
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    JP: "Japan",
    SG: "Singapore",
    HK: "Hong Kong",
    CH: "Switzerland",
    SE: "Sweden",
    NO: "Norway",
    DE: "Germany",
    FR: "France",
    IT: "Italy",
    ES: "Spain",
    NL: "Netherlands",
    IE: "Ireland",
    AT: "Austria",
    BE: "Belgium",
    PT: "Portugal",
    FI: "Finland",
  };

  var PAYPAL_OTHER_DEFAULT_COUNTRY = "US";

  function normalizeCountryCode(code) {
    return String(code || "")
      .trim()
      .toUpperCase();
  }

  function isListedCountryCode(code) {
    var cc = normalizeCountryCode(code);
    return cc.length === 2 && Object.prototype.hasOwnProperty.call(COUNTRY_TO_CURRENCY, cc);
  }

  function isOtherSelection(value) {
    return String(value || "").trim() === OTHER_VALUE;
  }

  function hasShipCountrySelected(value) {
    var v = String(value || "").trim();
    return isOtherSelection(v) || isListedCountryCode(v);
  }

  /** ISO code used for shipping rate lookup (AU/NZ zones or default international). */
  function getShippingRateCountryCode(value) {
    var v = String(value || "").trim();
    if (isListedCountryCode(v)) {
      return normalizeCountryCode(v);
    }
    if (isOtherSelection(v)) {
      return PAYPAL_OTHER_DEFAULT_COUNTRY;
    }
    return "";
  }

  /** Country pre-filled in PayPal createOrder shipping address. */
  function getPayPalShippingCountryCode(value) {
    var v = String(value || "").trim();
    if (isListedCountryCode(v)) {
      return normalizeCountryCode(v);
    }
    if (isOtherSelection(v)) {
      return PAYPAL_OTHER_DEFAULT_COUNTRY;
    }
    return "";
  }

  function getPayPalShippingPreference(value) {
    return isOtherSelection(value) ? "GET_FROM_FILE" : "SET_PROVIDED_ADDRESS";
  }

  function paypalCountryMatchesCart(cartSelection, paypalCountryCode) {
    var actual = normalizeCountryCode(paypalCountryCode);
    if (!actual) {
      return false;
    }
    var cartSel = String(cartSelection || "").trim();
    if (isOtherSelection(cartSel)) {
      return actual !== "AU" && actual !== "NZ";
    }
    if (isListedCountryCode(cartSel)) {
      return actual === normalizeCountryCode(cartSel);
    }
    return false;
  }

  function getCountriesForSelect() {
    var rows = [];
    var codes = Object.keys(COUNTRY_TO_CURRENCY);
    for (var i = 0; i < codes.length; i++) {
      var code = codes[i];
      rows.push({
        code: code,
        label: COUNTRY_LABELS[code] || code,
      });
    }
    rows.sort(function (a, b) {
      return a.label.localeCompare(b.label);
    });
    return rows;
  }

  function populateShipCountrySelect(selectEl, selectedValue) {
    if (!selectEl) {
      return;
    }
    var keep = String(selectedValue || "").trim();
    var html = [
      '<option value="" disabled' +
        (keep ? "" : " selected") +
        ' hidden>Select shipping country</option>',
      '<option value="' +
        OTHER_VALUE +
        '"' +
        (keep === OTHER_VALUE ? " selected" : "") +
        ">Other countries</option>",
    ];
    var countries = getCountriesForSelect();
    for (var i = 0; i < countries.length; i++) {
      var row = countries[i];
      html.push(
        '<option value="' +
          row.code +
          '"' +
          (keep === row.code ? " selected" : "") +
          ">" +
          row.label +
          "</option>",
      );
    }
    selectEl.innerHTML = html.join("");
  }

  function isValidStoredShipCountry(value) {
    var v = String(value || "").trim();
    return hasShipCountrySelected(v);
  }

  window.siteShipCountries = {
    OTHER_VALUE: OTHER_VALUE,
    COUNTRY_TO_CURRENCY: COUNTRY_TO_CURRENCY,
    COUNTRY_LABELS: COUNTRY_LABELS,
    PAYPAL_OTHER_DEFAULT_COUNTRY: PAYPAL_OTHER_DEFAULT_COUNTRY,
    isListedCountryCode: isListedCountryCode,
    isOtherSelection: isOtherSelection,
    hasShipCountrySelected: hasShipCountrySelected,
    getShippingRateCountryCode: getShippingRateCountryCode,
    getPayPalShippingCountryCode: getPayPalShippingCountryCode,
    getPayPalShippingPreference: getPayPalShippingPreference,
    paypalCountryMatchesCart: paypalCountryMatchesCart,
    getCountriesForSelect: getCountriesForSelect,
    populateShipCountrySelect: populateShipCountrySelect,
    isValidStoredShipCountry: isValidStoredShipCountry,
  };
})();
