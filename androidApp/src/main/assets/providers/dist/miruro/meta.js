const API = "https://graphql.anilist.co";
const mediaFields = `
  id idMal format episodes averageScore genres description(asHtml: false) season seasonYear
  startDate { year month day }
  title { english romaji userPreferred }
  coverImage { extraLarge large }
`;
const query = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    ${mediaFields}
    characters(sort: RELEVANCE, perPage: 10) { nodes { name { full } } }
    relations { edges { relationType node { ${mediaFields} } } }
  }
}`;
const seasonBatchQuery = `query ($ids: [Int]) {
  Page(page: 1, perPage: 32) {
    media(id_in: $ids, type: ANIME) {
      ${mediaFields}
      relations { edges { relationType node { ${mediaFields} } } }
    }
  }
}`;

const SEASON_FORMATS = new Set(["TV", "TV_SHORT", "ONA"]);
const MAX_SEASON_NODES = 24;
const MAX_GRAPH_ROUNDS = 10;
const META_CACHE_MS = 30 * 60 * 1000;
const FALLBACK_CACHE_MS = 5 * 60 * 1000;
const metaCache = new Map();
const metaRequests = new Map();

function getId(link) {
  const match = String(link).match(/(?:info\/|anilist:)(\d+)/);
  if (!match) throw new Error("Invalid Miruro anime link");
  return Number(match[1]);
}
function titleOf(media) { return media?.title?.english || media?.title?.userPreferred || media?.title?.romaji || `Anime ${media?.id}`; }
function dateValue(media) {
  const d = media?.startDate || {};
  return Number(d.year || media?.seasonYear || 9999) * 10000 + Number(d.month || 0) * 100 + Number(d.day || 0);
}
function isSeason(media) { return Boolean(media?.id && SEASON_FORMATS.has(media.format)); }

function responseStatus(error) {
  return Number(error?.response?.status || error?.status || 0);
}

function retryDelay(error, attempt) {
  const headers = error?.response?.headers;
  const retryAfter = Number(headers?.get?.("retry-after") || headers?.["retry-after"] || 0);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(1600, retryAfter * 1000);
  return 350 + attempt * 400;
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestAniList(body, providerContext) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await providerContext.axios.post(API, body, {
        timeout: 15000,
        forceDoh: true,
        headers: {"Content-Type": "application/json", Accept: "application/json"},
      });
      if (response.data?.errors?.length) {
        const error = new Error(response.data.errors[0].message || "AniList request failed");
        error.status = Number(response.data.errors[0].status || 0);
        throw error;
      }
      return response.data?.data;
    } catch (error) {
      lastError = error;
      const status = responseStatus(error);
      const retryable = status === 429 || status >= 500 || !status;
      if (!retryable || attempt === 2) break;
      await wait(retryDelay(error, attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("AniList request failed");
}

function aniZipImage(images, type) {
  return (Array.isArray(images) ? images : [])
    .find((image) => String(image?.coverType || "").toLowerCase() === type)?.url || "";
}

async function fallbackMedia(id, providerContext) {
  const response = await providerContext.axios.get(
    `https://api.ani.zip/mappings?anilist_id=${encodeURIComponent(id)}`,
    {timeout: 9000, forceDoh: true, headers: {Accept: "application/json"}},
  );
  const payload = typeof response.data === "string" ? JSON.parse(response.data) : response.data || {};
  if (Number(payload?.mappings?.anilist_id || 0) !== id) {
    throw new Error("Anime identity fallback returned a different title");
  }
  const title = payload.titles?.en || payload.titles?.["x-jat"] || payload.titles?.ja || `Anime ${id}`;
  const poster = aniZipImage(payload.images, "poster");
  const fanart = aniZipImage(payload.images, "fanart");
  return {
    id,
    idMal: Number(payload.mappings?.mal_id || 0) || null,
    format: String(payload.mappings?.type || "TV").toUpperCase(),
    episodes: Number(payload.episodeCount || 0) || null,
    averageScore: null,
    genres: [],
    description: "",
    title: {english: title, romaji: payload.titles?.["x-jat"] || title, userPreferred: title},
    coverImage: {extraLarge: poster, large: poster},
    bannerImage: fanart,
    characters: {nodes: []},
    relations: {edges: []},
    _fallback: true,
  };
}

function sequenceRelations(media) {
  return (media?.relations?.edges || [])
    .filter((edge) => edge?.node?.id && ["PREQUEL", "SEQUEL"].includes(edge.relationType))
    .map((edge) => edge.node);
}

