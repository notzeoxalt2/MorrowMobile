const BASE = "https://mangaplus.shueisha.co.jp";
const API = "https://jumpg-webapi.tokyo-cdn.com/api";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";
const LANGUAGE_CODES = ["eng", "spa", "fre", "ind", "por", "rus", "tha", "ger", "ita", "vie"];

function sessionToken() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function bytesOf(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (Array.isArray(value)) return Uint8Array.from(value);
  throw new Error("MANGA Plus returned a non-binary API response");
}

function readVarint(bytes, cursor) {
  let value = 0;
  let shift = 0;
  while (cursor.offset < bytes.length && shift <= 56) {
    const byte = bytes[cursor.offset++];
    value += (byte & 0x7f) * 2 ** shift;
    if ((byte & 0x80) === 0) return value;
    shift += 7;
  }
  throw new Error("Invalid MANGA Plus protobuf varint");
}

function messageOf(value) {
  const bytes = bytesOf(value);
  const cursor = {offset: 0};
  const fields = {};
  while (cursor.offset < bytes.length) {
    const tag = readVarint(bytes, cursor);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (!field) throw new Error("Invalid MANGA Plus protobuf field");
    let data;
    if (wire === 0) data = readVarint(bytes, cursor);
    else if (wire === 2) {
      const length = readVarint(bytes, cursor);
      const end = cursor.offset + length;
      if (end > bytes.length) throw new Error("Truncated MANGA Plus protobuf field");
      data = bytes.slice(cursor.offset, end);
      cursor.offset = end;
    } else if (wire === 1) {
      data = bytes.slice(cursor.offset, cursor.offset + 8);
      cursor.offset += 8;
    } else if (wire === 5) {
      data = bytes.slice(cursor.offset, cursor.offset + 4);
      cursor.offset += 4;
    } else throw new Error(`Unsupported MANGA Plus protobuf wire type ${wire}`);
    (fields[field] ||= []).push({wire, data});
  }
  return fields;
}

const nested = (entry) => messageOf(entry.data);
const first = (message, field) => message[field]?.[0];
const integer = (message, field) => Number(first(message, field)?.data || 0);
const string = (message, field) => {
  const entry = first(message, field);
  return entry?.wire === 2 ? new TextDecoder().decode(entry.data) : "";
};

function identityFromLink(value) {
  const match = String(value || "").match(/^mangaplus-chapter:(\d+):(\d+):([a-z]{3})$/i);
  const chapterId = Number(match?.[1] || 0);
  const titleId = Number(match?.[2] || 0);
  const language = String(match?.[3] || "eng").toLowerCase();
  if (!chapterId || !titleId || !LANGUAGE_CODES.includes(language)) {
    throw new Error("Invalid MANGA Plus chapter identity");
  }
  return {chapterId, titleId, language};
}

function officialPageUrl(value, identity) {
  try {
    const url = new URL(String(value || ""));
    const hostIsOfficial = /^jumpg-assets\d*\.tokyo-cdn\.com$/i.test(url.hostname);
    const pathPrefix = `/secure/title/${identity.titleId}/chapter/${identity.chapterId}/manga_page/`;
    return url.protocol === "https:" && hostIsOfficial && url.pathname.includes(pathPrefix) ? url.href : "";
  } catch { return ""; }
}

function officialArtwork(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" && /^jumpg-assets\d*\.tokyo-cdn\.com$/i.test(url.hostname) ? url.href : "";
  } catch { return ""; }
}

function expiresAtOf(urls) {
  const expiries = urls.map((value) => {
    try {
      const seconds = Number(new URL(value).searchParams.get("expires") || 0);
      return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 0;
    } catch { return 0; }
  }).filter(Boolean);
  return expiries.length ? Math.min(...expiries) : undefined;
}

function viewerArtwork(viewer) {
  const titleEntry = first(viewer, 18);
  if (!titleEntry) return {portrait: "", landscape: ""};
  const title = nested(titleEntry);
  return {
    portrait: officialArtwork(string(title, 4)),
    landscape: officialArtwork(string(title, 5)),
  };
}

