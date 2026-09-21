"use strict";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const joinUrl = (base, path) => new URL(String(path || ""), `${String(base || "").replace(/\/+$/, "")}/`).href;

const requestText = async (url, signal) => {
  const response = await fetch(url, {signal});
  if (!response.ok) {
    const error = new Error(`MoviezWap returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response.text();
};

const parsePosts = (html, cheerio) => {
  const $ = cheerio.load(String(html || ""));
  const catalog = [];
  const seen = new Set();
  const listingAnchors = $(".mylist")
    .filter((_, element) => $(element).find("img[src*='arroww']").length > 0)
    .find('a[href^="/movie/"]');
  const anchors = listingAnchors.length
    ? listingAnchors
    : $('a[href^="/movie/"]');
  anchors.each((_, element) => {
    const title = clean($(element).text());
    const link = clean($(element).attr("href"));
    if (!title || !link || seen.has(link)) return;
    seen.add(link);
    catalog.push({title, link, image: ""});
  });
  return catalog;
};

const searchStopWords = new Set([
  "free", "download", "full", "movie", "movies", "format", "laptop",
  "android", "mobile", "tablet", "tab", "for", "pc", "hd", "episodes", "episode", "season", "hdrip",
  "esub", "esubs", "mp4", "mkv", "quality", "video", "audio", "dubbed",
]);
const searchTokens = (value) => String(value || "")
  .normalize("NFKD")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .split(/\s+/)
  .filter((token) => token.length > 1 && !searchStopWords.has(token));

const titleFromMovieUrl = (value) => {
  try {
    const url = new URL(value);
    const slug = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() || "")
      .replace(/\.html?$/i, "")
      .replace(/[-_]+/g, " ");
    return clean(slug);
  } catch {
    return "";
  }
};

const catalogPathForPage = (filter, page = 1) => {
  const path = String(filter || "").trim();
  const pageNumber = Math.max(1, Number(page) || 1);
  if (pageNumber === 1) return path;
  return `${path.replace(/\.html?$/i, "").replace(/\/+$/, "")}/${pageNumber}.html`;
};

const searchSitemap = async ({baseUrl, searchQuery, page, signal, cheerio}) => {
  const xml = await requestText(joinUrl(baseUrl, "/sitemap.xml"), signal);
  const $ = cheerio.load(xml, {xmlMode: true});
  const queryTokens = searchTokens(searchQuery);
  if (!queryTokens.length) return [];
  const seen = new Set();
  const matches = [];

  $("loc").each((_, element) => {
    const absolute = clean($(element).text());
    if (!/\/movie\//i.test(absolute)) return;
    let pathname = "";
    try { pathname = new URL(absolute).pathname; } catch { return; }
    if (seen.has(pathname)) return;
    const title = titleFromMovieUrl(absolute);
    const haystack = new Set(searchTokens(title));
    if (!queryTokens.every((token) => haystack.has(token))) return;
    seen.add(pathname);
    matches.push({title, link: pathname, image: ""});
  });

  const pageSize = 50;
  const start = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * pageSize);
  return matches.slice(start, start + pageSize);
};

const getPosts = async ({filter, page = 1, signal, providerContext}) => {
  const {getBaseUrl, cheerio} = providerContext;
  const baseUrl = await getBaseUrl("moviezwap");
  try {
    return parsePosts(
      await requestText(joinUrl(baseUrl, catalogPathForPage(filter, page)), signal),
      cheerio,
    );
  } catch (error) {
    console.error("MoviezWap catalog error", error);
    return [];
  }
};

const getSearchPosts = async ({searchQuery, page = 1, signal, providerContext}) => {
  const {getBaseUrl, cheerio} = providerContext;
  const baseUrl = await getBaseUrl("moviezwap");
  const searchUrl = joinUrl(baseUrl, `/search.php?q=${encodeURIComponent(String(searchQuery || "").trim())}`);
  try {
    const results = parsePosts(await requestText(searchUrl, signal), cheerio);
    if (results.length) return results;
  } catch (error) {
    if (![403, 429, 503].includes(Number(error?.status))) {
      console.error("MoviezWap search error", error);
    }
  }

  try {
    return await searchSitemap({baseUrl, searchQuery, page, signal, cheerio});
  } catch (error) {
    console.error("MoviezWap sitemap search error", error);
    return [];
  }
};

exports.catalogPathForPage = catalogPathForPage;
exports.getPosts = getPosts;
exports.getSearchPosts = getSearchPosts;
