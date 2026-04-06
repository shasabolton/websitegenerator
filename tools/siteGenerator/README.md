# Site generator

Browser-only HTML generator for the shop UI. There is no Node build step: scripts run in the page, load JSON and HTML templates with `fetch()`, stitch strings together, and output **complete HTML documents**.

This README is for maintainers and for AI agents working in this folder.

## Entry points

| File | Role |
|------|------|
| `index.html` | **Hub:** file tree picker when opened with no `path` query. **Preview:** when opened with `?path=…` (same origin), `script.js` loads the generator stack and replaces the document with generated HTML. |

Open these from a **local HTTP server** with the **repository root** as the site root (e.g. VS Code / Cursor Live Server on the repo folder). `file://` is unreliable because `fetch()` and base URLs behave differently.

## End-to-end preview flow

1. User opens `index.html` (no query) → `script.js` calls `displayFileTree.initPreviewPicker()`, which loads `shared-assets/config/fileTree.json` and product data, then renders links.
2. Links point at `index.html?path=shop` or `index.html?path=shop%2F<category-slug>` (tree `href` values; see `previewTarget.buildPreviewUrl` / `displayFileTree.buildPreviewUrl`).
3. With `path` set, `script.js` loads `generateHeaderAndFooter.js`, `generateAnyPage.js`, `generateShopBody.js`, and `generateCategoryBody.js`, then calls `generateAnyPage.previewAnyPage(path)`.
4. `generateAnyPage.generateAnyPage()` loads shared config and `allPages.html`, calls `generateShopBody` or `generateCategoryBody` for main markup, merges header/footer via `generateHeaderAndFooter`, then:
   - `document.open(); document.write(html); document.close();`
   - The browser document is now the **generated** page; the URL is still `.../index.html?path=...`.

So preview is “generate a string of HTML, then swap the document.” No iframe.

## Core pipeline: `generateAnyPage.js`

**`generateAnyPage.js`** owns the shared pipeline for every generated page type.

1. Parallel fetch: `shopData.json`, `navigation.json`, page shell `templates/pages/allPages.html`, **`setBase.js`** (source to inline), and products via `window.productData.fetchProductDataJson()`.
2. Route on tree `path`: call **`generateShopBody.generateShopBody(ctx)`** or **`generateCategoryBody.generateCategoryBody(ctx)`** with `ctx = { shopData, navigationConfig, products }` (category also gets `categoryName`).
3. Each body generator returns `{ bodyHtml, categoryNames, pageTitle }`:
   - **`bodyHtml`** — main column only (inside `<main>`).
   - **`categoryNames`** — used to expand the Shop dropdown in the nav (`generateHeaderAndFooter`).
   - **`pageTitle`** — full `<title>` text (already escaped where needed).
