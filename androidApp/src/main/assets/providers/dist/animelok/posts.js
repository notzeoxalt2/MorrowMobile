const BASE = "https://animelok.net";

function absoluteUrl(value) {
  if (!String(value || "").trim()) return "";
  try {
    return new URL(value, BASE).href;
  } catch {
    return "";
  }
}

function artworkUrl(value) {
  const resolved = absoluteUrl(value);
  if (!resolved) return "";

  try {
    const url = new URL(resolved);
    if (url.hostname.toLowerCase() !== "wsrv.nl") return resolved;

    // AnimeLok currently wraps part of its artwork through wsrv.nl. That
    // endpoint rejects desktop requests even though the original CDN image is
    // healthy, so retain the exact provider image while removing the wrapper.
    return absoluteUrl(url.searchParams.get("url")) || resolved;
  } catch {
    return resolved;
  }
}

function canonicalTitleLink(value) {
  const resolved = absoluteUrl(value);
  if (!resolved) return "";

  try {
    const url = new URL(resolved);
    const watchMatch = url.pathname.match(/^\/watch\/([^/]+)\/?$/i);
    if (watchMatch) return `${BASE}/anime/${watchMatch[1]}`;

    const animeMatch = url.pathname.match(/^\/anime\/([^/]+)\/?$/i);
    if (animeMatch) return `${BASE}/anime/${animeMatch[1]}`;
  } catch {
    return "";
  }

  return "";
}

function parse(html, context) {
  const $ = context.cheerio.load(html);
  const seen = new Set();
  const posts = [];

  $('a[href*="/anime/"],a[href*="/watch/"]').each((_, element) => {
    const anchor = $(element);
    const link = canonicalTitleLink(anchor.attr("href"));
    if (!link || seen.has(link)) return;

    const imageElement = anchor.find("img").first();
    const title = (
      imageElement.attr("alt")
      || anchor.find("h2,h3,h4").first().text()
      || anchor.text()
    ).replace(/\s+/g, " ").trim();
    const image = artworkUrl(
      imageElement.attr("data-src")
      || imageElement.attr("data-lazy-src")
      || imageElement.attr("data-original")
      || imageElement.attr("src")
      || "",
    );

    if (!title || !image || image.startsWith("data:")) return;
    seen.add(link);
    posts.push({title, link, image});
  });

  return posts;
}

function listingUrl(filter, page) {
  const url = new URL(filter || "/home", BASE);
  if (page > 1) url.searchParams.set("page", String(page));
  return url.href;
}

exports.getPosts = async ({filter, page, signal, providerContext}) => {
  const response = await providerContext.axios.get(listingUrl(filter, page), {
    signal,
    timeout: 12000,
  });
  return parse(String(response.data || ""), providerContext);
};

exports.getSearchPosts = async ({searchQuery, page, signal, providerContext}) => {
  const url = new URL("/search", BASE);
  url.searchParams.set("keyword", String(searchQuery || ""));
  if (page > 1) url.searchParams.set("page", String(page));
  const response = await providerContext.axios.get(url.href, {signal, timeout: 12000});
  return parse(String(response.data || ""), providerContext);
};
