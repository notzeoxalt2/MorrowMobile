const BASE = "https://mangafire.to";
const PAGE_SIZE = 30;
const TITLE_PATH = /^\/title\/[a-z0-9]+(?:-[a-z0-9-]+)?\/?$/;
const TRENDING_DAYS = {day: 1, week: 7, month: 30};
const LATEST_TABS = new Set(["hot", "new"]);
const TITLE_TYPES = new Set(["all", "manga", "manhwa", "manhua"]);

function exactTitleUrl(value) {
  try {
    const url = new URL(String(value || ""), BASE);
    if (url.origin !== BASE || !TITLE_PATH.test(url.pathname)) return "";
    url.search = "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function posterOf(item) {
  if (typeof item?.poster === "string") return item.poster;
  return item?.poster?.large || item?.poster?.medium || item?.poster?.small || "";
}

function titlePost(item) {
  const title = String(item?.title || "").trim();
  const link = exactTitleUrl(item?.url);
  if (!title || !link) return null;
  const latestChapter = Number(item?.latestChapter);
  const type = String(item?.type || "").trim().toLowerCase();
  const chapterUpdatedAt = String(item?.chapterUpdatedAt || "").trim();
  return {
    title,
    link,
    image: String(posterOf(item) || ""),
    provider: "mangafire",
    ...(TITLE_TYPES.has(type) && type !== "all" ? {type} : {}),
    ...(Number.isFinite(latestChapter) ? {episode: latestChapter} : {}),
    ...(chapterUpdatedAt ? {chapterUpdatedAt} : {}),
    ...(item?.rating != null ? {rating: item.rating} : {}),
  };
}

function queryUrl(path, entries) {
  const url = new URL(`/api${path}`, BASE);
  for (const [key, value] of entries) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.append(key, String(value));
    }
  }
  return url.href;
}

async function apiGet(url, signal, providerContext) {
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    throw new Error("MangaFire request URL is invalid");
  }
  // MangaFire's trending feed is a public JSON endpoint and rejects the vrf
  // token used by protected title/chapter routes. Fetch it through MORROW's
  // ordinary provider transport so the first useful home row does not wait
  // for a cold hidden-Chromium protection bootstrap.
  if (
    parsedUrl.origin === BASE &&
    parsedUrl.pathname === "/api/top-titles" &&
    typeof providerContext?.axios?.get === "function"
  ) {
    const direct = await providerContext.axios.get(parsedUrl.href, {
      signal,
      timeout: 20_000,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE}/`,
      },
    });
    if (Number(direct?.status || 200) >= 400) {
      throw new Error(`MangaFire HTTP ${direct.status}`);
    }
    if (typeof direct?.data === "string") {
      try {
        return JSON.parse(direct.data);
      } catch {
        throw new Error("MangaFire returned invalid JSON");
      }
    }
    if (direct?.data && typeof direct.data === "object") return direct.data;
    throw new Error("MangaFire returned invalid JSON");
  }
  if (typeof providerContext?.chromiumRequest !== "function") {
    throw new Error("MangaFire requires MORROW's desktop data bridge");
  }
  let response;
  let message = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await providerContext.chromiumRequest({
      provider: "mangafire",
      url,
      method: "GET",
      responseType: "json",
      signal,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE}/`,
      },
    });
    if (response?.ok) break;
    message = "";
    try {
      message = String(JSON.parse(response?.data || "{}")?.message || "");
    } catch {}
    const retryable = /(?:invalid token|failed to fetch|network|abort|timed? ?out)/i.test(
      message || response?.error || "",
    ) || [429, 500, 502, 503, 504].includes(Number(response?.status || 0));
    if (attempt < 2 && retryable) {
      continue;
    }
    throw new Error(message || response?.error || `MangaFire HTTP ${response?.status || 0}`);
  }
  if (!response?.ok) {
    throw new Error(message || response?.error || `MangaFire HTTP ${response?.status || 0}`);
  }
  try {
    return JSON.parse(response.data);
  } catch {
    throw new Error("MangaFire returned invalid JSON");
  }
}

function parseFilter(filter) {
  const parts = String(filter || "").toLowerCase().split(":");
  if (parts[0] === "trending" && TRENDING_DAYS[parts[1]]) {
    return {kind: "trending", period: parts[1]};
  }
  if (
    parts[0] === "latest"
    && LATEST_TABS.has(parts[1])
    && TITLE_TYPES.has(parts[2] || "all")
  ) {
    return {kind: "latest", tab: parts[1], type: parts[2] || "all"};
  }
  throw new Error("Unsupported MangaFire catalog filter");
}

async function postsForFilter({filter, page = 1, signal, providerContext}) {
  const parsed = parseFilter(filter);
  const requestedPage = Math.max(1, Number(page) || 1);
  if (parsed.kind === "trending") {
    if (requestedPage !== 1) return [];
    const payload = await apiGet(queryUrl("/top-titles", [
      ["type", "trending"],
      ["days", TRENDING_DAYS[parsed.period]],
      ["limit", PAGE_SIZE],
    ]), signal, providerContext);
    if (!Array.isArray(payload?.items)) {
      throw new Error("MangaFire returned an invalid trending list");
    }
    return payload.items.map(titlePost).filter(Boolean);
  }

  const entries = [
    ["order[chapter_updated_at]", "desc"],
    ...(parsed.tab === "hot" ? [["hot", 1]] : []),
    ...(parsed.type === "all" ? [] : [["types[]", parsed.type]]),
    ["page", requestedPage],
    ["limit", PAGE_SIZE],
  ];
  const payload = await apiGet(
    queryUrl("/titles", entries),
    signal,
    providerContext,
  );
  if (!Array.isArray(payload?.items)) {
    throw new Error("MangaFire returned an invalid latest-updates list");
  }
  return payload.items.map(titlePost).filter(Boolean);
}

exports.getPosts = postsForFilter;

exports.getHomePosts = async ({catalogs, signal, providerContext}) => {
  const result = {};
  await Promise.all((catalogs || []).map(async (catalog) => {
    result[catalog.filter] = await postsForFilter({
      filter: catalog.filter,
      page: 1,
      signal,
      providerContext,
    });
  }));
  return result;
};

exports.getSearchPosts = async ({
  searchQuery,
  page = 1,
  signal,
  providerContext,
}) => {
  const keyword = String(searchQuery || "").trim();
  if (!keyword) return [];
  const payload = await apiGet(queryUrl("/titles", [
    ["keyword", keyword],
    ["order[relevance]", "desc"],
    ["page", Math.max(1, Number(page) || 1)],
    ["limit", PAGE_SIZE],
  ]), signal, providerContext);
  if (!Array.isArray(payload?.items)) {
    throw new Error("MangaFire returned an invalid search result");
  }
  return payload.items.map(titlePost).filter(Boolean);
};
