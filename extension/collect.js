function collectPage(doc = document, loc = location) {
  const marketplace = marketplaceOf(loc.hostname || "");
  if (!marketplace) return { ok: false, error: "Откройте страницу Ozon или Wildberries." };

  const pageUrl = String(loc.href || "");
  const kind = pageKind(marketplace, pageUrl);
  const sellerName = kind === "seller" ? listingTitle(doc) : kind === "product" ? sellerLinkName(doc) : null;
  const categoryName = kind === "category" ? listingTitle(doc) || crumbTitle(doc) : kind === "product" ? crumbTitle(doc) : null;
  const seen = new Set();
  const items = [];

  if (kind === "product") {
    const main = mainProduct(doc, pageUrl, marketplace, sellerName, categoryName);
    if (main) {
      seen.add(main.url);
      items.push(main);
    }
    for (const anchor of anchorsIn(similarRoots(doc), marketplace)) {
      pushCard(items, seen, anchor, marketplace, "similar", null, null, pageUrl);
      if (items.length >= 500) break;
    }
  } else {
    for (const anchor of anchorsIn([doc.body].filter(Boolean), marketplace)) {
      pushCard(items, seen, anchor, marketplace, kind, sellerName, categoryName, pageUrl);
      if (items.length >= 500) break;
    }
  }

  return {
    ok: true,
    marketplace,
    kind,
    title: kind === "seller" ? sellerName : categoryName,
    page_url: pageUrl,
    items,
  };
}

function pushCard(items, seen, anchor, marketplace, kind, sellerName, categoryName, pageUrl) {
  const url = canonicalUrl(anchor.href);
  if (!url || seen.has(url)) return;
  const root = cardRoot(anchor, marketplace);
  const amounts = parsePrices(textOf(root));
  if (!amounts.length) return;
  const named = productName(root, anchor);
  if (!named) return;
  seen.add(url);
  const brand = named.brand;
  items.push({
    marketplace,
    kind,
    external_id: externalId(marketplace, url),
    name: named.name,
    brand,
    price: amounts[0],
    old_price: amounts.length > 1 ? amounts[amounts.length - 1] : null,
    currency: "RUB",
    url,
    seller_name: sellerInCard(root) || sellerName || null,
    category_name: categoryName || null,
    page_url: pageUrl,
    collected_at: new Date().toISOString(),
  });
}

function mainProduct(doc, pageUrl, marketplace, sellerName, categoryName) {
  const heading = doc.querySelector("main h1, [role='main'] h1, h1");
  if (!heading) return null;
  const zone = heading.closest("section") || heading.parentElement || heading;
  const cut = textOf(zone).split(/похож|рекоменд|смотрите также|с этим товар/i)[0];
  const amounts = parsePrices(cut);
  const name = clean(textOf(heading));
  if (!name || name.length < 3 || !amounts.length) return null;
  const url = canonicalUrl(pageUrl);
  return {
    marketplace,
    kind: "product",
    external_id: externalId(marketplace, url),
    name,
    brand: null,
    price: amounts[0],
    old_price: amounts.length > 1 ? amounts[amounts.length - 1] : null,
    currency: "RUB",
    url,
    seller_name: sellerName || null,
    category_name: categoryName || null,
    page_url: url,
    collected_at: new Date().toISOString(),
  };
}

function anchorsIn(roots, marketplace) {
  const found = [];
  for (const root of roots) {
    if (!root) continue;
    for (const anchor of root.querySelectorAll("a[href]")) {
      if (inChrome(anchor)) continue;
      if (!isProductUrl(marketplace, anchor.href)) continue;
      found.push(anchor);
    }
  }
  const best = new Map();
  for (const anchor of found) {
    const url = canonicalUrl(anchor.href);
    const prev = best.get(url);
    if (!prev || clean(textOf(anchor)).length > clean(textOf(prev)).length) best.set(url, anchor);
  }
  return [...best.values()];
}

function similarRoots(doc) {
  const roots = [];
  for (const el of doc.querySelectorAll("h2, h3, [data-widget]")) {
    const widget = el.getAttribute?.("data-widget") || "";
    const heading = el.matches?.("h2, h3") ? textOf(el) : "";
    const byHeading = /похож|рекоменд|смотрите также|с этим товар|покупают вместе|аналог/i.test(heading);
    if (!byHeading && !/similar|analog|recommend|skuShelf/i.test(widget)) continue;
    let root = el;
    if (byHeading) {
      const parent = el.parentElement;
      root = parent && parent !== doc.body && textOf(parent).length <= 8000 ? parent : el.nextElementSibling;
    }
    if (!root || root === doc.body || root === doc.documentElement || textOf(root).length > 12000) continue;
    roots.push(root);
  }
  return roots;
}

