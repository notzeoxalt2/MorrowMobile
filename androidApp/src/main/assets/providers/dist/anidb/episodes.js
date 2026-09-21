const BASE = "https://anidb.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function requestHeaders(animeId, pageUrl) {
  return {
    Accept: "application/json",
    Referer: pageUrl || `${BASE}/anime/title-${animeId}`,
    Origin: BASE,
    "User-Agent": USER_AGENT,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}
function dataOf(value, providerContext) {
  if (value && typeof value === "object") return value;
  const raw = String(value || "").trim();
  try { return JSON.parse(raw); } catch {}
  try {
    const $ = providerContext.cheerio.load(raw);
    return JSON.parse($("pre").first().text() || $("body").text());
  } catch { throw new Error("AniDB returned an invalid episode response"); }
}
async function chromiumRequest(url, animeId, pageUrl, signal, providerContext) {
  const bridge = providerContext.chromiumRequest || providerContext.chromiumFetch;
  if (typeof bridge !== "function") return null;
  const response = await bridge({
    provider: "anidb",
    url,
    method: "GET",
    headers: requestHeaders(animeId, pageUrl),
    responseType: "text",
    signal,
  });
  if (!response?.ok) {
    const error = new Error(`AniDB Chromium request failed: ${response?.status || "unknown"}`);
    error.status = Number(response?.status || 0);
    throw error;
  }
  return dataOf(response.data, providerContext);
}
async function requestJson(url, animeId, pageUrl, signal, providerContext) {
  const browserPayload = await chromiumRequest(url, animeId, pageUrl, signal, providerContext);
  if (browserPayload) return browserPayload;
  const response = await providerContext.axios.get(url, {
    signal,
    timeout: 12000,
    headers: requestHeaders(animeId, pageUrl),
  });
  return dataOf(response.data, providerContext);
}
function clean(value) { return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(); }
function imageOf(episode) {
  const value = String(episode?.image || episode?.thumbnail || episode?.poster || "").trim();
  return /^https?:\/\//i.test(value) ? value : "";
}
function explicitFiller(episode) {
  return episode?.filler === true || episode?.is_filler === true || episode?.isFiller === true;
}

exports.getEpisodes = async ({url, signal, providerContext}) => {
  const parsed = new URL(String(url).replace(/^anidb:/, "https://anidb.local/"));
  const animeId = Number(parsed.pathname.replace(/^\//, ""));
  if (!animeId) throw new Error("Invalid AniDB season link");
  const requestedPage = String(parsed.searchParams.get("page") || "");
  let pageUrl = "";
  try {
    const candidate = new URL(requestedPage);
    if (candidate.origin === BASE && Number(candidate.pathname.match(/-(\d+)\/?$/)?.[1] || 0) === animeId) pageUrl = candidate.href;
  } catch {}
  const payload = await requestJson(
    `${BASE}/api/frontend/anime/${animeId}/episodes`,
    animeId,
    pageUrl,
    signal,
    providerContext,
  );
  const rows = Array.isArray(payload?.episodes) ? payload.episodes : [];
  const seen = new Set();
  const episodes = [];

  for (const row of rows) {
    const episodeId = Number(row?.id || 0);
    const number = Number(row?.number || 0);
    const number2 = Number(row?.number2 || 0);
    if (!episodeId || !number || seen.has(episodeId)) continue;
    seen.add(episodeId);
    const range = number2 && number2 !== number ? `${number}–${number2}` : String(number);
    const providerTitle = clean(row?.title || row?.name);
    episodes.push({
      title: `Episode ${range}${providerTitle && !new RegExp(`^episode\\s*${number}$`, "i").test(providerTitle) ? ` · ${providerTitle}` : ""}`,
      link: `anidb-source:${encode({animeId, episodeId, number, number2: number2 || null, pageUrl: pageUrl || null})}`,
      image: imageOf(row),
      description: clean(row?.description || row?.synopsis || row?.summary),
      number,
      isFiller: explicitFiller(row),
    });
  }

  episodes.sort((a, b) => Number(a.number) - Number(b.number));
  if (!episodes.length) throw new Error("AniDB returned no published episodes for this title");
  return episodes;
};
