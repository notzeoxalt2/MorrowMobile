"use strict";

const MOVIEBOX_PROXY = "https://worker.zendax.me/api/moviebox";
const HOME_PATH = "/wefeed-mobile-bff/tab-operating?page=3&tabId=0&version=2fe0d7c224603ff7b0df294b46d3b84b";
const SEARCH_PATH = "/wefeed-mobile-bff/subject-api/search/v2";
const SEARCH_TABS = ["Movie", "TV"];

const proxyUrl = (path) => `${MOVIEBOX_PROXY}?url=${encodeURIComponent(path)}`;

const requestJson = async (path, {method = "GET", body, signal} = {}) => {
  const response = await fetch(proxyUrl(path), {
    method,
    signal,
    headers: body ? {"Content-Type": "application/json"} : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`MovieBox proxy returned HTTP ${response.status}`);
  }
  const data = await response.json();
  if (!data || typeof data !== "object") {
    throw new Error("MovieBox proxy returned an invalid response");
  }
  return data;
};

const extractSubjects = (items) => {
  const subjects = [];
  const seen = new Set();
  const append = (subject) => {
    const subjectId = String(subject?.subjectId || "").trim();
    if (!subjectId || seen.has(subjectId)) return;
    seen.add(subjectId);
    subjects.push(subject);
  };

  for (const item of Array.isArray(items) ? items : []) {
    if (item?.type === "BANNER" && Array.isArray(item?.banner?.banners)) {
      for (const banner of item.banner.banners) append(banner?.subject);
    }
    if (Array.isArray(item?.subjects)) {
      for (const subject of item.subjects) append(subject);
    }
  }
  return subjects;
};

const cleanCatalogTitle = (value) =>
  String(value || "")
    .replace(/\[[^\]]*(?:\]|$)/g, " ")
    .replace(/\bS\d{1,3}(?:\s*[-–—]\s*S?\d{1,3})?\s*$/i, " ")
    .replace(/\bSeasons?\s+\d{1,3}(?:\s*[-–—]\s*\d{1,3})?\s*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeTitle = (value) =>
  cleanCatalogTitle(value)
    .replace(/\((?:19|20)\d{2}\)/g, " ")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const toPost = (subject) => {
  const subjectId = String(subject?.subjectId || "").trim();
  const cleanTitle = cleanCatalogTitle(subject?.title);
  if (!subjectId || !cleanTitle) return null;
  const releaseYear = String(subject?.releaseDate || "")
    .match(/(?:19|20)\d{2}/)?.[0] || "";
  // Keep the year in the internal route identity so repeated titles such as
  // Alpha, The Odyssey and Avatar resolve one exact Cinemeta/TMDB record.
  // Card/hero presentation runs through cleanContentTitle and stays uncluttered.
  const title = releaseYear && !cleanTitle.includes(releaseYear)
    ? `${cleanTitle} (${releaseYear})`
    : cleanTitle;
  return {
    image: String(subject?.cover?.url || "").trim(),
    title,
    link: `/wefeed-mobile-bff/subject-api/get?subjectId=${encodeURIComponent(subjectId)}`,
    type: Number(subject?.subjectType) === 2 ? "series" : "movie",
    releaseYear,
    hasResource: subject?.hasResource !== false,
  };
};

const getPosts = async ({page = 1, signal}) => {
  if (page > 1) return [];
  const response = await requestJson(HOME_PATH, {signal});
  return extractSubjects(response?.data?.items).map(toPost).filter(Boolean);
};

const getSearchPosts = async ({searchQuery, page = 1, signal}) => {
  if (page > 1 || !String(searchQuery || "").trim()) return [];
  const keyword = String(searchQuery).trim();
  const responses = await Promise.allSettled(SEARCH_TABS.map((tabId) =>
    requestJson(SEARCH_PATH, {
      method: "POST",
      signal,
      body: {
        page: 1,
        perPage: 20,
        keyword,
        tabId,
      },
    }),
  ));
  const fulfilled = responses
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
  if (!fulfilled.length) {
    throw responses.find((result) => result.status === "rejected")?.reason
      || new Error("MovieBox search returned no response");
  }

  const seen = new Set();
  const posts = fulfilled
    .flatMap((response) => {
      const groups = Array.isArray(response?.data?.results) ? response.data.results : [];
      return extractSubjects(groups);
    })
    .map(toPost)
    .filter((post) => {
      if (!post || seen.has(post.link)) return false;
      seen.add(post.link);
      return true;
    });
  const queryIdentity = normalizeTitle(keyword);
  return posts
    .map((post, index) => ({
      post,
      index,
      rank: normalizeTitle(post.title) === queryIdentity
        ? 0
        : normalizeTitle(post.title).includes(queryIdentity)
          ? 1
          : 2,
    }))
    .sort((left, right) =>
      left.rank - right.rank
        || Number(right.post.hasResource) - Number(left.post.hasResource)
        || Number(right.post.releaseYear || 0) - Number(left.post.releaseYear || 0)
        || left.index - right.index,
    )
    .map(({post}) => post);
};

exports.cleanCatalogTitle = cleanCatalogTitle;
exports.getPosts = getPosts;
exports.getSearchPosts = getSearchPosts;
