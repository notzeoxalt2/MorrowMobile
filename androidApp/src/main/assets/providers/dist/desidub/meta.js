const BASE = "https://www.desidubanime.me";

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

function clean(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pack(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function imageUrl(value) {
  try {
    return new URL(value, BASE).href
      .replace(/^https:\/\/myanimelist\.net\/images\//i, "https://cdn.myanimelist.net/images/")
      .replace(/^https:\/\/www\.themoviedb\.org\/t\/p\//i, "https://image.tmdb.org/t/p/");
  } catch { return ""; }
}

exports.getMeta = async ({link, signal, providerContext}) => {
  const response = await getWithTransientRetry(providerContext, link, {signal, timeout:10000, forceDoh:true});
  const $ = providerContext.cheerio.load(String(response.data || ""));
  const heading = $("h1").first();
  const title = clean(heading.find("span").first().text() || heading.text() || $("meta[property='og:title']").attr("content") || "Anime");
  const image = imageUrl(
    $("img.anime-main-image").attr("src") ||
    $("img").filter((_, element) => /poster|cover|main-image/i.test($(element).attr("class") || "")).first().attr("src") ||
    $("meta[property='og:image']").attr("content") || "",
  );
  const synopsis = clean(
    $("[data-synopsis],[class*='synopsis'],[class*='description'],.entry-content").first().text() ||
    $("meta[property='og:description']").attr("content") || "",
  );
  const buttons = $("#seasonButtonsContainer button[data-season]").map((_, element) => ({
    id: Number($(element).attr("data-season") || 0),
    title: clean($(element).text()),
  })).get().filter((season) => season.id && season.title);
  if (!buttons.length) {
    const fallbackId = Number(
      String($("link[rel='shortlink']").attr("href") || "").match(/[?&]p=(\d+)/)?.[1] ||
      String(response.data || "").match(/postId:\s*["']?(\d+)/)?.[1] || 0,
    );
    if (fallbackId) buttons.push({id:fallbackId, title:"Episodes"});
  }
  const linkList = await Promise.all(buttons.map(async (season) => {
    let seasonImage = "";
    try {
      const seasonResponse = await providerContext.axios.get(`${BASE}/wp-json/wp/v2/anime/${season.id}?_embed`, {signal, timeout:3500, forceDoh:true});
      const data = typeof seasonResponse.data === "string" ? JSON.parse(seasonResponse.data) : seasonResponse.data || {};
      seasonImage = imageUrl(data?._embedded?.["wp:featuredmedia"]?.[0]?.source_url || "");
    } catch {}
    return {
      title: season.title,
      image: seasonImage,
      episodesLink: `desidub-season:${pack({id:season.id, page:link})}`,
    };
  }));
  return {
    title,
    image,
    synopsis,
    imdbId:"",
    type: /\bmovie\b/i.test($("body").text()) && linkList.length === 1 ? "movie" : "series",
    tags: $("a[href*='/genre/']").map((_, element) => $(element).text().trim()).get().filter(Boolean),
    cast:[],
    rating:"",
    linkList,
  };
};