function cardRoot(anchor, marketplace) {
  let el = anchor;
  for (let depth = 0; depth < 8 && el.parentElement; depth += 1) {
    const parent = el.parentElement;
    if (parent === anchor.ownerDocument.body) return el;
    const urls = new Set();
    for (const link of parent.querySelectorAll("a[href]")) {
      if (isProductUrl(marketplace, link.href)) urls.add(canonicalUrl(link.href));
      if (urls.size > 1) return el;
    }
    if (textOf(parent).length > 900) return el;
    el = parent;
  }
  return el;
}

function productName(root, anchor) {
  const candidates = [
    anchor.getAttribute("aria-label") || "",
    root.querySelector("img[alt]")?.getAttribute("alt") || "",
    textOf(anchor),
    ...textOf(root).split("\n"),
  ];
  for (const candidate of candidates) {
    const name = clean(candidate).replace(/\d[\d\s\u00a0\u202f]{0,14}\s*₽/g, "").trim();
    if (name.length < 6 || /^(купить|в корзину|быстрый просмотр|реклама)$/i.test(name)) continue;
    const split = name.match(/^(.{2,40}?)\s+\/\s+(.+)$/);
    if (split) return { brand: clean(split[1]), name: clean(split[2]) };
    return { brand: null, name: name.slice(0, 250) };
  }
  return null;
}

function sellerInCard(root) {
  for (const link of root.querySelectorAll("a[href*='/seller/']")) {
    const name = clean(textOf(link));
    if (name.length > 1 && name.length < 80 && !isProductUrl("ozon", link.href) && !isProductUrl("wildberries", link.href)) return name;
  }
  return null;
}

function sellerLinkName(doc) {
  const main = doc.querySelector("main, [role='main']") || doc.body;
  if (!main) return null;
  for (const link of main.querySelectorAll("a[href*='/seller/']")) {
    const name = clean(textOf(link));
    if (name.length > 1 && name.length < 80) return name;
  }
  return null;
}

function listingTitle(doc) {
  const heading = clean(textOf(doc.querySelector("main h1, [role='main'] h1, h1")));
  return heading && heading.length <= 120 ? heading : null;
}

function crumbTitle(doc) {
  const scope = doc.querySelector("[data-widget='breadCrumbs'], nav[aria-label*='крош' i], .breadcrumbs");
  if (!scope) return null;
  const parts = [...scope.querySelectorAll("a")].map((link) => clean(textOf(link))).filter((part) => part.length > 1 && part.length < 80);
  return parts.at(-1) || null;
}

function marketplaceOf(hostname) {
  const host = String(hostname).replace(/^www\./, "").toLowerCase();
  if (host === "ozon.ru" || host.endsWith(".ozon.ru")) return "ozon";
  if (host === "wildberries.ru" || host.endsWith(".wildberries.ru")) return "wildberries";
  return null;
}

function pageKind(marketplace, href) {
  const path = new URL(href).pathname;
  if (/\/seller\//.test(path)) return "seller";
  if (marketplace === "ozon" && /\/product\//.test(path)) return "product";
  if (marketplace === "wildberries" && /\/catalog\/\d+\/detail\.aspx/.test(path)) return "product";
  return "category";
}

function isProductUrl(marketplace, href) {
  let url;
  try {
    url = new URL(href, "https://www.ozon.ru");
  } catch {
    return false;
  }
  if (marketplace === "ozon") return /\/product\/[^/]+-\d+\/?$/.test(url.pathname) || /\/product\/\d+\/?$/.test(url.pathname);
  return /\/catalog\/\d+\/detail\.aspx\/?$/.test(url.pathname);
}

function externalId(marketplace, href) {
  const path = new URL(href).pathname;
  if (marketplace === "wildberries") return path.match(/\/catalog\/(\d+)\//)?.[1] || path;
  return path.match(/-(\d+)\/?$/)?.[1] || path.match(/\/product\/(\d+)\/?$/)?.[1] || path;
}

function canonicalUrl(href) {
  const url = new URL(href, "https://www.ozon.ru");
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/\/$/, "");
  return url.toString();
}

function parsePrices(text) {
  const source = String(text);
  const found = [];
  const re = /(\d[\d\s\u00a0\u202f]{0,14})\s*₽/g;
  for (const match of source.matchAll(re)) {
    const before = source.slice(Math.max(0, match.index - 16), match.index);
    if (/доставк|логист|бонус/i.test(before)) continue;
    const value = Number(match[1].replace(/[^\d]/g, ""));
    if (value >= 10 && value <= 100_000_000) found.push(value);
  }
  return [...new Set(found)].sort((a, b) => a - b);
}

function inChrome(el) {
  return Boolean(el.closest("header, footer, nav, [role='navigation']"));
}

function textOf(el) {
  if (!el) return "";
  return el.innerText ?? el.textContent ?? "";
}

function clean(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

globalThis.collectPage = collectPage;