async function collectSeasonGraph(root, providerContext) {
  if (!isSeason(root)) return [root];
  const nodes = new Map([[root.id, root]]);
  const expanded = new Set([root.id]);
  // AniList sometimes inserts an OVA or movie as the PREQUEL bridge between
  // numbered TV seasons (Slime S2 -> Visions of Coleus -> ... -> S1). Traverse
  // those sequence nodes, but only expose TV/TV_SHORT/ONA entries as seasons.
  let frontier = sequenceRelations(root);

  for (let round = 0; frontier.length && round < MAX_GRAPH_ROUNDS && nodes.size < MAX_SEASON_NODES; round += 1) {
    const ids = [];
    for (const media of frontier) {
      if (isSeason(media)) nodes.set(media.id, {...nodes.get(media.id), ...media});
      if (!expanded.has(media.id) && ids.length < MAX_SEASON_NODES) ids.push(media.id);
    }
    if (!ids.length) break;
    ids.forEach((id) => expanded.add(id));

    let resolved;
    try {
      resolved = (await requestAniList({query: seasonBatchQuery, variables: {ids}}, providerContext))?.Page?.media || [];
    } catch {
      // A secondary relation lookup must not blank the whole title page when
      // AniList is rate-limited. The root response already contains the
      // immediately adjacent, identity-verified seasons.
      break;
    }
    frontier = [];
    for (const media of resolved) {
      if (isSeason(media)) nodes.set(media.id, {...nodes.get(media.id), ...media});
      for (const related of sequenceRelations(media)) {
        if (isSeason(related)) nodes.set(related.id, {...nodes.get(related.id), ...related});
        if (!expanded.has(related.id)) frontier.push(related);
      }
    }
  }

  return [...nodes.values()].sort((a, b) => dateValue(a) - dateValue(b) || a.id - b.id);
}

function seasonLabel(media, fallbackIndex) {
  const names = [media?.title?.english, media?.title?.userPreferred, media?.title?.romaji].filter(Boolean);
  for (const name of names) {
    const normalized = String(name).replace(/[_-]+/g, " ");
    const season = normalized.match(/\bseason\s*(\d+)(?:\s*(?:part|cour)\s*(\d+))?/i);
    if (season) return `Season ${Number(season[1])}${season[2] ? ` · Part ${Number(season[2])}` : ""}`;
    const ordinal = normalized.match(/\b(\d+)(?:st|nd|rd|th)\s+season(?:\s*(?:part|cour)\s*(\d+))?/i);
    if (ordinal) return `Season ${Number(ordinal[1])}${ordinal[2] ? ` · Part ${Number(ordinal[2])}` : ""}`;
  }
  // A one-off ONA is a separate release, not the next numbered TV season.
  // Calling Operation Desert Pasta "Season 2" made the card look related to
  // the right franchise while its exact AniList identity said otherwise.
  if (media?.format === "ONA") return "ONA";
  return `Season ${fallbackIndex + 1}`;
}

async function loadMeta(link, providerContext) {
  const id = getId(link);
  let media;
  try {
    media = (await requestAniList({query, variables: {id}}, providerContext))?.Media;
  } catch (error) {
    if (responseStatus(error) !== 429 && responseStatus(error) !== 0 && responseStatus(error) < 500) throw error;
    media = await fallbackMedia(id, providerContext);
  }
  if (!media) throw new Error("Anime metadata was not found");
  if (Number(media.id) !== id) throw new Error(`AniList returned title ${media.id}, not ${id}`);
  const title = titleOf(media);
  const isMovie = media.format === "MOVIE";
  let seasons = [media];
  if (!isMovie && !media._fallback) {
    seasons = await collectSeasonGraph(media, providerContext);
  }
  const linkList = seasons.map((season, index) => {
    const label = seasonLabel(season, index);
    const canonicalTitle = titleOf(season);
    return {
      title: canonicalTitle,
      seasonLabel: isMovie
        ? "Movie"
        : seasons.length > 1
          ? label
          : `${season.episodes || "All"} Episodes`,
      image: season.coverImage?.extraLarge || season.coverImage?.large || "",
      episodesLink: `miruro:${season.id}?title=${encodeURIComponent(canonicalTitle)}&episodes=${season.episodes || ""}&malId=${season.idMal || ""}&format=${encodeURIComponent(season.format || "")}&year=${season.startDate?.year || season.seasonYear || ""}`,
      selected: Number(season.id) === id,
      anilistId: Number(season.id),
      navigationKind: "season",
    };
  });
  return {
    title,
    image: media.coverImage?.extraLarge || media.coverImage?.large || "",
    synopsis: String(media.description || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    imdbId: "",
    type: isMovie ? "movie" : "series",
    tags: media.genres || [],
    cast: (media.characters?.nodes || []).map((item) => item.name?.full).filter(Boolean),
    rating: media.averageScore ? `${media.averageScore}%` : "",
    linkList,
    anilistId: id,
    portraitImage: media.coverImage?.extraLarge || media.coverImage?.large || "",
    ...(media.bannerImage ? {backdrop: media.bannerImage} : {}),
    _fallback: Boolean(media._fallback),
  };
}

exports.getMeta = async ({link, providerContext}) => {
  const id = getId(link);
  const cached = metaCache.get(id);
  if (cached && Date.now() - cached.savedAt < cached.ttl) return cached.value;
  if (metaRequests.has(id)) return metaRequests.get(id);
  const request = loadMeta(link, providerContext).then((value) => {
    metaCache.set(id, {savedAt: Date.now(), ttl: value._fallback ? FALLBACK_CACHE_MS : META_CACHE_MS, value});
    const {_fallback, ...publicValue} = value;
    metaCache.set(id, {savedAt: Date.now(), ttl: _fallback ? FALLBACK_CACHE_MS : META_CACHE_MS, value: publicValue});
    return publicValue;
  }).finally(() => metaRequests.delete(id));
  metaRequests.set(id, request);
  return request;
};
