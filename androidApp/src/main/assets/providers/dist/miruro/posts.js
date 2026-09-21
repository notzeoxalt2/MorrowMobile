const API = "https://graphql.anilist.co";

const query = `query ($page: Int, $search: String, $sort: [MediaSort], $status: MediaStatus, $format: MediaFormat, $genre: String) {
  Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, search: $search, sort: $sort, status: $status, format: $format, genre: $genre) {
      id
      title { english romaji userPreferred }
      coverImage { extraLarge large }
    }
  }
}`;
const scheduleQuery = `query {
  Page(page: 1, perPage: 24) {
    airingSchedules(notYetAired: true, sort: TIME) {
      airingAt episode
      media {
        id isAdult title { english romaji userPreferred }
        coverImage { extraLarge large }
      }
    }
  }
}`;
const homeQuery = `query ($page: Int) {
  trending: Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, sort: [TRENDING_DESC]) { ...CardFields }
  }
  popular: Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) { ...CardFields }
  }
  topRated: Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, sort: [SCORE_DESC]) { ...CardFields }
  }
  airing: Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, status: RELEASING, sort: [TRENDING_DESC]) { ...CardFields }
  }
  movies: Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, format: MOVIE, sort: [POPULARITY_DESC]) { ...CardFields }
  }
  updated: Page(page: $page, perPage: 24) {
    media(type: ANIME, isAdult: false, sort: [UPDATED_AT_DESC]) { ...CardFields }
  }
  upcoming: Page(page: 1, perPage: 24) {
    airingSchedules(notYetAired: true, sort: TIME) {
      airingAt
      episode
      media { ...CardFields isAdult }
    }
  }
}
fragment CardFields on Media {
  id
  title { english romaji userPreferred }
  coverImage { extraLarge large }
}`;

function slug(value) {
  return String(value || "anime").toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function toPost(media) {
  const title = media.title?.english || media.title?.userPreferred || media.title?.romaji || `Anime ${media.id}`;
  return {
    title,
    link: `https://www.miruro.to/info/${media.id}/${slug(media.title?.romaji || title)}`,
    image: media.coverImage?.extraLarge || media.coverImage?.large || "",
  };
}

async function request(variables, signal, providerContext) {
  const response = await providerContext.axios.post(API, {query, variables}, {
    signal,
    timeout: 12000,
    forceDoh: true,
    headers: {"Content-Type": "application/json", Accept: "application/json"},
  });
  if (response.data?.errors?.length) throw new Error(response.data.errors[0].message || "AniList request failed");
  return (response.data?.data?.Page?.media || []).map(toPost);
}

exports.getPosts = async ({filter, page, signal, providerContext}) => {
  if (filter === "AIRING_SOON") {
    const response = await providerContext.axios.post(API, {query: scheduleQuery}, {
      signal, timeout: 12000, forceDoh: true, headers: {"Content-Type": "application/json", Accept: "application/json"},
    });
    if (response.data?.errors?.length) throw new Error(response.data.errors[0].message || "AniList schedule request failed");
    return (response.data?.data?.Page?.airingSchedules || [])
      .filter((entry) => entry?.media?.id && !entry.media.isAdult && entry?.airingAt)
      .map((entry) => ({...toPost(entry.media), airingAt: Number(entry.airingAt), episode: Number(entry.episode || 0)}));
  }
  const variables = {page: page || 1, sort: ["TRENDING_DESC"]};
  if (filter === "POPULARITY_DESC") variables.sort = ["POPULARITY_DESC"];
  else if (filter === "SCORE_DESC") variables.sort = ["SCORE_DESC"];
  else if (filter === "UPDATED_DESC") variables.sort = ["UPDATED_AT_DESC"];
  else if (filter === "AIRING") { variables.sort = ["TRENDING_DESC"]; variables.status = "RELEASING"; }
  else if (filter === "MOVIES") { variables.sort = ["POPULARITY_DESC"]; variables.format = "MOVIE"; }
  else if (String(filter).startsWith("GENRE:")) { variables.sort = ["POPULARITY_DESC"]; variables.genre = String(filter).slice(6); }
  return request(variables, signal, providerContext);
};

exports.getHomePosts = async ({catalogs, signal, providerContext}) => {
  const response = await providerContext.axios.post(API, {
    query: homeQuery,
    variables: {page: 1},
  }, {
    signal,
    timeout: 12000,
    forceDoh: true,
    headers: {"Content-Type": "application/json", Accept: "application/json"},
  });
  if (response.data?.errors?.length) {
    throw new Error(response.data.errors[0].message || "AniList home request failed");
  }
  const payload = response.data?.data || {};
  const pagePosts = (key) => (payload[key]?.media || []).map(toPost);
  const upcoming = (payload.upcoming?.airingSchedules || [])
    .filter((entry) => entry?.media?.id && !entry.media.isAdult && entry?.airingAt)
    .map((entry) => ({
      ...toPost(entry.media),
      airingAt: Number(entry.airingAt),
      episode: Number(entry.episode || 0),
    }));
  const all = {
    TRENDING_DESC: pagePosts("trending"),
    AIRING_SOON: upcoming,
    POPULARITY_DESC: pagePosts("popular"),
    SCORE_DESC: pagePosts("topRated"),
    AIRING: pagePosts("airing"),
    MOVIES: pagePosts("movies"),
    UPDATED_DESC: pagePosts("updated"),
  };
  const requested = {};
  for (const catalog of catalogs || []) {
    requested[catalog.filter] = all[catalog.filter] || [];
  }
  return requested;
};

exports.getSearchPosts = async ({searchQuery, page, signal, providerContext}) =>
  request({page: page || 1, search: searchQuery, sort: ["SEARCH_MATCH"]}, signal, providerContext);
