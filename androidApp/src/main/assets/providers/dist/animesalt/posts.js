const BASE = "https://animesalt.link";

function absoluteUrl(value) {
  if (!String(value || "").trim()) return "";
  try {
    const url = new URL(value, BASE);
    if (url.hostname === "animesalt.ac") url.hostname = "animesalt.link";
    return url.href;
  } catch {
    return "";
  }
}

function parse(html, context) {
  const $ = context.cheerio.load(html);
  const seen = new Set();
  const posts = [];
  $('a[href*="/series/"],a[href*="/movies/"]').each((_, element) => {
    const anchor = $(element);
    const link = absoluteUrl(anchor.attr("href"));
    if (!link || seen.has(link)) return;
    const scope = anchor.closest("article,.post,.chart-item,li").length
      ? anchor.closest("article,.post,.chart-item,li")
      : anchor.parent().parent();
    const imageElement = anchor.find("img").first().length
      ? anchor.find("img").first()
      : scope.find("img").first();
    const rawImage = imageElement.attr("data-src")
      || imageElement.attr("data-lazy-src")
      || imageElement.attr("src")
      || "";
    const title = (
      imageElement.attr("alt")
      || scope.find("h2,h3,h4,.entry-title,.chart-title,.title").first().text()
      || anchor.text()
    ).replace(/^Image\s+/i, "").replace(/\s+/g, " ").trim();
    const image = absoluteUrl(rawImage.startsWith("//") ? `https:${rawImage}` : rawImage);
    if (!title || !image || image.startsWith("data:")) return;
    seen.add(link);
    posts.push({title, link, image});
  });
  return posts;
}

exports.getPosts = async ({filter, page, signal, providerContext}) => {
  const url = new URL(filter || "/", BASE);
  if (page > 1) {
    url.pathname = `${url.pathname.replace(/\/+$/, "")}/page/${page}/`;
  }
  const response = await providerContext.axios.get(url.href, {
    signal,
    timeout: 15000,
  });
  return parse(String(response.data || ""), providerContext);
};

exports.getSearchPosts = async ({searchQuery, page, signal, providerContext}) => {
  const suffix = page > 1 ? `page/${page}/` : "";
  const response = await providerContext.axios.get(
    `${BASE}/search/${encodeURIComponent(searchQuery)}/${suffix}`,
    {signal, timeout: 15000},
  );
  return parse(String(response.data || ""), providerContext);
};
