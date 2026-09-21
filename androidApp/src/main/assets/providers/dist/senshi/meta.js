const BASE = "https://senshi.live";
const ANILIST_GRAPHQL = "https://graphql.anilist.co";

const ANILIST_BY_MAL_QUERY = `
  query SenshiCanonicalMedia($malIds: [Int]) {
    Page(page: 1, perPage: 50) {
      media(idMal_in: $malIds, type: ANIME) {
        id
        idMal
        bannerImage
        coverImage { extraLarge large }
        title { english romaji native }
        format
        seasonYear
      }
    }
  }
`;

function absoluteUrl(value) {
  if (!String(value || "").trim()) return "";
  try { return new URL(String(value || ""), BASE).href; }
  catch { return ""; }
}

function publicIdFromLink(link) {
  const match = String(link || "").match(/senshi\.live\/(?:watch|anime)\/([^/?#]+)/i);
  if (!match?.[1]) throw new Error("Invalid Senshi title link");
  return decodeURIComponent(match[1]);
}

function titleOf(anime) {
  return String(anime?.title_english || anime?.title || `Anime ${anime?.id || ""}`).trim();
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function positiveId(value) {
  const id = Number(value || 0);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

function canonicalTitle(media, fallback) {
  return String(media?.title?.english || media?.title?.romaji || fallback || "").trim();
}

async function resolveCanonicalMedia(animeList, providerContext) {
  const fallback = new Map();
  const malIds = [];
  for (const anime of animeList) {
    const malId = positiveId(anime?.id);
    if (!malId) continue;
    malIds.push(malId);
    const anilistId = positiveId(anime?.anilist_id);
    if (anilistId) fallback.set(malId, {id: anilistId, idMal: malId});
  }

  const uniqueMalIds = [...new Set(malIds)].slice(0, 50);
  if (!uniqueMalIds.length) return fallback;

  try {
    const response = await providerContext.axios.post(ANILIST_GRAPHQL, {
      query: ANILIST_BY_MAL_QUERY,
      variables: {malIds: uniqueMalIds},
    }, {
      timeout: 10000,
      forceDoh: true,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Referer: `${BASE}/`,
      },
    });
    const media = response?.data?.data?.Page?.media;
    for (const item of Array.isArray(media) ? media : []) {
      const malId = positiveId(item?.idMal);
      const anilistId = positiveId(item?.id);
      if (!malId || !anilistId || !uniqueMalIds.includes(malId)) continue;
      fallback.set(malId, item);
    }
  } catch {
    // Senshi metadata remains usable when AniList is temporarily unavailable.
  }
  return fallback;
}

function seasonLink(anime, selected, canonical) {
  const providerImage = absoluteUrl(anime?.anime_picture);
  const cover = absoluteUrl(canonical?.coverImage?.extraLarge || canonical?.coverImage?.large);
  const banner = absoluteUrl(canonical?.bannerImage);
  const anilistId = positiveId(canonical?.id) || positiveId(anime?.anilist_id);
  return {
    title: canonicalTitle(canonical, titleOf(anime)),
    image: banner || cover || providerImage,
    episodesLink: `senshi-season:${encode({
      id: Number(anime?.id),
      publicId: String(anime?.public_id || ""),
      title: canonicalTitle(canonical, titleOf(anime)),
      image: providerImage,
      anilistId,
    })}`,
    selected,
    ...(anilistId ? {anilistId} : {}),
  };
}

async function apiGet(path, providerContext, referer = `${BASE}/`) {
  const response = await providerContext.axios.get(`${BASE}${path}`, {
    timeout: 12000,
    forceDoh: true,
    headers: {Accept: "application/json", Referer: referer},
  });
  return response?.data;
}

exports.getMeta = async ({link, providerContext}) => {
  const publicId = publicIdFromLink(link);
  const pageUrl = `${BASE}/watch/${encodeURIComponent(publicId)}/1`;
  const anime = await apiGet(`/anime/${encodeURIComponent(publicId)}`, providerContext, pageUrl);
  if (!anime?.id || String(anime.public_id || "") !== publicId) {
    throw new Error("Senshi returned metadata for a different title");
  }

  let related = [];
  try {
    const rows = await apiGet(`/anime/${encodeURIComponent(publicId)}/related`, providerContext, pageUrl);
    const sequence = (Array.isArray(rows) ? rows : []).filter((item) =>
      ["Prequel", "Parent story", "Sequel"].includes(String(item?.relation_type || "")) && item?.public_id && item?.id,
    );
    related = await Promise.all(sequence.map(async (item) => {
      try {
        const resolved = await apiGet(`/anime/${encodeURIComponent(item.public_id)}`, providerContext, pageUrl);
        return resolved?.id === item.id ? {...resolved, relation_type: item.relation_type} : item;
      } catch { return item; }
    }));
  } catch { related = []; }

  const previous = related.filter((item) => ["Prequel", "Parent story"].includes(String(item?.relation_type || "")));
  const next = related.filter((item) => String(item?.relation_type || "") === "Sequel");
  const ordered = [...previous, anime, ...next].filter((item, index, all) =>
    all.findIndex((other) => Number(other?.id) === Number(item?.id)) === index,
  );
  const canonicalByMal = await resolveCanonicalMedia(ordered, providerContext);
  const canonical = canonicalByMal.get(positiveId(anime.id));
  const providerImage = absoluteUrl(anime.anime_picture);
  const portraitImage = absoluteUrl(canonical?.coverImage?.extraLarge || canonical?.coverImage?.large) || providerImage;
  const backdrop = absoluteUrl(canonical?.bannerImage);
  const anilistId = positiveId(canonical?.id) || positiveId(anime.anilist_id);
  const isMovie = String(canonical?.format || anime.type || "").toUpperCase() === "MOVIE";

  return {
    title: canonicalTitle(canonical, titleOf(anime)),
    image: portraitImage,
    portraitImage,
    ...(backdrop ? {backdrop} : {}),
    synopsis: String(anime.ani_description || "").trim(),
    imdbId: "",
    ...(anilistId ? {anilistId} : {}),
    type: isMovie ? "movie" : "series",
    year: Number(canonical?.seasonYear || anime.ani_year || 0) || undefined,
    releaseInfo: String(anime.airing_date || anime.ani_status || "").trim(),
    tags: String(anime.genres || "").split(",").map((tag) => tag.trim()).filter(Boolean),
    cast: [],
    rating: anime.score != null && Number.isFinite(Number(anime.score)) && Number(anime.score) > 0 ? String(anime.score) : "",
    linkList: ordered.map((item) => seasonLink(
      item,
      Number(item.id) === Number(anime.id),
      canonicalByMal.get(positiveId(item.id)),
    )),
  };
};
