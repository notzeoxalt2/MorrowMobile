const BASE = "https://mangaplus.shueisha.co.jp";
const API = "https://jumpg-webapi.tokyo-cdn.com/api";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";
const LANGUAGES = [
  {code: "eng", iso: "en", label: "English"},
  {code: "spa", iso: "es", label: "Spanish"},
  {code: "fre", iso: "fr", label: "French"},
  {code: "ind", iso: "id", label: "Indonesian"},
  {code: "por", iso: "pt", label: "Portuguese (Brazil)"},
  {code: "rus", iso: "ru", label: "Russian"},
  {code: "tha", iso: "th", label: "Thai"},
  {code: "ger", iso: "de", label: "German"},
  {code: "ita", iso: "it", label: "Italian"},
  {code: "vie", iso: "vi", label: "Vietnamese"},
];

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

function titleIdFromLink(link) {
  const match = String(link || "").match(/mangaplus\.shueisha\.co\.jp\/titles\/(\d+)/i);
  const id = Number(match?.[1] || 0);
  if (!id) throw new Error("Invalid MANGA Plus title link");
  return id;
}

function titleFrom(entry) {
  const title = nested(entry);
  return {
    id: integer(title, 1),
    name: string(title, 2).trim(),
    author: string(title, 3).trim(),
    portrait: officialAsset(string(title, 4)),
    landscape: officialAsset(string(title, 5)),
    languageIndex: integer(title, 7),
  };
}

async function titleDetail(titleId, providerContext) {
  const response = await providerContext.axios.get(`${API}/title_detailV3?title_id=${titleId}&clang=eng`, {
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
  if (!entry) throw new Error("MANGA Plus returned no title details");
  return nested(entry);
}

function languageLinks(detail, currentTitleId, currentLanguageIndex) {
  const rows = (detail[27] || []).map((entry) => {
    const language = nested(entry);
    const titleId = integer(language, 1);
    const languageIndex = integer(language, 2);
    const known = LANGUAGES[languageIndex] || LANGUAGES[0];
    return titleId ? {
      title: known.label,
      episodesLink: `mangaplus-title:${titleId}:${known.code}`,
      selected: titleId === currentTitleId,
      languageCode: known.iso,
      providerLanguageCode: known.code,
      contentKind: "manga-chapters",
      navigationKind: "language",
    } : null;
  }).filter(Boolean);
  const currentLanguage = LANGUAGES[currentLanguageIndex] || LANGUAGES[0];
  if (!rows.some((row) => row.episodesLink === `mangaplus-title:${currentTitleId}:${currentLanguage.code}`) && currentTitleId) {
    rows.unshift({
      title: currentLanguage.label,
      episodesLink: `mangaplus-title:${currentTitleId}:${currentLanguage.code}`,
      selected: true,
      languageCode: currentLanguage.iso,
      providerLanguageCode: currentLanguage.code,
      contentKind: "manga-chapters",
      navigationKind: "language",
    });
  }
  if (!rows.some((row) => row.selected) && rows.length) rows[0].selected = true;
  return rows;
}

exports.getMeta = async ({link, providerContext}) => {
  const requestedTitleId = titleIdFromLink(link);
  const detail = await titleDetail(requestedTitleId, providerContext);
  const titleEntry = first(detail, 1);
  if (!titleEntry) throw new Error("MANGA Plus returned no canonical title identity");
  const title = titleFrom(titleEntry);
  if (title.id !== requestedTitleId || !title.name) {
    throw new Error("MANGA Plus returned metadata for a different title");
  }
  const tags = (detail[31] || []).map((entry) => string(nested(entry), 1).trim()).filter(Boolean);
  const titleImage = officialAsset(string(detail, 2));
  const officialBackground = officialAsset(string(detail, 4));
  // Keep card and hero semantics separate. `titleImage` is a generic main
  // image and is portrait artwork for a number of titles; it must never be
  // promoted into the full-width hero even when a CDN transform gives it a
  // wide canvas. Only provider-declared background/landscape fields enter the
  // candidate list, and MetaPage still natural-dimension probes each one.
  const backgroundCandidates = [officialBackground, title.landscape]
    .filter((value, index, values) => value && values.indexOf(value) === index);
  const language = LANGUAGES[title.languageIndex] || LANGUAGES[0];
  return {
    title: title.name,
    image: titleImage || title.portrait,
    portraitImage: title.portrait || titleImage,
    backdrop: backgroundCandidates[0] || "",
    backgroundCandidates,
    readerBackdrop: backgroundCandidates[0] || "",
    synopsis: string(detail, 3).trim(),
    imdbId: "",
    type: "manga",
    tags,
    cast: title.author ? [title.author] : [],
    author: title.author,
    rating: "",
    languageCode: language.iso,
    providerLanguageCode: language.code,
    providerUrl: `${BASE}/titles/${title.id}`,
    titleId: title.id,
    viewCount: integer(detail, 18),
    nextChapterAt: integer(detail, 5) || undefined,
    viewingPeriodDescription: string(detail, 7).trim(),
    readerTheme: {background: "#111111", surface: "#1b1b1b"},
    linkList: languageLinks(detail, title.id, title.languageIndex),
  };
};
