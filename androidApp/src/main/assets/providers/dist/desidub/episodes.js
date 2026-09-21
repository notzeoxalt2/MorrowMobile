const BASE = "https://www.desidubanime.me";
const PAGE_CONCURRENCY = 6;
const PAGE_TIMEOUT_MS = 10000;
const EPISODE_CACHE_TTL_MS = 5 * 60 * 1000;
const episodeCache = new Map();

function unpack(value) {
  const raw = String(value || "").replace(/^desidub-season:/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function imageUrl(value) {
  try {
    return new URL(value, BASE).href.replace(/^https:\/\/www\.themoviedb\.org\/t\/p\//i, "https://image.tmdb.org/t/p/");
  } catch { return ""; }
}

function realWatchLink(value) {
  try {
    const url = new URL(value, BASE);
    if (url.hostname.replace(/^www\./, "") !== "desidubanime.me" || !/^\/watch\//i.test(url.pathname)) return "";
    url.hash = "";
    return url.href;
  } catch { return ""; }
}

function dataOf(response) {
  const payload = typeof response.data === "string" ? JSON.parse(response.data) : response.data || {};
  return payload.data || payload;
}

function isRetryableRequestError(error) {
  const status = Number(error?.response?.status || 0);
  if (status >= 400 && status < 500) return false;
  const message = String(error?.message || error || "");
  return !status || status >= 500 || /abort|timeout|network|fetch|econn|etimedout/i.test(message);
}

async function mapConcurrent(values, limit, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({length: Math.min(limit, values.length)}, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await mapper(values[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

exports.getEpisodes = async ({url, signal, providerContext}) => {
  if (!String(url).startsWith("desidub-season:")) throw new Error("Refresh this DesiDubAnime title to load its real season ID");
  const season = unpack(url);
  if (!Number(season.id)) throw new Error("DesiDubAnime season ID is missing");
  const cacheKey = `${season.id}:${season.page || ""}`;
  const cached = episodeCache.get(cacheKey);
  if (cached && Date.now() - cached.savedAt < EPISODE_CACHE_TTL_MS) return cached.episodes;
  const requestPage = async (page) => {
    const endpoint = `${BASE}/wp-admin/admin-ajax.php?action=get_episodes&anime_id=${encodeURIComponent(season.id)}&page=${page}&order=asc`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return dataOf(await providerContext.axios.get(endpoint, {
          signal,
          timeout:PAGE_TIMEOUT_MS,
          forceDoh:true,
          headers:{Referer:season.page || `${BASE}/`},
        }));
      } catch (error) {
        if (attempt > 0 || !isRetryableRequestError(error) || signal?.aborted) {
          throw new Error(`DesiDubAnime episode page ${page} failed: ${error?.message || error}`);
        }
      }
    }
  };
  const first = await requestPage(1);
  const totalPages = Math.max(1, Number(first.max_episodes_page || 1));
  const remaining = totalPages > 1
    ? await mapConcurrent(
      Array.from({length:totalPages - 1}, (_, index) => index + 2),
      PAGE_CONCURRENCY,
      requestPage,
    )
    : [];
  const seen = new Set();
  const episodes = [first, ...remaining].flatMap((page) => Array.isArray(page.episodes) ? page.episodes : []).map((episode, index) => {
    const link = realWatchLink(episode.url);
    const number = Number(episode.meta_number || String(episode.number || "").match(/\d+(?:\.\d+)?/)?.[0] || index + 1);
    return {
      title: `Episode ${number}${episode.title ? ` · ${String(episode.title).replace(/\s+/g, " ").trim()}` : ""}`,
      link,
      image:imageUrl(episode.thumbnail || ""),
      description:"",
      number,
    };
  }).filter((episode) => episode.link && episode.number > 0).filter((episode) => {
    if (seen.has(episode.link)) return false;
    seen.add(episode.link);
    return true;
  }).sort((a, b) => a.number - b.number);
  if (!episodes.length) throw new Error("DesiDubAnime returned no published episodes for this season");
  episodeCache.set(cacheKey, {savedAt:Date.now(), episodes});
  return episodes;
};
