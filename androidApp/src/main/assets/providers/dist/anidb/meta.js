const BASE = "https://anidb.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

function headers(referer = `${BASE}/`) {
  return {Accept: "text/html,application/xhtml+xml,*/*;q=0.8", Referer: referer, Origin: BASE, "User-Agent": USER_AGENT};
}
async function chromiumRequest(url, providerContext) {
  const bridge = providerContext.chromiumRequest || providerContext.chromiumFetch;
  if (typeof bridge !== "function") return null;
  const response = await bridge({provider: "anidb", url, method: "GET", headers: headers(), responseType: "text"});
  if (!response?.ok) {
    const error = new Error(`AniDB Chromium request failed: ${response?.status || "unknown"}`);
    error.status = Number(response?.status || 0);
    throw error;
  }
  return {data: response.data || ""};
}
async function get(url, providerContext) {
  const browserResponse = await chromiumRequest(url, providerContext);
  if (browserResponse) return browserResponse;
  return providerContext.axios.get(url, {timeout: 12000, responseType: "text", headers: headers()});
}

function clean(value) {
  return String(value || "").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function absolute(value, base) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try { return new URL(raw, base || BASE).href; } catch { return ""; }
}
function providerId(value) {
  const id = Number(String(value || "").match(/-(\d+)(?:[/?#]|$)/)?.[1] || 0);
  if (!id) throw new Error("Invalid AniDB title link");
  return id;
}
function isPlaceholder(value) { return !value || /\/img\/placeholder\.svg(?:\?|$)/i.test(value); }

function jsonLd($) {
  const rows = [];
  $("script[type='application/ld+json']").each((_, element) => {
    try {
      const value = JSON.parse($(element).text());
      rows.push(...(Array.isArray(value) ? value : [value]));
    } catch {}
  });
  return rows.find((item) => /^(?:TVSeries|Movie|VideoObject)$/i.test(String(item?.["@type"] || ""))) || {};
}

function expectedEpisodes(html, $) {
  const visible = clean($("[x-text*='episodes']").first().text());
  const match = `${visible} ${String(html || "")}`.match(/(?:^|\D)(\d{1,5})\s+episodes?\b/i);
  return Number(match?.[1] || 0);
}

function explicitSeasons($, currentId, pageUrl, currentImage) {
  const heading = $("h2,h3,h4").filter((_, element) => clean($(element).text()).toLowerCase() === "seasons").first();
  if (!heading.length) return [];
  let container = heading.closest("[class*='bg-card']");
  if (!container.length) container = heading.parent().parent();
  const seasons = [];
  const seen = new Set();
  container.find("a[href*='/anime/']").each((index, element) => {
    const anchor = $(element);
    const link = absolute(anchor.attr("href"), pageUrl);
    let id;
    try { id = providerId(link); } catch { return; }
    if (seen.has(id)) return;
    seen.add(id);
    const name = clean(anchor.attr("title") || anchor.find("p").first().text() || anchor.find("img").attr("alt"));
    if (!name) return;
    const badgeNumber = anchor.find("span").map((_, span) => clean($(span).text())).get()
      .map((value) => Number(value)).find((value) => Number.isFinite(value) && value > 0 && value < 100);
    let image = absolute(anchor.find("img").first().attr("data-src") || anchor.find("img").first().attr("src"), pageUrl);
    if (isPlaceholder(image)) image = id === currentId ? currentImage : "";
    seasons.push({
      title: `Season ${badgeNumber || index + 1}${name ? ` · ${name}` : ""}`,
      image,
      episodesLink: `anidb:${id}?title=${encodeURIComponent(name)}&page=${encodeURIComponent(link)}`,
      selected: id === currentId,
    });
  });
  return seasons;
}

exports.getMeta = async ({link, providerContext}) => {
  const id = providerId(link);
  const pageUrl = absolute(link, BASE);
  const response = await get(pageUrl, providerContext);
  const html = String(response.data || "");
  const $ = providerContext.cheerio.load(html);
  const canonical = absolute($("link[rel='canonical']").attr("href") || $("meta[property='og:url']").attr("content"), pageUrl);
  if (canonical && providerId(canonical) !== id) throw new Error(`AniDB returned title ${providerId(canonical)}, not ${id}`);

  const structured = jsonLd($);
  const title = clean($("main h1").first().text() || structured.name || $("meta[property='og:title']").attr("content")).replace(/\s+[—-]\s+AniDB$/i, "");
  if (!title) throw new Error("AniDB did not return title metadata");
  const typeText = String(structured["@type"] || $("meta[property='og:type']").attr("content") || $("main a[href*='type=']").first().text());
  const type = /movie/i.test(typeText) ? "movie" : "series";
  let image = absolute(
    $("main img[alt]").filter((_, element) => clean($(element).attr("alt")) === title).first().attr("src") ||
    structured.image ||
    $("meta[property='og:image']").attr("content"),
    pageUrl,
  );
  if (isPlaceholder(image)) image = "";
  const synopsis = clean(structured.description || $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content"));
  const anilistId = Number($("a[href*='anilist.co/anime/']").first().attr("href")?.match(/anime\/(\d+)/i)?.[1] || 0);
  const malId = Number($("a[href*='myanimelist.net/anime/']").first().attr("href")?.match(/anime\/(\d+)/i)?.[1] || 0);
  const tags = $("main a[href^='/genres/']").map((_, element) => clean($(element).text())).get().filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index);
  const ratingText = $("main").text().match(/(?:^|\s)(\d(?:\.\d)?)\s*(?:PG-|R\+|$)/)?.[1] || "";
  const count = expectedEpisodes(html, $);

  let linkList = explicitSeasons($, id, pageUrl, image);
  if (!linkList.length) {
    linkList = [{
      title: type === "movie" ? "Movie" : (count ? `${count} Episodes` : title),
      image,
      episodesLink: `anidb:${id}?title=${encodeURIComponent(title)}&page=${encodeURIComponent(pageUrl)}${count ? `&expected=${count}` : ""}`,
      selected: true,
    }];
  }

  return {
    title,
    image,
    synopsis,
    imdbId: "",
    anilistId: anilistId || undefined,
    type,
    tags,
    rating: ratingText,
    linkList,
    providerIds: {anidb: id, mal: malId || undefined},
  };
};