async function viewerPayload(identity, signal, providerContext) {
  const viewerSessionToken = sessionToken();
  const query = new URLSearchParams({
    chapter_id: String(identity.chapterId),
    split: "yes",
    img_quality: "super_high",
  });
  const response = await providerContext.axios.get(`${API}/manga_viewer?${query}`, {
    signal,
    timeout: 15000,
    forceDoh: true,
    responseType: "arraybuffer",
    headers: {
      Accept: "application/x-protobuf",
      Origin: BASE,
      Referer: `${BASE}/viewer/${identity.chapterId}`,
      "SESSION-TOKEN": viewerSessionToken,
      "User-Agent": USER_AGENT,
    },
  });
  const root = messageOf(response?.data);
  if (first(root, 2)) throw new Error("This MANGA Plus chapter is not available in the current region");
  const success = first(root, 1) ? nested(first(root, 1)) : {};
  const viewerEntry = first(success, 10);
  if (!viewerEntry) throw new Error("MANGA Plus returned no official reader payload");
  return {viewer: nested(viewerEntry), viewerSessionToken};
}

function readerPages(viewer, identity) {
  const pages = [];
  let mangaPageIndex = 0;
  for (const pageEntry of viewer[1] || []) {
    const page = nested(pageEntry);
    const mangaEntry = first(page, 1);
    if (!mangaEntry) continue; // Ignore ads, banners, and the service's last-page cards.
    const manga = nested(mangaEntry);
    const url = officialPageUrl(string(manga, 1), identity);
    if (!url) continue;
    mangaPageIndex += 1;
    const decryptionKey = string(manga, 5).trim();
    const isProtected = Boolean(decryptionKey);
    const hasUsableKey = !isProtected || /^(?:[0-9a-f]{2})+$/i.test(decryptionKey);
    pages.push({
      index: mangaPageIndex,
      url,
      width: integer(manga, 2) || undefined,
      height: integer(manga, 3) || undefined,
      pageType: integer(manga, 4) || undefined,
      protected: isProtected,
      decryptionKey: isProtected && hasUsableKey ? decryptionKey : undefined,
      renderable: hasUsableKey,
    });
  }
  return pages;
}

exports.getChapter = async ({link, signal, providerContext}) => {
  const identity = identityFromLink(link);
  const {viewer, viewerSessionToken} = await viewerPayload(identity, signal, providerContext);
  const returnedChapterId = integer(viewer, 2);
  const returnedTitleId = integer(viewer, 9);
  if (returnedChapterId !== identity.chapterId || returnedTitleId !== identity.titleId) {
    throw new Error("MANGA Plus returned pages for a different chapter");
  }

  const pages = readerPages(viewer, identity);
  if (!pages.length) throw new Error("MANGA Plus returned no genuine manga pages for this chapter");
  if (pages.some((page) => !page.renderable)) {
    throw new Error("MANGA Plus did not return a usable key for every genuine manga page");
  }
  const officialViewerUrl = `${BASE}/viewer/${identity.chapterId}`;
  const protectedPageCount = pages.filter((page) => page.protected).length;
  const artwork = viewerArtwork(viewer);
  const reader = {
    mode: "vertical-scroll",
    officialViewerUrl,
    titleId: identity.titleId,
    chapterId: identity.chapterId,
    titleName: string(viewer, 5).trim(),
    chapterName: string(viewer, 6).trim(),
    language: string(viewer, 15).trim() || identity.language,
    direction: integer(viewer, 8) ? "vertical" : integer(viewer, 12) ? "horizontal" : "adaptive",
    startFromRight: Boolean(integer(viewer, 10)),
    background: "#111111",
    portraitImage: artwork.portrait,
    // Keep portrait and backdrop semantics separate. The consumer still
    // dimension-probes field 5 because live MANGA Plus payloads occasionally
    // put portrait/low-resolution assets there.
    backdrop: artwork.landscape || "",
    pages,
    pageCount: pages.length,
    protectedPageCount,
    requiresOfficialViewer: false,
  };

  return [{
    server: "MANGA Plus",
    selectorKind: "source",
    serverLabel: null,
    sourceLabel: "Official reader",
    labelProvenance: "provider-api",
    sourceId: `mangaplus:${identity.titleId}:chapter:${identity.chapterId}:${identity.language}`,
    languageCode: identity.language,
    playbackMode: "manga-reader",
    transport: "image-sequence",
    type: "manga",
    link: officialViewerUrl,
    health: "unchecked",
    headers: {
      Referer: officialViewerUrl,
      Origin: BASE,
      "SESSION-TOKEN": viewerSessionToken,
      "User-Agent": USER_AGENT,
    },
    expiresAt: expiresAtOf(pages.map((page) => page.url)),
    reader,
  }];
};

// ProviderManager currently invokes getStream for every provider. Keep that
// compatibility alias until the shared manga reader route calls getChapter.
exports.getStream = exports.getChapter;
