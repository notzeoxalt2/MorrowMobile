const BASE = "https://www.desidubanime.me";
let homeCache = {savedAt: 0, html: ""};

function isTransientRequestError(error) {
  const status = Number(error?.response?.status || 0);
  if (status >= 400 && status < 500 && ![408, 425, 429].includes(status)) return false;
  const message = String(error?.message || error || "");
  return !status || status >= 500 || [408, 425, 429].includes(status) || /abort|timeout|network|fetch|econn|etimedout/i.test(message);
}

async function getWithTransientRetry(providerContext, url, options = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await providerContext.axios.get(url, options);
    } catch (error) {
      if (attempt > 0 || options.signal?.aborted || !isTransientRequestError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}

function absolute(href) {
  try { return new URL(href, BASE).href; }
  catch { return ""; }
}

function cleanImage(value) {
  const url = absolute(value);
  return url
    .replace(/^https:\/\/myanimelist\.net\/images\//i, "https://cdn.myanimelist.net/images/")
    .replace(/^https:\/\/www\.themoviedb\.org\/t\/p\//i, "https://image.tmdb.org/t/p/");
}

function detailLink(container, $) {
  const direct = container.find('a[href*="/anime/"]').first().attr("href");
  if (direct) return absolute(direct);
  const onclick = container.find('button[onclick*="/anime/"]').first().attr("onclick") || "";
  return absolute(onclick.match(/https?:\/\/[^'"\s]+\/anime\/[^'"\s]+/i)?.[0] || "");
}

function parseScope(scope, $) {
  const out = [];
  const seen = new Set();
  const add = (container, directAnchor) => {
    const anchor = directAnchor || container.find('a[href*="/anime/"]').first();
    const href = directAnchor ? absolute(anchor.attr("href")) : detailLink(container, $);
    if (!href || seen.has(href)) return;
    const heading = container.find("h2,h3,h4").first();
    const imageNode = container.find(".image-spotlight img,.image-featured img,img").first();
    const title = (
      heading.find("span").first().text() ||
      heading.text() ||
      anchor.attr("aria-label")?.replace(/^Watch\s+/i, "") ||
      anchor.attr("title") ||
      imageNode.attr("alt") ||
      anchor.text()
    ).replace(/\s+/g, " ").trim();
    const image = cleanImage(imageNode.attr("data-src") || imageNode.attr("src") || imageNode.attr("data-lazy-src") || "");
    if (!title || !image) return;
    seen.add(href);
    out.push({title, link:href, image});
  };
  scope.find("article,li,.swiper-slide").each((_, element) => {
    const container = $(element);
    add(container, null);
  });
  scope.find('a[href*="/anime/"]').each((_, element) => {
    const anchor = $(element);
    add(anchor, anchor);
  });
  return out;
}

function parse(html, filter, providerContext) {
  const $ = providerContext.cheerio.load(String(html || ""));
  if (String(filter || "").startsWith("home:")) {
    const heading = String(filter).slice(5).trim().toLowerCase();
    if (heading === "spotlight") {
      const slides = $(".image-spotlight").closest(".swiper-slide");
      return parseScope(slides.parent(), $);
    }
    const node = $("h2").filter((_, element) => $(element).text().replace(/\s+/g, " ").trim().toLowerCase() === heading).first();
    if (!node.length) return [];
    return parseScope(node.closest("section"), $);
  }
  return parseScope($.root(), $);
}

async function home(providerContext, signal) {
  if (homeCache.html && Date.now() - homeCache.savedAt < 60000) return homeCache.html;
  const response = await getWithTransientRetry(providerContext, `${BASE}/`, {signal, timeout:10000, forceDoh:true});
  homeCache = {savedAt:Date.now(), html:String(response.data || "")};
  return homeCache.html;
}

exports.getPosts = async ({filter, page, signal, providerContext}) => {
  if (String(filter || "").startsWith("home:")) {
    if (page > 1) return [];
    return parse(await home(providerContext, signal), filter, providerContext);
  }
  const path = filter || "/";
  const join = path.includes("?") ? "&" : "?";
  const response = await getWithTransientRetry(providerContext, `${BASE}${path}${page > 1 ? `${join}page=${page}` : ""}`, {signal, timeout:10000, forceDoh:true});
  return parse(response.data, filter, providerContext);
};

exports.getSearchPosts = async ({searchQuery, page, signal, providerContext}) => {
  if (page > 1) return [];
  const endpoint = `${BASE}/wp-json/kiranime/v1/anime/search?query=${encodeURIComponent(searchQuery)}`;
  const response = await getWithTransientRetry(providerContext, endpoint, {signal, timeout:10000, forceDoh:true});
  const payload = typeof response.data === "string" ? JSON.parse(response.data) : response.data || {};
  return parse(payload.result || "", "", providerContext);
};
