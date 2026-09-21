const BASE = "https://mangafire.to";
const TITLE_PATH = /^\/title\/([a-z0-9]+)(?:-([a-z0-9-]+))?\/?$/;
const LANGUAGE_NAMES = {
  en: "English",
  fr: "French",
  es: "Spanish",
  "es-la": "Spanish (LATAM)",
  pt: "Portuguese",
  "pt-br": "Portuguese (Brazil)",
  ja: "Japanese",
};

function titleIdentity(value) {
  let url;
  try {
    url = new URL(String(value || ""), BASE);
  } catch {
    throw new Error("Invalid MangaFire title URL");
  }
  const match = url.origin === BASE ? url.pathname.match(TITLE_PATH) : null;
  if (!match) throw new Error("Invalid MangaFire title URL");
  return {
    hid: match[1],
    key: url.pathname.replace(/^\/title\//, "").replace(/\/$/, ""),
    url: `${BASE}${url.pathname.replace(/\/$/, "")}`,
  };
}

async function apiGet(path, signal, providerContext, referer) {
  if (typeof providerContext?.chromiumRequest !== "function") {
    throw new Error("MangaFire requires MORROW's desktop data bridge");
  }
  let response;
  let message = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await providerContext.chromiumRequest({
      provider: "mangafire",
      url: `${BASE}/api${path}`,
      method: "GET",
      responseType: "json",
      signal,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: referer,
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
    throw new Error("MangaFire returned invalid title JSON");
  }
}

function exactProviderUrl(value) {
  try {
    const url = new URL(String(value || ""), BASE);
    return url.origin === BASE && TITLE_PATH.test(url.pathname)
      ? `${BASE}${url.pathname.replace(/\/$/, "")}`
      : "";
  } catch {
    return "";
  }
}

function textList(values) {
  return (Array.isArray(values) ? values : [])
    .map((entry) => String(entry?.title || entry?.name || entry || "").trim())
    .filter(Boolean);
}

function numericId(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

exports.getMeta = async ({link, signal, providerContext}) => {
  const requested = titleIdentity(link);
  const payload = await apiGet(
    `/titles/${requested.hid}`,
    signal,
    providerContext,
    requested.url,
  );
  const detail = payload?.data;
  const providerUrl = exactProviderUrl(detail?.url);
  const returned = providerUrl ? titleIdentity(providerUrl) : null;
  if (
    !detail
    || String(detail.hid || "") !== requested.hid
    || !returned
    || returned.key !== requested.key
  ) {
    throw new Error("MangaFire returned metadata for a different title");
  }
  const title = String(detail.title || "").trim();
  if (!title) throw new Error("MangaFire returned no exact title");

  const synopsisHtml = String(detail.synopsisHtml || "");
  const synopsis = synopsisHtml
    ? providerContext.cheerio.load(`<body>${synopsisHtml}</body>`)("body").text().trim()
    : "";
  const authors = textList(detail.authors);
  const tags = [...new Set([
    ...textList(detail.genres),
    ...textList(detail.themes),
    detail.contentRating
      ? String(detail.contentRating).replace(/_/g, " ")
      : "",
  ].filter(Boolean))];
  const languages = (Array.isArray(detail.languages) ? detail.languages : [])
    .map((value) => String(value || "").toLowerCase())
    .filter((value) => /^[a-z]{2}(?:-[a-z]{2})?$/.test(value));
  const defaultLanguage = languages.includes("en")
    ? "en"
    : String(detail.language || languages[0] || "").toLowerCase();
  const languageRows = [...new Set(
    [defaultLanguage, ...languages].filter(Boolean),
  )].map((language, index) => ({
    title: LANGUAGE_NAMES[language] || language.toUpperCase(),
    episodesLink: `mangafire-title:${requested.key}:${language}`,
    selected: index === 0,
    providerLanguageCode: language,
    languageCode: language === "en" ? "en" : undefined,
    contentKind: "manga-chapters",
    navigationKind: "language",
  }));
  if (!languageRows.length) {
    throw new Error("MangaFire returned no chapter language");
  }

  return {
    title,
    image: String(detail.poster?.large || detail.poster?.medium || ""),
    portraitImage: String(detail.poster?.large || detail.poster?.medium || ""),
    synopsis,
    imdbId: "",
    anilistId: numericId(detail.anilistId),
    type: "manga",
    year: detail.year || undefined,
    releaseInfo: String(detail.status || "").replace(/_/g, " "),
    tags,
    cast: authors,
    author: authors.join(", "),
    rating: detail.rating != null ? String(detail.rating) : "",
    providerLanguageCode: defaultLanguage,
    languageCode: defaultLanguage === "en" ? "en" : undefined,
    providerUrl,
    titleId: numericId(detail.id),
    readerTheme: {background: "#111318", surface: "#1a1d24"},
    linkList: languageRows,
  };
};
