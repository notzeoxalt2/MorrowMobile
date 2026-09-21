const BASE = "https://anidb.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

const HOME_TITLES = {
  "fan-favorites": "Fan Favorites",
  "trending-now": "Trending Now",
  "latest-updates": "Latest Updates",
  "currently-airing": "Currently Airing",
  "most-popular": "Most Popular",
  "top-movie": "Top Movie",
  "top-music": "Top Music",
  "top-ona": "Top ONA",
  "top-ova": "Top OVA",
  "top-special": "Top Special",
  "top-tv": "Top TV",
};

const HOME_CACHE_MS = 60 * 1000;
let homeCache = {html: "", expiresAt: 0, pending: null};

function requestHeaders(referer = `${BASE}/`) {
  return {
    Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    Referer: referer,
    Origin: BASE,
    "User-Agent": USER_AGENT,
  };
}

async function chromiumRequest(url, signal, providerContext) {
  const bridge = providerContext.chromiumRequest || providerContext.chromiumFetch;
  if (typeof bridge !== "function") return null;
  const response = await bridge({
    provider: "anidb",
    url,
    method: "GET",
    headers: requestHeaders(),
    responseType: "text",
    signal,
  });
  if (!response?.ok) {
    const error = new Error(`AniDB Chromium request failed: ${response?.status || "unknown"}`);
    error.status = Number(response?.status || 0);
    throw error;
  }
  return {data: response.data || "", status: response.status || 200, headers: response.headers || {}};
}

async function get(url, signal, providerContext) {
  const browserResponse = await chromiumRequest(url, signal, providerContext);
  if (browserResponse) return browserResponse;
  return providerContext.axios.get(url, {
    signal,
    timeout: 12000,
    responseType: "text",
    headers: requestHeaders(),
  });
}

function waitForShared(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new DOMException("The operation was aborted", "AbortError"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new DOMException("The operation was aborted", "AbortError"));
    signal.addEventListener("abort", onAbort, {once: true});
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

async function sharedHomeHtml(signal, providerContext) {
  const now = Date.now();
  if (homeCache.html && homeCache.expiresAt > now) return homeCache.html;
  if (!homeCache.pending) {
    // KANDO asks for every catalog shelf concurrently. AniDB serves all of
    // them in the same /home document, so one hidden-Chromium request is both
    // faster and more faithful than serializing eleven identical WAF calls.
    // Shelf cancellation stops waiting without cancelling the shared work for
    // the remaining shelves.
    homeCache.pending = get(`${BASE}/home`, undefined, providerContext)
      .then((response) => {
        const html = String(response?.data || "");
        if (!html) throw new Error("AniDB returned an empty home page");
        homeCache.html = html;
        homeCache.expiresAt = Date.now() + HOME_CACHE_MS;
        return html;
      })
      .finally(() => { homeCache.pending = null; });
  }
  return waitForShared(homeCache.pending, signal);
}

function text(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function absolute(value, base = BASE) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return new URL(raw, base).href; } catch { return ""; }
}

function numericId(link) {
  return Number(String(link || "").match(/-(\d+)(?:[/?#]|$)/)?.[1] || 0);
}

function cardFromAnchor($, anchor, pageUrl) {
  const item = $(anchor);
  const href = absolute(item.attr("href"), pageUrl);
  if (!numericId(href)) return null;
  const title = text(
    item.attr("title") ||
    item.find("[data-title], h2, h3, h4, [class*='line-clamp']").first().text() ||
    item.find("img").first().attr("alt"),
  );
  const imageNode = item.find("img").first();
  const image = absolute(
    imageNode.attr("data-src") || imageNode.attr("data-lazy-src") || imageNode.attr("src"),
    pageUrl,
  );
  if (!title || !href) return null;
  return {title, link: href, image: /\/img\/placeholder\.svg(?:\?|$)/i.test(image) ? "" : image};
}

function uniqueCards($, roots, pageUrl) {
  const posts = [];
  const seen = new Set();
  for (const root of roots) {
    $(root).find("a[href*='/anime/']").addBack("a[href*='/anime/']").each((_, anchor) => {
      const post = cardFromAnchor($, anchor, pageUrl);
      if (!post || seen.has(post.link)) return;
      seen.add(post.link);
      posts.push(post);
    });
  }
  return posts;
}

function homeSectionPosts(html, desiredTitle, providerContext) {
  const $ = providerContext.cheerio.load(String(html || ""));
  const normalized = text(desiredTitle).toLowerCase();
  const heading = $("h1,h2,h3,h4").filter((_, element) => text($(element).text()).toLowerCase() === normalized).first();
  if (!heading.length) return [];

  const candidates = [];
  let node = heading;
  for (let depth = 0; depth < 7 && node.length; depth += 1) {
    const anchors = node.find("a[href*='/anime/']").length;
    if (anchors > 0) candidates.push({node, anchors});
    node = node.parent();
  }
  const closest = candidates.sort((a, b) => a.anchors - b.anchors)[0]?.node;
  if (closest?.length) return uniqueCards($, [closest], `${BASE}/home`);

  const sibling = heading.parent().next();
  return uniqueCards($, sibling.length ? [sibling] : [], `${BASE}/home`);
}

function browsePosts(html, pageUrl, providerContext) {
  const $ = providerContext.cheerio.load(String(html || ""));
  const main = $("main").first();
  return uniqueCards($, [main.length ? main : $.root()], pageUrl);
}

async function fetchPosts({filter, page = 1, signal, providerContext}) {
  if (String(filter || "").startsWith("HOME:")) {
    if (Number(page) > 1) return [];
    const key = String(filter).slice(5);
    const title = HOME_TITLES[key];
    if (!title) return [];
    const html = await sharedHomeHtml(signal, providerContext);
    return homeSectionPosts(html, title, providerContext);
  }

  const rawPath = String(filter || "PATH:/browse").replace(/^PATH:/, "");
  const url = new URL(rawPath || "/browse", BASE);
  if (Number(page) > 1) url.searchParams.set("page", String(page));
  const response = await get(url.href, signal, providerContext);
  return browsePosts(response.data, url.href, providerContext);
}

exports.getPosts = async ({filter, page, signal, providerContext}) =>
  fetchPosts({filter, page, signal, providerContext});

exports.getHomePosts = async ({catalogs, signal, providerContext}) => {
  const html = await sharedHomeHtml(signal, providerContext);
  const result = {};
  for (const catalog of catalogs || []) {
    const filter = String(catalog?.filter || "");
    if (!filter.startsWith("HOME:")) continue;
    const title = HOME_TITLES[filter.slice(5)];
    result[filter] = title
      ? homeSectionPosts(html, title, providerContext)
      : [];
  }
  return result;
};

exports.getSearchPosts = async ({searchQuery, page = 1, signal, providerContext}) => {
  const query = text(searchQuery);
  if (!query) return [];
  if (Number(page) === 1) {
    const suggestionsUrl = `${BASE}/search/suggestions?q=${encodeURIComponent(query)}`;
    const response = await get(suggestionsUrl, signal, providerContext);
    const suggestions = browsePosts(response.data, suggestionsUrl, providerContext);
    if (suggestions.length) return suggestions;
  }
  const url = new URL("/browse", BASE);
  url.searchParams.set("q", query);
  if (Number(page) > 1) url.searchParams.set("page", String(page));
  const response = await get(url.href, signal, providerContext);
  return browsePosts(response.data, url.href, providerContext);
};
