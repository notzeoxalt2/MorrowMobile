const BASE = "https://animesalt.link";

function canonicalUrl(value) {
  if (!String(value || "").trim()) return "";
  try {
    const url = new URL(value, BASE);
    if (url.hostname === "animesalt.ac") url.hostname = "animesalt.link";
    return url.href;
  } catch {
    return String(value || "");
  }
}

function pack(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

exports.getMeta = async ({link, providerContext}) => {
  const canonicalLink = canonicalUrl(link);
  const response = await providerContext.axios.get(canonicalLink, {
    timeout: 15000,
    headers: {Referer: `${BASE}/`},
  });
  const $ = providerContext.cheerio.load(String(response.data || ""));
  const title = (
    $("h1").first().text()
    || $('meta[property="og:title"]').attr("content")
    || "Anime"
  ).replace(/\s+/g, " ").trim();
  const rawImage = (
    $(".series-poster img,.movie-poster img,.wp-post-image").first().attr("data-src")
    || $(".series-poster img,.movie-poster img,.wp-post-image").first().attr("src")
    || $('img[alt^="Image "]').first().attr("data-src")
    || $('img[alt^="Image "]').first().attr("src")
    || $('meta[property="og:image"]').attr("content")
    || ""
  );
  const image = canonicalUrl(rawImage.startsWith("//") ? `https:${rawImage}` : rawImage)
    .replace(/\/t\/p\/w(?:185|342)\//i, "/t/p/w500/");
  const synopsis = (
    $(".series-description,.movie-description,.synopsis,.entry-content p").first().text()
    || $('meta[property="og:description"]').attr("content")
    || ""
  ).replace(/\s+/g, " ").trim();
  const isMovie = /\/movies\//i.test(canonicalLink);
  const linkList = [];

  if (isMovie) {
    // AnimeSalt movies expose their real players directly on the movie page.
    // Treat that page as one movie release; it is not an empty TV season.
    linkList.push({
      title: "Movie",
      directLinks: [{title: "Play movie", link: canonicalLink, type: "movie"}],
    });
  } else {
    $(".season-btn[data-season][data-post]").each((_, element) => {
      const season = Number($(element).attr("data-season"));
      const post = $(element).attr("data-post");
      const label = $(element).text().replace(/\s+/g, " ").trim();
      if (!season || !post) return;
      linkList.push({
        title: label || `Season ${season}`,
        episodesLink: `animesalt:${pack({link: canonicalLink, season, post})}`,
        // AnimeSalt's buttons are provider episode buckets (for example One
        // Piece 1-61, 62-110), not canonical sequel-season identities.
        navigationKind: "provider-range",
      });
    });
    if (!linkList.length) {
      linkList.push({
        title: "Episodes",
        episodesLink: `animesalt:${pack({link: canonicalLink, season: 1})}`,
        navigationKind: "provider-range",
      });
    }
  }

  return {
    title,
    image,
    synopsis,
    imdbId: "",
    type: isMovie ? "movie" : "series",
    tags: $('a[href*="/genre/"],a[href*="/category/genre/"]')
      .map((_, element) => $(element).text().trim())
      .get()
      .filter(Boolean),
    cast: [],
    rating: "",
    linkList,
  };
};
