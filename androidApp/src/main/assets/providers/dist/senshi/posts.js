const BASE = "https://senshi.live";

function absoluteUrl(value) {
  if (!String(value || "").trim()) return "";
  try { return new URL(String(value || ""), BASE).href; }
  catch { return ""; }
}

function titleOf(anime) {
  return String(anime?.title_english || anime?.title || `Anime ${anime?.id || ""}`).trim();
}

function episodeNumber(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveId(value) {
  const id = Number(value || 0);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function toPost(anime, options = {}) {
  const publicId = String(anime?.public_id || "").trim();
  if (!publicId || !anime?.id) return null;
  const episode = episodeNumber(options.episode, 1);
  const anilistId = positiveId(anime?.anilist_id);
  const link = new URL(`${BASE}/watch/${encodeURIComponent(publicId)}/${episode}`);
  if (anilistId) link.searchParams.set("anilistId", String(anilistId));
  return {
    title: titleOf(anime),
    link: link.href,
    image: absoluteUrl(options.image || anime.anime_picture),
    ...(anilistId ? {anilistId} : {}),
    ...(options.airingAt ? {airingAt: options.airingAt} : {}),
    ...(options.episode ? {episode} : {}),
  };
}

function uniquePosts(values) {
  const seen = new Set();
  return values.filter(Boolean).filter((post) => {
    const identity = `${post.link}|${post.episode || ""}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function get(path, signal, providerContext) {
  const response = await providerContext.axios.get(`${BASE}${path}`, {
    signal,
    timeout: 12000,
    forceDoh: true,
    headers: {Accept: "application/json", Referer: `${BASE}/`},
  });
  return response?.data;
}

async function filterAnime(body, signal, providerContext) {
  const response = await providerContext.axios.post(`${BASE}/anime/filter`, body, {
    signal,
    timeout: 15000,
    forceDoh: true,
    headers: {Accept: "application/json", "Content-Type": "application/json", Referer: `${BASE}/browse`},
  });
  const payload = response?.data || {};
  return Array.isArray(payload) ? payload : (Array.isArray(payload.data) ? payload.data : []);
}

exports.getPosts = async ({filter, page = 1, signal, providerContext}) => {
  if (String(filter).startsWith("GENRE:")) {
    const genre = String(filter).slice(6).trim();
    const rows = await filterAnime({genres: genre ? [genre] : [], page, limit: 24, sortBy: "score_desc"}, signal, providerContext);
    return uniquePosts(rows.map((anime) => toPost(anime)));
  }

  if (filter === "sliders") {
    const rows = await get("/sliders", signal, providerContext);
    return uniquePosts((Array.isArray(rows) ? rows : []).map((row) =>
      toPost(row?.anime, {image: row?.image_url}),
    ));
  }

  if (filter === "latest") {
    const rows = await get("/episode-embeds/latest", signal, providerContext);
    return uniquePosts((Array.isArray(rows) ? rows : []).map((row) =>
      toPost(row?.anime, {episode: row?.ep_id || row?.episode?.ep_id}),
    ));
  }

  if (filter === "schedule") {
    const rows = await get("/schedule", signal, providerContext);
    return uniquePosts((Array.isArray(rows) ? rows : []).map((row) => {
      const airingAt = Date.parse(row?.next_airing_at || row?.airing_at || "");
      return toPost(row?.anime, {
        episode: row?.current_episode,
        airingAt: Number.isFinite(airingAt) ? Math.floor(airingAt / 1000) : undefined,
      });
    }));
  }

  const routes = {
    "trending/day": "/anime/trending/day",
    "trending/week": "/anime/trending/week",
    "trending/month": "/anime/trending/month",
    "recently-added": "/anime/recently-added",
    upcoming: "/anime/upcoming",
  };
  const route = routes[filter] || routes["trending/day"];
  const rows = await get(route, signal, providerContext);
  return uniquePosts((Array.isArray(rows) ? rows : []).map((anime) => toPost(anime)));
};

exports.getSearchPosts = async ({searchQuery, page = 1, signal, providerContext}) => {
  const query = String(searchQuery || "").trim();
  if (!query) return [];
  const rows = await filterAnime({searchTerm: query, page, limit: 24, sortBy: "score_desc"}, signal, providerContext);
  return uniquePosts(rows.map((anime) => toPost(anime)));
};
