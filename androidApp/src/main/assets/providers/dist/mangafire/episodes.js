const BASE = "https://mangafire.to";
const PAGE_LIMIT = 200;
const IDENTITY = /^mangafire-title:([a-z0-9]+(?:-[a-z0-9-]+)?):([a-z]{2}(?:-[a-z]{2})?)$/;

function titleIdentity(value) {
  const match = String(value || "").match(IDENTITY);
  if (!match) throw new Error("Invalid MangaFire chapter-list identity");
  return {
    key: match[1],
    hid: match[1].split("-")[0],
    language: match[2],
  };
}

function queryUrl(identity, page) {
  const url = new URL(`/api/titles/${identity.hid}/chapters`, BASE);
  url.searchParams.set("language", identity.language);
  url.searchParams.set("type", "all");
  url.searchParams.set("sort", "number");
  url.searchParams.set("order", "desc");
  url.searchParams.set("page", String(page));
  url.searchParams.set("limit", String(PAGE_LIMIT));
  return url.href;
}

async function apiGet(url, identity, signal, providerContext) {
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
        Referer: `${BASE}/title/${identity.key}`,
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
    throw new Error("MangaFire returned invalid chapter-list JSON");
  }
}

function positiveInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}

exports.getEpisodes = async ({url, signal, providerContext}) => {
  const identity = titleIdentity(url);
  const first = await apiGet(
    queryUrl(identity, 1),
    identity,
    signal,
    providerContext,
  );
  if (!Array.isArray(first?.items) || !first?.meta) {
    throw new Error("MangaFire returned an invalid chapter list");
  }
  const lastPage = positiveInteger(
    first.meta.lastPage ?? first.meta.last_page,
    1,
  );
  if (lastPage > 500) {
    throw new Error("MangaFire chapter list exceeded its bounded page count");
  }

  const pages = [first];
  for (let page = 2; page <= lastPage; page += 1) {
    const payload = await apiGet(
      queryUrl(identity, page),
      identity,
      signal,
      providerContext,
    );
    if (!Array.isArray(payload?.items)) {
      throw new Error(`MangaFire chapter page ${page} was incomplete`);
    }
    const returnedPage = positiveInteger(payload?.meta?.page, page);
    if (returnedPage !== page) {
      throw new Error("MangaFire returned the wrong chapter page");
    }
    pages.push(payload);
  }

  const items = pages.flatMap((payload) => payload.items);
  const expectedTotal = positiveInteger(
    first.meta.total ?? first.meta.totalItems ?? first.meta.total_items,
  );
  if (expectedTotal && items.length !== expectedTotal) {
    throw new Error(
      `MangaFire returned ${items.length} of ${expectedTotal} chapters`,
    );
  }

  const seen = new Set();
  const uniqueItems = [];
  for (const chapter of items) {
    const chapterId = positiveInteger(chapter?.id);
    if (!chapterId) throw new Error("MangaFire returned an invalid chapter identity");
    // Pagination can repeat the boundary record while the upstream list is
    // changing. That is a true duplicate because the stable chapter ID is
    // identical; retain the first provider-ordered occurrence.
    if (seen.has(chapterId)) continue;
    seen.add(chapterId);
    uniqueItems.push(chapter);
  }

  const numberCounts = new Map();
  for (const chapter of uniqueItems) {
    const number = String(chapter?.number ?? "").trim();
    if (number) numberCounts.set(number, (numberCounts.get(number) || 0) + 1);
  }

  const chapters = [];
  for (const chapter of uniqueItems) {
    const chapterId = positiveInteger(chapter?.id);
    const rawNumber = String(chapter?.number ?? "").trim();
    const numericNumber = Number(rawNumber);
    const chapterName = String(chapter?.name || "").trim();
    const chapterType = String(chapter?.type || "").trim().toLowerCase();
    const language = String(chapter?.language || identity.language).toLowerCase();
    if (language !== identity.language) {
      throw new Error("MangaFire returned a chapter in the wrong language");
    }
    const hasNumberVariants = rawNumber && (numberCounts.get(rawNumber) || 0) > 1;
    const typeLabel = hasNumberVariants && chapterType
      ? chapterType.charAt(0).toUpperCase() + chapterType.slice(1)
      : "";
    const title = [
      rawNumber ? `Chapter ${rawNumber}` : "Chapter",
      chapterName,
      typeLabel,
    ].filter(Boolean).join(" · ");
    const createdAt = Number(chapter?.createdAt);
    chapters.push({
      title,
      link: `mangafire-chapter:${chapterId}:${identity.key}:${identity.language}`,
      description: Number.isFinite(createdAt) && createdAt > 0
        ? new Date(createdAt * 1000).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : undefined,
      number: Number.isFinite(numericNumber) ? numericNumber : undefined,
      chapterId,
      publishedAt: Number.isFinite(createdAt) && createdAt > 0
        ? createdAt
        : undefined,
      readerDirection: "adaptive",
      viewerUrl: `${BASE}/title/${identity.key}/chapter/${chapterId}`,
      contentKind: "manga-chapter",
    });
  }
  return chapters;
};
