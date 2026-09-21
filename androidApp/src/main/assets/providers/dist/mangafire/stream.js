const BASE = "https://mangafire.to";
const IDENTITY = /^mangafire-chapter:(\d+):([a-z0-9]+(?:-[a-z0-9-]+)?):([a-z]{2}(?:-[a-z]{2})?)$/;
// MangaFire rotates the CDN shard label. Current official pages include both
// single-letter labels (o48) and mixed labels (l1n, nw8), so validate the
// stable mfcdnN.xyz boundary without pinning one transient shard shape.
const PAGE_HOST = /^[a-z0-9]{2,12}\.mfcdn\d{1,3}\.xyz$/i;
const PAGE_PATH =
  /^\/mf\/[a-f0-9]{64,192}\/[a-z0-9_-]{1,16}\/p\.(?:avif|jpe?g|png|webp)$/i;
const TITLE_PATH = /^\/title\/([a-z0-9]+(?:-[a-z0-9-]+)?)\/?$/;

function chapterIdentity(value) {
  const match = String(value || "").match(IDENTITY);
  const chapterId = Number(match?.[1] || 0);
  if (!match || !Number.isSafeInteger(chapterId) || chapterId <= 0) {
    throw new Error("Invalid MangaFire chapter identity");
  }
  return {
    chapterId,
    key: match[2],
    hid: match[2].split("-")[0],
    language: match[3],
  };
}

async function chapterPayload(identity, signal, providerContext) {
  if (typeof providerContext?.chromiumRequest !== "function") {
    throw new Error("MangaFire requires MORROW's desktop data bridge");
  }
  const officialViewerUrl =
    `${BASE}/title/${identity.key}/chapter/${identity.chapterId}`;
  let response;
  let message = "";
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await providerContext.chromiumRequest({
      provider: "mangafire",
      url: `${BASE}/api/chapters/${identity.chapterId}`,
      method: "GET",
      responseType: "json",
      signal,
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
        Referer: officialViewerUrl,
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
    return {payload: JSON.parse(response.data), officialViewerUrl};
  } catch {
    throw new Error("MangaFire returned invalid reader JSON");
  }
}

function officialPage(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:"
      && PAGE_HOST.test(url.hostname)
      && PAGE_PATH.test(url.pathname)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function exactTitleKey(value) {
  try {
    const url = new URL(String(value || ""), BASE);
    const match = url.origin === BASE ? url.pathname.match(TITLE_PATH) : null;
    return match && !url.search && !url.hash ? match[1] : "";
  } catch {
    return "";
  }
}

function positiveDimension(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

exports.getChapter = async ({link, signal, providerContext}) => {
  const identity = chapterIdentity(link);
  const {payload, officialViewerUrl} = await chapterPayload(
    identity,
    signal,
    providerContext,
  );
  const chapter = payload?.data;
  const returnedChapterId = Number(chapter?.id || 0);
  const returnedHid = String(chapter?.title?.hid || "").toLowerCase();
  const returnedTitleKey = exactTitleKey(chapter?.title?.url);
  if (
    returnedChapterId !== identity.chapterId
    || returnedHid !== identity.hid
    || returnedTitleKey !== identity.key
  ) {
    throw new Error("MangaFire returned pages for a different chapter");
  }
  if (!Array.isArray(chapter?.pages) || !chapter.pages.length) {
    throw new Error("MangaFire returned no genuine manga pages");
  }

  const seen = new Set();
  const pages = chapter.pages.map((page, offset) => {
    const url = officialPage(page?.url);
    if (!url || seen.has(url)) {
      throw new Error("MangaFire returned an invalid or duplicate manga page");
    }
    seen.add(url);
    return {
      index: offset + 1,
      url,
      width: positiveDimension(page?.width),
      height: positiveDimension(page?.height),
      renderable: true,
    };
  });
  const titleName = String(chapter?.title?.name || chapter?.title?.title || "").trim();
  const chapterName = String(chapter?.name || "").trim();
  const titleId = Number(chapter?.title?.id || 0);
  const providerLanguage = String(chapter?.language || identity.language).toLowerCase();
  if (providerLanguage !== identity.language) {
    throw new Error("MangaFire returned pages in the wrong chapter language");
  }
  const titleType = String(chapter?.title?.type || "").toLowerCase();
  const sourceId =
    `mangafire:${identity.key}:chapter:${identity.chapterId}:${identity.language}`;
  const reader = {
    mode: "vertical-scroll",
    officialViewerUrl,
    ...(Number.isSafeInteger(titleId) && titleId > 0 ? {titleId} : {}),
    chapterId: identity.chapterId,
    titleName,
    chapterName,
    language: providerLanguage,
    direction: titleType === "manhwa" || titleType === "manhua"
      ? "vertical"
      : "adaptive",
    background: "#111318",
    pages,
    pageCount: pages.length,
    protectedPageCount: 0,
    requiresOfficialViewer: false,
  };

  return [{
    server: "MangaFire",
    selectorKind: "source",
    serverLabel: null,
    sourceLabel: "Native pages",
    labelProvenance: "provider-api",
    sourceId,
    providerLanguageCode: providerLanguage,
    languageCode: providerLanguage === "en" ? "en" : undefined,
    playbackMode: "manga-reader",
    transport: "image-sequence",
    type: "manga",
    link: officialViewerUrl,
    health: "unchecked",
    headers: {
      Referer: officialViewerUrl,
      Origin: BASE,
    },
    reader,
  }];
};

exports.getStream = exports.getChapter;
