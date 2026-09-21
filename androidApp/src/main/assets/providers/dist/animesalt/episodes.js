const BASE = "https://animesalt.link";

function unpack(value) {
  const raw = String(value)
    .replace(/^animesalt:/, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const bytes = Uint8Array.from(
    atob(raw + "=".repeat((4 - raw.length % 4) % 4)),
    (character) => character.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes));
}

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

function episodeParts(url) {
  const match = String(url).match(/-(\d+)x(\d+)\/?$/);
  return {
    season: Number(match?.[1] || 1),
    episode: Number(match?.[2] || 1),
  };
}

exports.getEpisodes = async ({url, providerContext}) => {
  const data = unpack(url);
  const titleLink = canonicalUrl(data.link);
  let html;
  if (data.post) {
    const response = await providerContext.axios.get(
      `${BASE}/wp-admin/admin-ajax.php?action=action_select_season&season=${data.season}&post=${data.post}`,
      {timeout: 15000, headers: {Referer: titleLink}},
    );
    html = String(response.data || "");
  } else {
    const response = await providerContext.axios.get(titleLink, {
      timeout: 15000,
      headers: {Referer: `${BASE}/`},
    });
    html = String(response.data || "");
  }

  const $ = providerContext.cheerio.load(html);
  const seen = new Set();
  const episodes = [];
  $('a[href*="/episode/"]').each((_, element) => {
    const anchor = $(element);
    const link = canonicalUrl(anchor.attr("href"));
    if (!link || seen.has(link)) return;
    const parts = episodeParts(link);
    if (parts.season !== Number(data.season)) return;
    seen.add(link);
    // AnimeSalt keeps the clickable overlay empty; the real title and
    // thumbnail are siblings inside the surrounding episode article.
    const scope = anchor.closest("article").length
      ? anchor.closest("article")
      : anchor.closest("li");
    const imageElement = scope.find(".post-thumbnail img,img").first();
    const rawImage = imageElement.attr("data-src")
      || imageElement.attr("data-lazy-src")
      || imageElement.attr("src")
      || "";
    const publishedTitle = scope.find(".entry-title,h2,h3").first().text().replace(/\s+/g, " ").trim();
    episodes.push({
      title: publishedTitle
        ? `Episode ${parts.episode} · ${publishedTitle}`
        : `Episode ${parts.episode}`,
      link,
      image: canonicalUrl(rawImage.startsWith("//") ? `https:${rawImage}` : rawImage),
      number: parts.episode,
    });
  });
  return episodes.sort((left, right) => left.number - right.number);
};