4. `generateHeaderAndFooter.generateHeaderAndFooter(...)` builds header/footer partials.
5. Merge everything into `allPages.html` with `generateAnyPage.applyTemplate()` using tokens (see [Templates](#templates)).

**Adding a new page type:** add a module that exports **`generateFooBody(ctx)`** returning that shape, extend `generateAnyPage.generateAnyPage()` routing (and URL `path` conventions), ensure `script.js` loads the new script after `generateAnyPage.js`, and add picker links in `displayFileTree` if it should appear in the preview UI. Use **`window.generateAnyPage.fetchText`** for partial templates.

## Templates and tokens

- **Page shell:** `templates/pages/allPages.html` — shared wrapper for every generated page: literal `<base href="/">`, synchronous inlined `setBase.js`, then `__PAGE_TITLE__`, assets, `__HEADER__`, `__BODY_CONTENT__`, `__FOOTER__`. Preview and future download use the **same** HTML string from `generateAnyPage.generateAnyPage()` (or the same merge steps).
- **Partials:** `templates/partials/*.html` — header, footer, `categoryPreview` (shop band + thumb row), `categoryPage` (full category body), `productThumb`, `productThumbRow`.
- **Substitution:** `__TOKEN_NAME__` (double underscores, no spaces). Implemented in `applyTemplate()` in `generateAnyPage.js`, `generateHeaderAndFooter.js`, `generateShopBody.js`, and `generateCategoryBody.js`. Replacements use a **function** callback so values that contain `$` (e.g. inlined `setBase.js` with `` `${...}` ``) are not corrupted by `String.prototype.replace`.

**Do not use `{{...}}` in templates.** GitHub Pages runs **Jekyll** by default; that syntax is Liquid and will strip or alter placeholders before the browser runs the generator. The repo root includes **`.nojekyll`** so Pages serves HTML as static files without Jekyll processing.

Escaped vs raw: user-visible strings from data should go through `escapeHtml()` before insertion; trusted HTML fragments (built markup) are passed through without double-escaping.

## Script dependencies

Load order matters.

**`index.html` (hub, no `?path=`):**

```
productData.js
previewTarget.js             (URL helpers + preview error UI)
displayFileTree.js           (needs productData + previewTarget)
script.js
```

**`index.html` (preview, with `?path=`):** `script.js` loads, then injects in order:

```
generateHeaderAndFooter.js
generateAnyPage.js           (shared pipeline + path routing)
generateShopBody.js          (generateShopBody)
generateCategoryBody.js      (generateCategoryBody)
```

## Fetch paths (generator runtime)

While developing, the active document is under `tools/siteGenerator/`, so generator code uses paths such as:

- `./templates/...` — templates next to the tool
- `../../shared-assets/config/...` — config at repo root

Those URLs are resolved against the **current page URL**, not against the `<base>` of generated output. Generated HTML is a different document with its own base rules.

## URL protocol for generated HTML (important)

Generated pages are meant to work when the **whole repo** is served from one origin (local server or GitHub Pages) so that:

- `shared-assets/...` resolves to files at the repo root.
- `tools/siteGenerator/templates/css/site.css` resolves to this folder’s stylesheet.

**Internal links and assets in generated HTML must not use a leading `/`** (e.g. use `shop/my-category`, not `/shop/my-category`). Reasons:

1. On GitHub **project** Pages, a path like `/shop` is wrong (it targets the host root, not `/<repo>/shop`).
2. Resolution is tied to `<base>` (see below).

**External** links (`https://...`, `mailto:`) are unchanged.

## `<base>` and `setBase.js`

`allPages.html` emits, in order: `charset`, `viewport`, a **literal** `<base href="/" data-site-base>`, then an **inline synchronous** `<script>` with the contents of **`setBase.js`**, then `<title>` and `<link>` tags. The static base gives a safe default (custom domain / local); the script runs **before** those links are parsed.

On load, that script:

1. Finds the existing `<base data-site-base>` (or creates one if missing).
2. Detects `*.github.io` (GitHub Pages).
3. If so, sets `href` to `/<first-path-segment>/` so project sites like `https://user.github.io/websitegenerator/...` resolve `shop/...` under the repo name. The repo slug is hard-coded as `GITHUB_PAGES_REPO` in `setBase.js` (keep in sync with the real GitHub repo name, or generalize).
4. Otherwise leaves base as `/` (already set in markup).

It also shows an **`alert`** (temporary debugging aid); remove or gate when stable.

All relative `href`/`src` in that document (that do not start with `/`) resolve against the active `<base>` after the script runs.

## Configuration sources

| Data | Location |
|------|----------|
| Shop name, favicon path, social URLs, contact | `shared-assets/config/shopData.json` |
| Main nav structure | `shared-assets/config/navigation.json` |
| File tree shape for preview picker | `shared-assets/config/fileTree.json` |
| Product rows + columns | `shared-assets/config/productData.json` (loaded by `productData.js`) |

`generateHeaderAndFooter` maps `navigation.json` plus category names into nav HTML. Shop’s `href` should stay **base-relative** (e.g. `shop`), not `#anchors` or `/leading-slash` paths, unless you intend different behavior.

## Key modules (quick map)

| Module | Responsibility |
|--------|------------------|
| `generateAnyPage.js` | Shared fetches, `allPages.html` merge, inline `setBase.js`, path → body generators + full HTML. |
| `generateShopBody.js` | `generateShopBody`: shop landing main column from product data. |
| `generateCategoryBody.js` | `generateCategoryBody`: single category main column (requires `categoryName` on `ctx`). |
| `generateHeaderAndFooter.js` | Header/footer partials; `buildSiteCssPath()`, `buildFaviconPath()`, nav HTML, `buildShopCategoryHref()` → `shop/<slug>`. |
| `previewTarget.js` | `parsePreviewTarget` (`path` query), `buildPreviewUrl`, `showPreviewBootError`. |
| `displayFileTree.js` | Preview picker UI, file tree merge with categories. |
| `script.js` | Hub vs preview: `initPreviewPicker` or dynamic generator load + `generateAnyPage.previewAnyPage`. |
| `productData.js` (in `editData/`) | Fetch/parse product JSON; category helpers for shop and file tree. |
| `setBase.js` | Runtime base URL; **inlined** into output (not loaded as separate file in production HTML). |

## Styling

- Generated pages link to **`tools/siteGenerator/templates/css/site.css`** and the favicon using **base-relative** paths (`shared-assets/…`, `tools/siteGenerator/…`). `allPages.html` sets literal `<base href="/">` and runs inlined `setBase.js` **before** those `<link>` / `<img>` tags so resolution uses the correct root (including `/websitegenerator/` on GitHub Pages).
- The picker UI on `index.html` uses **inline** styles in that file, not `site.css`.

## Operational notes

- **Caching:** fetches use `{ cache: "no-store" }` during development.
- **Export:** If you later copy only a `site/` subtree to hosting, you must either copy `shared-assets` and the CSS (or change paths) so generated URLs still resolve; the generator currently assumes monorepo-style URLs from repo root.
- **Favicon 404:** `shopData.json` points at `shared-assets/images/branding/favicon.jpg`. If that file is missing from the repo, the link will 404 everywhere (GitHub and local). Add the image or change `faviconPath` (base-relative or `https://…`).
