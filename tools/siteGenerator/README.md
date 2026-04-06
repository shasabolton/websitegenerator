# Site generator

Browser-only HTML generator for the shop UI. There is no Node build step: scripts run in the page, load JSON and HTML templates with `fetch()`, stitch strings together, and output **complete HTML documents**.

This README is for maintainers and for AI agents working in this folder.

## Entry points

| File | Role |
|------|------|
| `index.html` | Lists preview targets (file tree UI). Loads `previewTarget.js` + `displayFileTree.js` only (no page generators). |
| `preview.html` | Loads shared pipeline + `previewBoot.js`, which loads **either** `generateShop.js` **or** `generateCategory.js` from the URL, then **replaces itself** with generated HTML (see below). |

Open these from a **local HTTP server** with the **repository root** as the site root (e.g. VS Code / Cursor Live Server on the repo folder). `file://` is unreliable because `fetch()` and base URLs behave differently.

## End-to-end preview flow

1. User opens `index.html` → `script.js` calls `displayFileTree.initPreviewPicker()`, which loads `shared-assets/config/fileTree.json` and product data, then renders links.
2. Links point at `preview.html?page=shop` or `preview.html?page=category&category=...` (see `previewTarget.buildPreviewUrl` / `displayFileTree.buildPreviewUrl`).
3. `preview.html` loads shared scripts, then `previewBoot.js` loads **only** the generator for that URL (`generateShop.js` or `generateCategory.js`), then `displayFileTree.js`, then runs `displayFileTree.runPreviewPage()`.
4. `runPreviewPage()` reads query params (`previewTarget.parsePreviewTarget`), calls either `generateShop.generateShopHtml()` or `generateCategory.generateCategoryHtml(name)`, then:
   - `document.open(); document.write(html); document.close();`
   - The browser document is now the **generated** page; the URL is still `.../preview.html?...`.

So preview is “generate a string of HTML, then swap the document.” No iframe.

## Core pipeline: `generatePage`

**`generatePage.js`** owns the shared pipeline for every generated page type.

1. Parallel fetch: `shopData.json`, `navigation.json`, page shell `templates/pages/allPages.html`, and **`setBase.js`** (source to inline).
2. Load products via `window.productData.fetchProductDataJson()` (`tools/editData/productData.js`).
3. Call the caller’s **`buildBody`** function with `{ shopData, navigationConfig, products }`.
4. `buildBody` must return `{ bodyHtml, categoryNames, pageTitle }`:
   - **`bodyHtml`** — main column only (inside `<main>`).
   - **`categoryNames`** — used to expand the Shop dropdown in the nav (`generateHeaderAndFooter`).
   - **`pageTitle`** — full `<title>` text (already escaped where needed).
5. `generateHeaderAndFooter.generateHeaderAndFooter(...)` builds header/footer partials.
6. Merge everything into `allPages.html` with `applyTemplate()` using tokens (see [Templates](#templates)).

**Adding a new page type:** add a module (e.g. `generateFoo.js`) that calls `window.generatePage.generatePage({ buildBody })`, extend `previewTarget.parsePreviewTarget` / URL conventions as needed, load it from `previewBoot.js` for the right query shape, and add a branch in `displayFileTree.runPreviewPage()` (and picker links) if it should appear in the preview UI.

## Templates and tokens

- **Page shell:** `templates/pages/allPages.html` — shared wrapper for every generated page: literal `<base href="/">`, synchronous inlined `setBase.js`, then `__PAGE_TITLE__`, assets, `__HEADER__`, `__BODY_CONTENT__`, `__FOOTER__`. Preview and future download use the **same** HTML string from `generatePage()`.
- **Partials:** `templates/partials/*.html` — header, footer, `categoryPreview` (shop band + thumb row), `categoryPage` (full category body), `productThumb`, `productThumbRow`.
- **Substitution:** `__TOKEN_NAME__` (double underscores, no spaces). Implemented in `applyTemplate()` in `generatePage.js`, `generateHeaderAndFooter.js`, `generateShop.js`, and `generateCategory.js`. Replacements use a **function** callback so values that contain `$` (e.g. inlined `setBase.js` with `` `${...}` ``) are not corrupted by `String.prototype.replace`.

**Do not use `{{...}}` in templates.** GitHub Pages runs **Jekyll** by default; that syntax is Liquid and will strip or alter placeholders before the browser runs the generator. The repo root includes **`.nojekyll`** so Pages serves HTML as static files without Jekyll processing.

Escaped vs raw: user-visible strings from data should go through `escapeHtml()` before insertion; trusted HTML fragments (built markup) are passed through without double-escaping.

## Script dependencies

Load order matters.

**`index.html` (picker only):**

```
productData.js
previewTarget.js             (URL helpers + preview error UI)
displayFileTree.js           (needs productData + previewTarget)
script.js
```

**`preview.html` (generate one page type):**

```
generateHeaderAndFooter.js
productData.js
generatePage.js
previewTarget.js
previewBoot.js               → dynamically loads ONE OF:
  generateShop.js            (shop preview)
  generateCategory.js        (category preview)
then displayFileTree.js      (for runPreviewPage only)
```

`generateShop.js` / `generateCategory.js` are **not** loaded together on the same document.

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
| `generatePage.js` | Shared page pipeline, template merge, inline `setBase.js`. |
| `generateShop.js` | Shop landing: category preview sections from product data. |
| `generateCategory.js` | Single category page: breadcrumbs, heading, product grid. |
| `generateHeaderAndFooter.js` | Header/footer partials; `buildSiteCssPath()`, `buildFaviconPath()`, nav HTML, `buildShopCategoryHref()` → `shop/<slug>`. |
| `previewTarget.js` | `parsePreviewTarget`, `buildPreviewUrl`, `showPreviewBootError`. |
| `previewBoot.js` | Preview entry: loads exactly one page generator, then `displayFileTree` + `runPreviewPage`. |
| `displayFileTree.js` | Preview picker UI, file tree merge with categories, `runPreviewPage`. |
| `productData.js` (in `editData/`) | Fetch/parse product JSON; category helpers for shop and file tree. |
| `setBase.js` | Runtime base URL; **inlined** into output (not loaded as separate file in production HTML). |

## Styling

- Generated pages link to **`tools/siteGenerator/templates/css/site.css`** and the favicon using **base-relative** paths (`shared-assets/…`, `tools/siteGenerator/…`). `allPages.html` sets literal `<base href="/">` and runs inlined `setBase.js` **before** those `<link>` / `<img>` tags so resolution uses the correct root (including `/websitegenerator/` on GitHub Pages).
- The picker UI on `index.html` uses **inline** styles in that file, not `site.css`.

## Operational notes

- **Caching:** fetches use `{ cache: "no-store" }` during development.
- **Export:** If you later copy only a `site/` subtree to hosting, you must either copy `shared-assets` and the CSS (or change paths) so generated URLs still resolve; the generator currently assumes monorepo-style URLs from repo root.
- **Favicon 404:** `shopData.json` points at `shared-assets/images/branding/favicon.jpg`. If that file is missing from the repo, the link will 404 everywhere (GitHub and local). Add the image or change `faviconPath` (base-relative or `https://…`).
