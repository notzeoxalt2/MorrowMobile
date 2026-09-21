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

function officialAsset(value) {
  try {
    const url = new URL(String(value || ""));
    return /^jumpg-assets\d*\.tokyo-cdn\.com$/i.test(url.hostname) && url.protocol === "https:" ? url.href : "";
  } catch { return ""; }
}

function identityFromLink(value) {
  const match = String(value || "").match(/^mangaplus-title:(\d+):([a-z]{3})$/i);
  const titleId = Number(match?.[1] || 0);
  const language = String(match?.[2] || "eng").toLowerCase();
  if (!titleId || !LANGUAGE_CODES.includes(language)) throw new Error("Invalid MANGA Plus chapter-list identity");
  return {titleId, language};
}

function chapterFrom(entry) {
  const chapter = nested(entry);
  return {
    titleId: integer(chapter, 1),
    chapterId: integer(chapter, 2),
    name: string(chapter, 3).trim(),
    subTitle: string(chapter, 4).trim(),
    thumbnail: officialAsset(string(chapter, 5)),
    startsAt: integer(chapter, 6),
    endsAt: integer(chapter, 7),
    verticalOnly: Boolean(integer(chapter, 9)),
    horizontalOnly: Boolean(integer(chapter, 12)),
    viewCount: integer(chapter, 13),
    commentCount: integer(chapter, 14),
  };
}

async function titleDetail(titleId, language, providerContext) {
  const response = await providerContext.axios.get(`${API}/title_detailV3?title_id=${titleId}&clang=${language}`, {
    timeout: 15000,
    forceDoh: true,
    responseType: "arraybuffer",
    headers: {
      Accept: "application/x-protobuf",
      Origin: BASE,
      Referer: `${BASE}/titles/${titleId}`,
      "SESSION-TOKEN": sessionToken(),
      "User-Agent": USER_AGENT,
    },
  });
  const root = messageOf(response?.data);
  if (first(root, 2)) throw new Error("This MANGA Plus title is not available in the current region");
  const success = first(root, 1) ? nested(first(root, 1)) : {};
  const entry = first(success, 8);
  if (!entry) throw new Error("MANGA Plus returned no chapter list");
  return nested(entry);
}

function canonicalChapters(detail) {
  const entries = [];
  // Newer responses can provide a complete V2 list directly.
  if (detail[38]?.length) entries.push(...detail[38]);
  else if (detail[28]?.length) {
    // Chapter groups deliberately contain only chapters that the official
    // service exposes. A sparse middle range must remain sparse; do not invent
    // IDs for the hidden chapters between its boundary rows.
    for (const groupEntry of detail[28]) {
      const group = nested(groupEntry);
      entries.push(...(group[2] || []), ...(group[3] || []), ...(group[4] || []));
    }
  } else entries.push(...(detail[9] || []), ...(detail[10] || []));

  const seen = new Set();
  const now = Math.floor(Date.now() / 1000);
  return entries.map(chapterFrom).filter((chapter) => {
    if (!chapter.chapterId || seen.has(chapter.chapterId)) return false;
    seen.add(chapter.chapterId);
    if (chapter.startsAt && chapter.startsAt > now) return false;
    if (chapter.endsAt && chapter.endsAt <= now) return false;
    return true;
  });
}

function numericChapter(name, fallback) {
  const match = String(name || "").match(/(?:#|chapter\s*)(\d+(?:\.\d+)?)/i);
  const number = Number(match?.[1]);
  return Number.isFinite(number) ? number : fallback;
}

exports.getEpisodes = async ({url, providerContext}) => {
  const identity = identityFromLink(url);
  const detail = await titleDetail(identity.titleId, identity.language, providerContext);
  const canonicalTitle = first(detail, 1) ? nested(first(detail, 1)) : {};
  if (integer(canonicalTitle, 1) !== identity.titleId) {
    throw new Error("MANGA Plus returned chapters for a different title");
  }
  const chapters = canonicalChapters(detail);
  if (!chapters.length) throw new Error("MANGA Plus currently exposes no readable chapters for this title");
  return chapters.map((chapter, index) => ({
    title: `${chapter.name || `Chapter ${index + 1}`}${chapter.subTitle ? ` · ${chapter.subTitle}` : ""}`,
    link: `mangaplus-chapter:${chapter.chapterId}:${identity.titleId}:${identity.language}`,
    image: chapter.thumbnail,
    description: [
      chapter.startsAt ? new Date(chapter.startsAt * 1000).toLocaleDateString("en-US", {year: "numeric", month: "short", day: "numeric"}) : "",
      chapter.viewCount ? `${chapter.viewCount.toLocaleString("en-US")} views` : "",
    ].filter(Boolean).join(" · "),
    number: numericChapter(chapter.name, index + 1),
    chapterId: chapter.chapterId,
    publishedAt: chapter.startsAt || undefined,
    expiresAt: chapter.endsAt ? chapter.endsAt * 1000 : undefined,
    viewCount: chapter.viewCount || undefined,
    commentCount: chapter.commentCount || undefined,
    readerDirection: chapter.verticalOnly ? "vertical" : chapter.horizontalOnly ? "horizontal" : "adaptive",
    viewerUrl: `${BASE}/viewer/${chapter.chapterId}`,
    contentKind: "manga-chapter",
  }));
};
