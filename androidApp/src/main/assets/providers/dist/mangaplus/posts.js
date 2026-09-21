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

function titleFrom(entry) {
  const title = nested(entry);
  const id = integer(title, 1);
  const name = string(title, 2).trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    author: string(title, 3).trim(),
    portrait: officialAsset(string(title, 4)),
    landscape: officialAsset(string(title, 5)),
    viewCount: integer(title, 6),
    languageIndex: integer(title, 7),
  };
}

function postFromTitle(title, extras = {}) {
  return {
    title: title.name,
    link: `${BASE}/titles/${title.id}`,
    image: title.portrait || title.landscape,
    author: title.author,
    languageCode: LANGUAGE_CODES[title.languageIndex] || "eng",
    backdrop: title.landscape,
    ...extras,
  };
}

async function apiSuccess(path, params, signal, providerContext) {
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
  const response = await providerContext.axios.get(`${API}${path}${query.size ? `?${query}` : ""}`, {
    signal,
    timeout: 15000,
    forceDoh: true,
    responseType: "arraybuffer",
    headers: {
      Accept: "application/x-protobuf",
      Origin: BASE,
      Referer: `${BASE}/`,
      "SESSION-TOKEN": sessionToken(),
      "User-Agent": USER_AGENT,
    },
  });
  const root = messageOf(response?.data);
  if (first(root, 2)) throw new Error("MANGA Plus did not make this catalog available");
  const success = first(root, 1);
  if (!success) throw new Error("MANGA Plus returned no catalog payload");
  return nested(success);
}

function parseFilter(value) {
  const parts = String(value || "updates:eng").split(":");
  const language = LANGUAGE_CODES.includes(parts.at(-1)) ? parts.pop() : "eng";
  return {kind: parts[0] || "updates", subtype: parts[1] || "", language, languageIndex: LANGUAGE_CODES.indexOf(language)};
}

function latestPosts(success, languageIndex) {
  const homeEntry = first(success, 38);
  if (!homeEntry) return [];
  const home = nested(homeEntry);
  const posts = [];
  for (const groupEntry of home[2] || []) {
    const group = nested(groupEntry);
    const groupName = string(group, 1).trim();
    const latest24Hours = /latest|24/i.test(groupName);
    if (!latest24Hours) continue;
    for (const originalEntry of group[2] || []) {
      const original = nested(originalEntry);
      for (const updatedEntry of original[3] || []) {
        const updated = nested(updatedEntry);
        const titleEntry = first(updated, 1);
        if (!titleEntry) continue;
        const title = titleFrom(titleEntry);
        if (!title || title.languageIndex !== languageIndex) continue;
        const chapterId = integer(updated, 2);
        const chapterName = string(updated, 3).trim();
        const chapterTitle = string(updated, 4).trim();
        posts.push(postFromTitle(title, {
          latest24Hours,
          latestChapterId: chapterId || undefined,
          chapterName,
          chapterTitle,
          chapterLink: chapterId ? `${BASE}/viewer/${chapterId}` : "",
          viewCount: integer(original, 4),
          updatedAt: integer(original, 6) || undefined,
        }));
      }
    }
  }
  return posts;
}

function rankingPosts(success, languageIndex) {
  const rankingEntry = first(success, 37);
  if (!rankingEntry) return [];
  const ranking = nested(rankingEntry);
  return (ranking[3] || []).map((groupEntry, index) => {
    const group = nested(groupEntry);
    const selected = (group[2] || []).map(titleFrom).find((title) => title?.languageIndex === languageIndex);
    return selected ? postFromTitle(selected, {rank: index + 1, viewCount: integer(group, 3)}) : null;
  }).filter(Boolean);
}

function allPosts(success, languageIndex) {
  const allEntry = first(success, 25);
  if (!allEntry) return [];
  const all = nested(allEntry);
  return (all[1] || []).map((groupEntry) => {
    const group = nested(groupEntry);
    const selected = (group[2] || []).map(titleFrom).find((title) => title?.languageIndex === languageIndex);
    return selected ? postFromTitle(selected) : null;
  }).filter(Boolean);
}

function uniquePage(items, page) {
  const seen = new Set();
  const unique = items.filter((item) => item?.link && !seen.has(item.link) && seen.add(item.link));
  const start = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * 40);
  return unique.slice(start, start + 40);
}

exports.getPosts = async ({filter, page = 1, signal, providerContext}) => {
  const parsed = parseFilter(filter);
  if (parsed.kind === "updates") {
    const success = await apiSuccess("/web/web_homeV4", {
      lang: parsed.language,
      viewer_mode: "vertical",
      clang: parsed.language,
    }, signal, providerContext);
    return uniquePage(latestPosts(success, parsed.languageIndex), page);
  }
  if (parsed.kind === "ranking") {
    const subtype = ["hottest", "trending", "completed"].includes(parsed.subtype) ? parsed.subtype : "hottest";
    const success = await apiSuccess("/title_list/rankingV2", {
      lang: parsed.language,
      type: subtype,
      clang: parsed.language,
    }, signal, providerContext);
    return uniquePage(rankingPosts(success, parsed.languageIndex), page);
  }
  const success = await apiSuccess("/title_list/allV2", {}, signal, providerContext);
  return uniquePage(allPosts(success, parsed.languageIndex), page);
};

exports.getSearchPosts = async ({searchQuery, page = 1, signal, providerContext}) => {
  const query = String(searchQuery || "").trim().toLocaleLowerCase();
  if (!query) return [];
  const success = await apiSuccess("/title_list/allV2", {}, signal, providerContext);
  const matches = allPosts(success, 0).filter((post) =>
    `${post.title} ${post.author || ""}`.toLocaleLowerCase().includes(query),
  );
  return uniquePage(matches, page);
};
