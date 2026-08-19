/**
 * Schema.org JSON-LD and head SEO metadata for generated pages.
 */

function escapeAttr(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateText(text, maxLen) {
  const s = String(text || "").trim();
  if (!s || s.length <= maxLen) {
    return s;
  }
  return `${s.slice(0, maxLen - 1).trim()}…`;
}

function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeTreeHref(raw) {
  if (window.homePage?.normalizeTreeHref) {
    return window.homePage.normalizeTreeHref(raw);
  }
  const trimmed = String(raw || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  return trimmed
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .join("/")
    .toLowerCase();
}

function resolvePublicHref(treeHref, homePageHref) {
  if (window.homePage?.resolvePublicHref) {
    return window.homePage.resolvePublicHref(treeHref, homePageHref);
  }
  return String(treeHref || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "") || ".";
}

function getSiteOrigin(shopData) {
  const raw = shopData?.websites?.primary;
  if (!raw || typeof raw !== "string") {
    return "";
  }
  try {
    return new URL(raw).origin;
  } catch {
    return "";
  }
}

function resolveAbsoluteUrl(siteOrigin, treeHref, homePageHref) {
  const publicHref = resolvePublicHref(treeHref, homePageHref);
  if (!siteOrigin) {
    return publicHref === "." ? "/" : `/${publicHref}`;
  }
  if (publicHref === ".") {
    return `${siteOrigin}/`;
  }
  return `${siteOrigin}/${publicHref}`;
}

function toAbsoluteAssetUrl(siteOrigin, assetPath) {
  const p = String(assetPath || "").trim();
  if (!p) {
    return "";
  }
  if (/^https?:\/\//i.test(p)) {
    return p;
  }
  if (!siteOrigin) {
    return p;
  }
  return `${siteOrigin}/${p.replace(/^\/+/, "")}`;
}

function compactObject(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function buildJsonLdScript(graph) {
  const nodes = graph.filter(Boolean);
  if (nodes.length === 0) {
    return "";
  }
  const payload =
    nodes.length === 1
      ? { "@context": "https://schema.org", ...nodes[0] }
      : { "@context": "https://schema.org", "@graph": nodes };
  return `<script type="application/ld+json">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>`;
}

function homeCrumb(shopData, homePageHref) {
  return {
    name: String(shopData?.shopName || "Home").trim() || "Home",
    path: homePageHref || "shop",
  };
}

function buildBreadcrumbList(crumbs, siteOrigin, homePageHref) {
  if (!Array.isArray(crumbs) || crumbs.length === 0) {
    return null;
  }
  return {
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) =>
      compactObject({
        "@type": "ListItem",
        position: index + 1,
        name: String(crumb.name || "").trim(),
        item: resolveAbsoluteUrl(siteOrigin, crumb.path, homePageHref),
      }),
    ),
  };
}

function prependHomeCrumbIfNeeded(segments, shopData, homePageHref) {
  const crumbs = [];
  const home = normalizeTreeHref(homePageHref);
  const firstPath = segments[0] ? normalizeTreeHref(segments[0].path) : "";
  if (firstPath && firstPath !== home) {
    crumbs.push(homeCrumb(shopData, homePageHref));
  }
  return crumbs.concat(segments);
}

const DEFAULT_RETURN_APPLICABLE_COUNTRIES = [
  "AU",
  "NZ",
  "US",
  "GB",
  "CA",
  "IE",
  "DE",
  "FR",
  "NL",
  "IT",
  "ES",
  "JP",
  "SG",
];

function resolveReturnPolicyPath(shopData) {
  const path = String(shopData?.returnPolicy?.path || "returns")
    .trim()
    .replace(/^\/+|\/+$/g, "");
  return path || "returns";
}

function resolveApplicableReturnCountries(shopData) {
  const raw = shopData?.returnPolicy?.applicableCountry;
  if (Array.isArray(raw) && raw.length) {
    return raw
      .map((code) => String(code || "").trim().toUpperCase())
      .filter((code) => /^[A-Z]{2}$/.test(code))
      .slice(0, 50);
  }
  return DEFAULT_RETURN_APPLICABLE_COUNTRIES.slice();
}

function buildMerchantReturnPolicy(shopData, siteOrigin, options = {}) {
  const daysRaw = parseInt(String(shopData?.returnPolicy?.merchantReturnDays ?? 30), 10);
  const merchantReturnDays = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 30;
  const returnPolicyCountry = String(shopData?.returnPolicy?.returnPolicyCountry || "AU")
    .trim()
    .toUpperCase();
  const applicableCountry = resolveApplicableReturnCountries(shopData);
  const policyUrl = resolveAbsoluteUrl(siteOrigin, resolveReturnPolicyPath(shopData), options.homePageHref);
  if (options.digital === true) {
    return compactObject({
      "@type": "MerchantReturnPolicy",
      applicableCountry,
      returnPolicyCategory: "https://schema.org/MerchantReturnNotPermitted",
      merchantReturnLink: policyUrl || undefined,
    });
  }
  return compactObject({
    "@type": "MerchantReturnPolicy",
    applicableCountry,
    returnPolicyCountry: /^[A-Z]{2}$/.test(returnPolicyCountry) ? returnPolicyCountry : "AU",
    returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow",
    merchantReturnDays,
    itemCondition: ["https://schema.org/NewCondition", "https://schema.org/UsedCondition"],
    returnMethod: "https://schema.org/ReturnByMail",
    returnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    refundType: ["https://schema.org/FullRefund", "https://schema.org/ExchangeRefund"],
    returnLabelSource: "https://schema.org/ReturnLabelCustomerResponsibility",
    customerRemorseReturnFees: "https://schema.org/ReturnFeesCustomerResponsibility",
    itemDefectReturnFees: "https://schema.org/FreeReturn",
    merchantReturnLink: policyUrl || undefined,
  });
}

function buildOrganization(shopData, siteOrigin, homePageHref = null) {
  const name = String(shopData?.shopName || "").trim();
  if (!name) {
    return null;
  }
  const orgId = siteOrigin ? `${siteOrigin}/#organization` : "#organization";
  const sameAs = [];
  for (const key of ["instagram", "facebook"]) {
    const url = shopData?.social?.[key]?.url;
    if (url) {
      sameAs.push(url);
    }
  }
  const etsy = shopData?.websites?.etsy;
  if (etsy) {
    sameAs.push(etsy);
  }
  const email = shopData?.contact?.email || undefined;
  const telephone = shopData?.contact?.phone || undefined;
  return compactObject({
    "@type": "Organization",
    "@id": orgId,
    name,
    url: siteOrigin ? `${siteOrigin}/` : undefined,
    logo: toAbsoluteAssetUrl(siteOrigin, shopData?.branding?.faviconPath),
    email,
    sameAs: sameAs.length ? sameAs : undefined,
    contactPoint:
      email || telephone
        ? compactObject({
            "@type": "ContactPoint",
            contactType: "customer service",
            email,
            telephone,
          })
        : undefined,
    hasMerchantReturnPolicy: buildMerchantReturnPolicy(shopData, siteOrigin, { homePageHref }),
  });
}

function buildWebSite(shopData, siteOrigin) {
  const name = String(shopData?.shopName || "").trim();
  if (!name || !siteOrigin) {
    return null;
  }
  const site = compactObject({
    "@type": "WebSite",
    "@id": `${siteOrigin}/#website`,
    name,
    url: `${siteOrigin}/`,
    publisher: { "@id": `${siteOrigin}/#organization` },
  });
  return site;
}

function buildWebPageNode({
  treePath,
  name,
  description,
  pageTitle,
  siteOrigin,
  homePageHref,
  pageType = "WebPage",
}) {
  const url = resolveAbsoluteUrl(siteOrigin, treePath, homePageHref);
  const pageId = `${url}#webpage`;
  return compactObject({
    "@type": pageType,
    "@id": pageId,
    url,
    name: String(name || pageTitle || "").trim() || undefined,
    description: description || undefined,
    isPartOf: siteOrigin ? { "@id": `${siteOrigin}/#website` } : undefined,
    publisher: siteOrigin ? { "@id": `${siteOrigin}/#organization` } : undefined,
  });
}

function resolveProductPrimaryVideoUrl(row) {
  const a = String(row?.VIDEO1 ?? row?.video01 ?? "").trim();
  if (a) {
    return a;
  }
  return String(row?.VIDEO_1 ?? "").trim();
}

function buildVideoObject(row, title, description, siteOrigin) {
  const parseYoutubeVideoId = window.generateProductBody?.parseYoutubeVideoId;
  if (typeof parseYoutubeVideoId !== "function") {
    return null;
  }
  const videoUrl = resolveProductPrimaryVideoUrl(row);
  const videoId = parseYoutubeVideoId(videoUrl);
  if (!videoId) {
    return null;
  }
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const embedUrl = `https://www.youtube.com/embed/${videoId}`;
  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const name = String(title || "").trim().slice(0, 200) || "Product video";
  const desc = truncateText(stripHtml(description || name), 5000);
  return compactObject({
    "@type": "VideoObject",
    name,
    description: desc,
    thumbnailUrl: [thumbnailUrl],
    embedUrl,
    url: watchUrl,
  });
}

function buildProductNode(row, catalog, shopData, siteOrigin, homePageHref, categoryName) {
  const getSlug = window.productData?.getProductSlugForRow;
  const collectImages = window.productData?.collectProductImageUrls;
  if (typeof getSlug !== "function" || typeof collectImages !== "function") {
    return null;
  }
  const resolveTitle = window.productData?.resolveProductDisplayTitle;
  const title =
    typeof resolveTitle === "function"
      ? resolveTitle(row)
      : String(row.TITLE || "Untitled Product").trim() || "Untitled Product";
  const slug = getSlug(row, catalog);
  const treePath = `shop/${slug}`;
  const url = resolveAbsoluteUrl(siteOrigin, treePath, homePageHref);
  const images = collectImages(row)
    .map((imageUrl) => toAbsoluteAssetUrl(siteOrigin, imageUrl))
    .filter(Boolean);
  const description = truncateText(stripHtml(String(row.DESCRIPTION || "").trim()), 5000);
  const priceNum = parseFloat(String(row.PRICE ?? "").trim());
  const currency = String(row.CURRENCY_CODE || "AUD")
    .trim()
    .toUpperCase();
  // Google merchant listings: sku must not contain whitespace.
  const sku = String(row.SKU || "")
    .trim()
    .replace(/\s+/g, "-");
  const product = compactObject({
    "@type": "Product",
    "@id": `${url}#product`,
    name: title,
    description: description || undefined,
    image: images.length ? images : undefined,
    sku: sku || undefined,
    url,
    category: categoryName || String(row.CATEGORY || "").trim() || undefined,
    brand: compactObject({
      "@type": "Brand",
      name: String(shopData?.shopName || "").trim() || undefined,
    }),
  });
  if (Number.isFinite(priceNum) && priceNum >= 0 && /^[A-Z]{3}$/.test(currency)) {
    product.offers = compactObject({
      "@type": "Offer",
      url,
      priceCurrency: currency,
      price: priceNum.toFixed(2),
      availability: "https://schema.org/InStock",
      seller: siteOrigin ? { "@id": `${siteOrigin}/#organization` } : undefined,
      hasMerchantReturnPolicy: buildMerchantReturnPolicy(shopData, siteOrigin, {
        homePageHref,
        digital: row?.DIGITAL === true,
      }),
    });
  }
  return product;
}

function buildItemListFromProducts(products, catalog, siteOrigin, homePageHref) {
  const getSlug = window.productData?.getProductSlugForRow;
  if (typeof getSlug !== "function" || !Array.isArray(products) || products.length === 0) {
    return null;
  }
  const elements = products
    .map((row, index) => {
      const slug = getSlug(row, catalog);
      const resolveTitle = window.productData?.resolveProductDisplayTitle;
      const name =
        typeof resolveTitle === "function"
          ? resolveTitle(row, "")
          : String(row.TITLE || "").trim();
      if (!slug || !name) {
        return null;
      }
      return compactObject({
        "@type": "ListItem",
        position: index + 1,
        name,
        url: resolveAbsoluteUrl(siteOrigin, `shop/${slug}`, homePageHref),
      });
    })
    .filter(Boolean);
  if (elements.length === 0) {
    return null;
  }
  return {
    "@type": "ItemList",
    itemListElement: elements,
  };
}

function buildFaqPageNode(pageData, siteOrigin, homePageHref) {
  const meta = pageData?.meta && typeof pageData.meta === "object" ? pageData.meta : {};
  const faqs = Array.isArray(meta.faqs) ? meta.faqs : [];
  const slug = String(pageData?.slug || "").trim();
  if (!slug || faqs.length === 0) {
    return null;
  }
  const treePath = `blog/${slug}`;
  const url = resolveAbsoluteUrl(siteOrigin, treePath, homePageHref);
  const mainEntity = faqs
    .map((item) => {
      const question = String(item?.question || "").trim();
      const answer = String(item?.answer || "").trim();
      if (!question || !answer) {
        return null;
      }
      return {
        "@type": "Question",
        name: question,
        acceptedAnswer: {
          "@type": "Answer",
          text: answer,
        },
      };
    })
    .filter(Boolean);
  if (mainEntity.length === 0) {
    return null;
  }
  return compactObject({
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    url: `${url}#faq`,
    mainEntity,
  });
}

function buildBlogPostingNode(pageData, siteOrigin, homePageHref) {
  const meta = pageData?.meta && typeof pageData.meta === "object" ? pageData.meta : {};
  const slug = String(pageData?.slug || "").trim();
  if (!slug) {
    return null;
  }
  const treePath = `blog/${slug}`;
  const url = resolveAbsoluteUrl(siteOrigin, treePath, homePageHref);
  const headline = String(meta.title || slug).trim() || slug;
  const description = String(meta.description || "").trim();
  const datePublished = String(meta.date || "").trim();
  const author = String(meta.author || "").trim();
  const cover =
    typeof window.generateContentBody?.deriveCoverFromPageData === "function"
      ? window.generateContentBody.deriveCoverFromPageData(pageData)
      : "";
  return compactObject({
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline,
    description: description || undefined,
    datePublished: datePublished || undefined,
    dateModified: datePublished || undefined,
    author: author ? { "@type": "Person", name: author } : undefined,
    image: cover ? toAbsoluteAssetUrl(siteOrigin, cover) : undefined,
    url,
    mainEntityOfPage: { "@id": `${url}#webpage` },
    publisher: siteOrigin ? { "@id": `${siteOrigin}/#organization` } : undefined,
  });
}

function buildBlogIndexNode(posts, shopData, siteOrigin, homePageHref) {
  const blogConfig = shopData?.blog && typeof shopData.blog === "object" ? shopData.blog : {};
  const name = String(blogConfig.title || "Blog").trim() || "Blog";
  const description = String(blogConfig.description || "").trim();
  const url = resolveAbsoluteUrl(siteOrigin, "blog", homePageHref);
  const blog = compactObject({
    "@type": "Blog",
    "@id": `${url}#blog`,
    name,
    description: description || undefined,
    url,
    publisher: siteOrigin ? { "@id": `${siteOrigin}/#organization` } : undefined,
  });
  if (!Array.isArray(posts) || posts.length === 0) {
    return blog;
  }
  blog.blogPost = posts.map((post) => {
    const slug = String(post?.slug || "").trim();
    const postUrl = resolveAbsoluteUrl(siteOrigin, `blog/${slug}`, homePageHref);
    return compactObject({
      "@type": "BlogPosting",
      headline: String(post?.title || slug).trim() || slug,
      url: postUrl,
      datePublished: String(post?.date || "").trim() || undefined,
      description: String(post?.excerpt || "").trim() || undefined,
    });
  });
  return blog;
}

function buildHeadSeoTags({
  pageTitle,
  metaDescription,
  treePath,
  shopData,
  homePageHref,
  ogType,
  ogImage,
  robotsNoindex = false,
}) {
  const siteOrigin = getSiteOrigin(shopData);
  const canonicalUrl = treePath ? resolveAbsoluteUrl(siteOrigin, treePath, homePageHref) : "";
  const description = truncateText(metaDescription || "", 160);
  const title = String(pageTitle || "").trim();
  const image = ogImage ? toAbsoluteAssetUrl(siteOrigin, ogImage) : toAbsoluteAssetUrl(siteOrigin, shopData?.branding?.faviconPath);
  const bits = [];

  if (robotsNoindex) {
    bits.push('<meta name="robots" content="noindex" />');
  }

  if (description) {
    bits.push(`<meta name="description" content="${escapeAttr(description)}" />`);
  }
  if (canonicalUrl && siteOrigin) {
    bits.push(`<link rel="canonical" href="${escapeAttr(canonicalUrl)}" />`);
  }
  if (title) {
    bits.push(`<meta property="og:title" content="${escapeAttr(title)}" />`);
    bits.push(`<meta name="twitter:title" content="${escapeAttr(title)}" />`);
  }
  if (description) {
    bits.push(`<meta property="og:description" content="${escapeAttr(description)}" />`);
    bits.push(`<meta name="twitter:description" content="${escapeAttr(description)}" />`);
  }
  if (canonicalUrl && siteOrigin) {
    bits.push(`<meta property="og:url" content="${escapeAttr(canonicalUrl)}" />`);
  }
  if (ogType) {
    bits.push(`<meta property="og:type" content="${escapeAttr(ogType)}" />`);
  }
  if (image) {
    bits.push(`<meta property="og:image" content="${escapeAttr(image)}" />`);
    bits.push(`<meta name="twitter:image" content="${escapeAttr(image)}" />`);
  }
  bits.push(`<meta name="twitter:card" content="summary_large_image" />`);
  if (shopData?.shopName) {
    bits.push(`<meta property="og:site_name" content="${escapeAttr(shopData.shopName)}" />`);
  }

  return bits.join("\n    ");
}

/**
 * @param {{
 *   treePath: string,
 *   shopData: object,
 *   homePageHref?: string | null,
 *   pageTitle: string,
 *   seoContext?: object,
 * }} input
 */
function buildForPage(input) {
  const { treePath, shopData, homePageHref = null, pageTitle, seoContext = {} } = input;
  const siteOrigin = getSiteOrigin(shopData);
  const path = normalizeTreeHref(treePath);
  const metaDescription = String(seoContext.metaDescription || "").trim();
  const graph = [];

  if (seoContext.isNotFoundPage) {
    return {
      headSeoHtml: buildHeadSeoTags({
        pageTitle,
        metaDescription: metaDescription || "The requested page could not be found.",
        treePath: null,
        shopData,
        homePageHref,
        ogType: "website",
        ogImage: "",
        robotsNoindex: true,
      }),
      structuredDataHtml: "",
    };
  }

  graph.push(buildOrganization(shopData, siteOrigin, homePageHref));
  graph.push(buildWebSite(shopData, siteOrigin));

  const webpageType = "WebPage";
  let ogType = "website";
  let ogImage = seoContext.ogImage || "";

  if (path === "cart") {
    const crumbs = prependHomeCrumbIfNeeded([{ name: "Cart", path: "cart" }], shopData, homePageHref);
    graph.push(
      buildWebPageNode({
        treePath: "cart",
        name: "Shopping Cart",
        description: metaDescription,
        pageTitle,
        siteOrigin,
        homePageHref,
      }),
    );
    graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
  } else if (path === "shop") {
    const crumbs = prependHomeCrumbIfNeeded([{ name: "Shop", path: "shop" }], shopData, homePageHref);
    const shopUrl = resolveAbsoluteUrl(siteOrigin, "shop", homePageHref);
    graph.push(
      compactObject({
        ...buildWebPageNode({
          treePath: "shop",
          name: "Shop",
          description: metaDescription,
          pageTitle,
          siteOrigin,
          homePageHref,
          pageType: "CollectionPage",
        }),
        about: siteOrigin ? { "@id": `${siteOrigin}/#organization` } : undefined,
      }),
    );
    graph.push(
      compactObject({
        "@type": "Store",
        "@id": `${shopUrl}#store`,
        name: String(shopData?.shopName || "Shop").trim() || "Shop",
        url: shopUrl,
        image: toAbsoluteAssetUrl(siteOrigin, shopData?.branding?.faviconPath) || undefined,
        parentOrganization: siteOrigin ? { "@id": `${siteOrigin}/#organization` } : undefined,
      }),
    );
    graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
    const productRows = Array.isArray(seoContext.products) ? seoContext.products : [];
    if (productRows.length > 0) {
      graph.push(
        buildItemListFromProducts(
          productRows,
          seoContext.catalogProducts || productRows,
          siteOrigin,
          homePageHref,
        ),
      );
    }
  } else if (path.startsWith("shop/")) {
    const segment = path.slice("shop/".length);
    if (seoContext.productRow) {
      const row = seoContext.productRow;
      const categoryName = String(seoContext.categoryName || row.CATEGORY || "").trim();
      const categorySlug = slugify(categoryName);
      const resolveTitle = window.productData?.resolveProductDisplayTitle;
      const title =
        typeof resolveTitle === "function"
          ? resolveTitle(row, "Product")
          : String(row.TITLE || "Product").trim();
      const crumbs = prependHomeCrumbIfNeeded(
        [
          { name: "Shop", path: "shop" },
          { name: categoryName, path: `shop/${categorySlug}` },
          { name: title, path: `shop/${segment}` },
        ],
        shopData,
        homePageHref,
      );
      const description = truncateText(stripHtml(String(row.DESCRIPTION || "").trim()), 5000);
      const pageUrl = resolveAbsoluteUrl(siteOrigin, path, homePageHref);
      graph.push(
        compactObject({
          ...buildWebPageNode({
            treePath: path,
            name: title,
            description: metaDescription || description,
            pageTitle,
            siteOrigin,
            homePageHref,
          }),
          mainEntity: { "@id": `${pageUrl}#product` },
        }),
      );
      graph.push(buildProductNode(row, seoContext.catalogProducts || [], shopData, siteOrigin, homePageHref, categoryName));
      graph.push(buildVideoObject(row, title, description, siteOrigin));
      graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
      ogType = "product";
      const collectImages = window.productData?.collectProductImageUrls;
      if (typeof collectImages === "function") {
        const images = collectImages(row);
        if (images[0]) {
          ogImage = images[0];
        }
      }
    } else if (seoContext.categoryName) {
      const categoryName = String(seoContext.categoryName).trim();
      const crumbs = prependHomeCrumbIfNeeded(
        [
          { name: "Shop", path: "shop" },
          { name: categoryName, path: `shop/${segment}` },
        ],
        shopData,
        homePageHref,
      );
      graph.push(
        buildWebPageNode({
          treePath: path,
          name: categoryName,
          description: metaDescription,
          pageTitle,
          siteOrigin,
          homePageHref,
          pageType: "CollectionPage",
        }),
      );
      graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
      if (Array.isArray(seoContext.categoryProductRows) && seoContext.categoryProductRows.length > 0) {
        graph.push(
          buildItemListFromProducts(
            seoContext.categoryProductRows,
            seoContext.catalogProducts || seoContext.categoryProductRows,
            siteOrigin,
            homePageHref,
          ),
        );
      }
    }
  } else if (path === "blog") {
    const blogConfig = shopData?.blog && typeof shopData.blog === "object" ? shopData.blog : {};
    const blogTitle = String(blogConfig.title || "Blog").trim() || "Blog";
    const crumbs = prependHomeCrumbIfNeeded([{ name: blogTitle, path: "blog" }], shopData, homePageHref);
    graph.push(
      buildWebPageNode({
        treePath: "blog",
        name: blogTitle,
        description: metaDescription,
        pageTitle,
        siteOrigin,
        homePageHref,
        pageType: "CollectionPage",
      }),
    );
    graph.push(buildBlogIndexNode(seoContext.blogPosts, shopData, siteOrigin, homePageHref));
    graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
  } else if (path.startsWith("blog/")) {
    const pageData = seoContext.pageData;
    const meta = pageData?.meta && typeof pageData.meta === "object" ? pageData.meta : {};
    const headline = String(meta.title || pageData?.slug || "").trim();
    const crumbs = prependHomeCrumbIfNeeded(
      [
        { name: String(shopData?.blog?.title || "Blog").trim() || "Blog", path: "blog" },
        { name: headline, path },
      ],
      shopData,
      homePageHref,
    );
    const postUrl = resolveAbsoluteUrl(siteOrigin, path, homePageHref);
    graph.push(
      compactObject({
        ...buildWebPageNode({
          treePath: path,
          name: headline,
          description: metaDescription,
          pageTitle,
          siteOrigin,
          homePageHref,
        }),
        mainEntity: { "@id": `${postUrl}#article` },
      }),
    );
    graph.push(buildBlogPostingNode(pageData, siteOrigin, homePageHref));
    const faqNode = buildFaqPageNode(pageData, siteOrigin, homePageHref);
    if (faqNode) {
      graph.push(faqNode);
    }
    graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
    ogType = "article";
    if (typeof window.generateContentBody?.deriveCoverFromPageData === "function") {
      ogImage = window.generateContentBody.deriveCoverFromPageData(pageData) || ogImage;
    }
  } else {
    const pageData = seoContext.pageData;
    const meta = pageData?.meta && typeof pageData.meta === "object" ? pageData.meta : {};
    const pageName = String(meta.title || pageData?.slug || path).trim() || path;
    const pageType = path === "about" ? "AboutPage" : webpageType;
    const crumbs = prependHomeCrumbIfNeeded([{ name: pageName, path }], shopData, homePageHref);
    graph.push(
      buildWebPageNode({
        treePath: path,
        name: pageName,
        description: metaDescription,
        pageTitle,
        siteOrigin,
        homePageHref,
        pageType,
      }),
    );
    graph.push(buildBreadcrumbList(crumbs, siteOrigin, homePageHref));
    if (typeof window.generateContentBody?.deriveCoverFromPageData === "function" && pageData) {
      ogImage = window.generateContentBody.deriveCoverFromPageData(pageData) || ogImage;
    }
  }

  return {
    headSeoHtml: buildHeadSeoTags({
      pageTitle,
      metaDescription,
      treePath: path,
      shopData,
      homePageHref,
      ogType,
      ogImage,
    }),
    structuredDataHtml: buildJsonLdScript(graph),
  };
}

window.structuredData = {
  buildForPage,
  stripHtml,
  truncateText,
  getSiteOrigin,
  resolveAbsoluteUrl,
  buildJsonLdScript,
};
