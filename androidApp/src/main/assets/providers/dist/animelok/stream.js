const BASE = "https://animelok.net";
const VIDNEST_API = "https://new.vidnest.fun";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:137.0) Gecko/20100101 Firefox/137.0";
const VIDNEST_ALPHABET = "RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/=";
const VIDNEST_MEDIA_HEADERS = {
  "User-Agent": UA,
  Accept: "*/*",
  "Accept-Language": "en-US,en;q=0.5",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "cross-site",
  Origin: "https://megaplay.buzz",
  Referer: "https://megaplay.buzz/",
};

function dataOf(response) {
  if (typeof response?.data === "string") return JSON.parse(response.data);
  return response?.data || {};
}

function languageCode(value) {
  const language = String(value || "").trim().toLowerCase();
  const known = {
    arabic: "ar", bengali: "bn", chinese: "zh", czech: "cs", danish: "da",
    dutch: "nl", english: "en", finnish: "fi", french: "fr", german: "de",
    greek: "el", hindi: "hi", indonesian: "id", italian: "it", japanese: "ja",
    kannada: "kn", korean: "ko", malayalam: "ml", norwegian: "no", polish: "pl",
    portuguese: "pt", romanian: "ro", russian: "ru", spanish: "es", swedish: "sv",
    tamil: "ta", telugu: "te", thai: "th", turkish: "tr", ukrainian: "uk",
    vietnamese: "vi",
  };
  for (const [name, code] of Object.entries(known)) {
    if (language === name || language.startsWith(`${name} `) || language.startsWith(`${name}:`)) return code;
  }
  return "en";
}

function subtitlesFrom(episode, tracks = [], trackHeaders) {
  const sourceTracks = Array.isArray(tracks) ? tracks : [];
  const candidates = sourceTracks.length
    ? sourceTracks
    : (Array.isArray(episode?.subtitles) ? episode.subtitles : []);
  return candidates
    .map((track) => ({
      title: track?.name || track?.label || track?.lang || "Subtitle",
      language: languageCode(track?.name || track?.label || track?.lang),
      type: /\.srt(?:\?|$)/i.test(track?.url || track?.file || track?.src || "") ? "text/srt" : "text/vtt",
      uri: track?.url || track?.file || track?.src,
      ...(track?.headers || trackHeaders ? {headers: track?.headers || trackHeaders} : {}),
      ...(track?.verified === true ? {verified: true} : {}),
    }))
    .filter((track) => /^https?:/i.test(track.uri || ""))
    .filter((track, index, all) => all.findIndex((item) => item.uri === track.uri) === index);
}

async function verifiedVttTracks(tracks, headers, signal, ctx) {
  const candidates = (Array.isArray(tracks) ? tracks : [])
    .filter((track) => /^https?:/i.test(track?.url || track?.file || track?.src || ""))
    .filter((track) => {
      const uri = track?.url || track?.file || track?.src || "";
      return /\.vtt(?:$|[?#])/i.test(uri) || /captions?|subtitles?/i.test(track?.kind || "");
    });
  const results = await Promise.all(candidates.map(async (track) => {
    const uri = track?.url || track?.file || track?.src;
    try {
      const response = await ctx.axios.get(uri, {
        signal,
        timeout: 4500,
        forceDoh: true,
        responseType: "text",
        headers,
      });
      if (!/^\uFEFF?\s*WEBVTT(?:\s|$)/i.test(String(response?.data || ""))) return undefined;
      return {...track, headers, verified: true};
    } catch {
      return undefined;
    }
  }));
  return results.filter(Boolean);
}

function qualityOf(value) {
  return String(value || "").match(/2160|1080|720|480|360/)?.[0];
}

function sourceId(category, label, variant = "auto") {
  return ["animelok", category, label, variant]
    .map((part) => String(part || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean)
    .join(":");
}

function expiryOf(value) {
  try {
    const url = new URL(value);
    const raw = Number(url.searchParams.get("expires") || url.searchParams.get("exp") || url.searchParams.get("kx"));
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    return raw > 10_000_000_000 ? raw : raw * 1000;
  } catch {
    return undefined;
  }
}

function categoryOf(server) {
  const languages = (Array.isArray(server?.languages) ? server.languages : [server?.languages])
    .map((language) => String(language || "").trim().toUpperCase())
    .filter(Boolean);
  const text = `${server?.name || ""} ${server?.tip || ""} ${languages.join(" ")}`;
  if (/multi/i.test(text) || new Set(languages).size > 1) return "multi";
  // AnimeLok currently has one stale internal "Kannada" row whose explicit
  // language is JAPANESE. Its language array, not its routing name, is factual.
  if (languages.some((language) => /ENGLISH|HINDI|TAMIL|TELUGU|MALAYALAM|BENGALI|KANNADA/.test(language))) return "dub";
  if (languages.some((language) => language === "JAPANESE")) return "sub";
  if (/dub|english|hindi|tamil|telugu|malayalam|bengali|kannada/i.test(text) && !/hard\s*sub|soft\s*sub/i.test(server?.tip || "")) return "dub";
  return "sub";
}

function displayLabel(server) {
  // `tip` is what AnimeLok shows in its source picker. `name` is frequently
  // just an internal key, such as anikoto-sub.
  if (String(server?.tip || "").trim()) return String(server.tip).trim();
  return String(server?.name || "").trim();
}

function languageLabelOf(server) {
  return [...new Set(
    (Array.isArray(server?.languages) ? server.languages : [server?.languages])
      .map((language) => String(language || "").trim().toUpperCase())
      .filter(Boolean),
  )].join(" / ");
}

function marker(value) {
  if (value === null || value === undefined || value === "") return undefined;
  return Number.isFinite(Number(value)) ? Number(value) : undefined;
}

function markerData(episode, payload = {}) {
  return {
    introStart: marker(payload?.intro?.start ?? payload?.introStart ?? episode?.introStart),
    introEnd: marker(payload?.intro?.end ?? payload?.introEnd ?? episode?.introEnd),
    outroStart: marker(payload?.outro?.start ?? payload?.outroStart ?? episode?.outroStart),
    outroEnd: marker(payload?.outro?.end ?? payload?.outroEnd ?? episode?.outroEnd),
  };
}

function sourceEntries(payload) {
  const raw = payload?.sources || payload?.videoSources || payload?.mediaSources?.sources;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object") {
    if (raw.file || raw.url || raw.src) return [raw];
    return Object.entries(raw).map(([label, source]) => {
      if (typeof source === "string") return {file: source, label};
      return {...source, label: source?.label || label};
    });
  }
  const direct = payload?.file || payload?.url || payload?.src || payload?.videoSource;
  return direct ? [{file: direct, label: payload?.label || "Auto"}] : [];
}

function directServerEntries(value) {
  const raw = String(value || "").trim();
  if (/^https?:\/\/[^\s]+\.(?:m3u8|mp4)(?:\?|$)/i.test(raw)) {
    return [{file: raw, label: "Auto"}];
  }
  if (!raw.startsWith("[") && !raw.startsWith("{")) return [];
  try {
    const decoded = JSON.parse(raw);
    return sourceEntries(
      Array.isArray(decoded) ? {sources: decoded} : decoded,
    );
  } catch {
    return [];
  }
}

function decodeVidNestPayload(value) {
  const encoded = String(value || "").replace(/\s+/g, "");
  const bytes = [];
  let buffer = 0;
  let bits = 0;
  for (const character of encoded) {
    const index = VIDNEST_ALPHABET.indexOf(character);
    if (index < 0) continue;
    if (index === 64) break;
    buffer = (buffer << 6) | index;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >>> bits) & 0xff);
      buffer &= bits ? (1 << bits) - 1 : 0;
    }
  }
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(bytes)));
}

const MD5_SHIFTS = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_CONSTANTS = Array.from(
  {length: 64},
  (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 0x100000000) >>> 0,
);

function rotateLeft(value, amount) {
  return ((value << amount) | (value >>> (32 - amount))) >>> 0;
}

function md5Hex(value) {
  const source = new TextEncoder().encode(String(value));
  const paddedLength = Math.ceil((source.length + 1 + 8) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(source);
  bytes[source.length] = 0x80;
  let bitLength = BigInt(source.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    bytes[paddedLength - 8 + index] = Number(bitLength & 0xffn);
    bitLength >>= 8n;
  }

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Uint32Array(16);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const base = offset + index * 4;
      words[index] = (
        bytes[base] |
        (bytes[base + 1] << 8) |
        (bytes[base + 2] << 16) |
        (bytes[base + 3] << 24)
      ) >>> 0;
    }
    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index += 1) {
      let f;
      let wordIndex;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }
      const nextD = d;
      d = c;
      c = b;
      const mixed = (a + f + MD5_CONSTANTS[index] + words[wordIndex]) >>> 0;
      b = (b + rotateLeft(mixed, MD5_SHIFTS[index])) >>> 0;
      a = nextD;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [0, 8, 16, 24].map((shift) => (word >>> shift) & 0xff))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function decryptAesCtrLatin1(value, secret) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("AES-CTR is unavailable in this runtime");
  const digest = md5Hex(secret);
  const keyBytes = new TextEncoder().encode(digest);
  const key = await subtle.importKey(
    "raw",
    keyBytes,
    {name: "AES-CTR"},
    false,
    ["decrypt"],
  );
  const encrypted = Uint8Array.from(
    String(value || ""),
    (character) => character.charCodeAt(0) & 0xff,
  );
  const decrypted = await subtle.decrypt(
    {
      name: "AES-CTR",
      counter: keyBytes.slice(0, 16),
      length: 128,
    },
    key,
    encrypted,
  );
  return new TextDecoder().decode(decrypted);
}

function safeDecodeComponent(value) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

function base64UrlAscii(value) {
  return btoa(String(value || ""))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function nativeStream({
  label,
  languageLabel,
  category,
  source,
  headers,
  episode,
  payload,
  videoTransform,
  subtitleHeaders,
}) {
  const link = source?.file || source?.url || source?.src;
  if (!/^https?:/i.test(link || "")) return undefined;
  const sourceQuality = source?.label || source?.quality || "Auto";
  const quality = qualityOf(sourceQuality);
  return {
    server: label,
    sourceLabel: label,
    sourceId: sourceId(category, label, `${languageLabel || "unknown"}-${sourceQuality}`),
    playbackMode: "native",
    health: "unchecked",
    languageCategory: category,
    languageLabel,
    link,
    expiresAt: expiryOf(link),
    type: isHlsLink(link) ? "m3u8" : "mp4",
    quality,
    headers,
    ...(videoTransform ? {videoTransform} : {}),
    subtitles: subtitlesFrom(
      episode,
      payload?.tracks || payload?.subtitles || payload?.captions,
      subtitleHeaders,
    ),
    ...markerData(episode, payload),
  };
}

function isHlsLink(link) {
  if (/\.m3u8(?:\?|$)/i.test(String(link || ""))) return true;
  try {
    return /\.m3u8(?:\?|$)/i.test(new URL(String(link)).searchParams.get("url") || "");
  } catch {
    return false;
  }
}

async function extractAbyss(server, signal, ctx, episode) {
  const rawUrl = String(server?.url || "");
  let slug;
  try {
    slug = new URL(rawUrl).pathname.split("/").filter(Boolean).at(-1);
  } catch {
    return [];
  }
  if (!slug || !/^[A-Za-z0-9_-]+$/.test(slug)) return [];

  const pageUrl = `https://abyssplayer.com/${slug}`;
  const response = await ctx.axios.get(pageUrl, {
    signal,
    timeout: 6500,
    forceDoh: true,
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      Referer: `${BASE}/`,
    },
  });
  const html = String(response?.data || "");
  const encoded = html.match(/\bconst\s+datas\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!encoded) return [];

  const envelope = JSON.parse(atob(encoded));
  if (!envelope?.media || !envelope?.user_id || !envelope?.slug || !envelope?.md5_id) {
    return [];
  }
  const decrypted = await decryptAesCtrLatin1(
    envelope.media,
    `${envelope.user_id}:${envelope.slug}:${envelope.md5_id}`,
  );
  const media = JSON.parse(decrypted);
  const sources = (Array.isArray(media?.mp4?.sources) ? media.mp4.sources : [])
    .filter((candidate) =>
      candidate?.status !== false &&
      /^https:\/\//i.test(String(candidate?.url || "")) &&
      String(candidate?.path || "").trim() &&
      /^h264$/i.test(String(candidate?.codec || "h264")),
    )
    .sort((left, right) =>
      ((Number(qualityOf(right?.label)) || Number(right?.res_id) || 0) -
        (Number(qualityOf(left?.label)) || Number(left?.res_id) || 0)) ||
      (Number(right?.size || 0) - Number(left?.size || 0)),
    )
    // Abyss can advertise two encodes at the same visible resolution. Keep
    // the largest complete H.264 file for each real quality, while retaining
    // every distinct 360/720/1080 option for MORROW's quality selector.
    .filter((candidate, index, all) => {
      const quality = qualityOf(candidate?.label) || String(candidate?.res_id || "");
      return all.findIndex((item) =>
        (qualityOf(item?.label) || String(item?.res_id || "")) === quality
      ) === index;
    });
  if (!sources.length) return [];

  const languageLabel = languageLabelOf(server);
  const category = categoryOf(server);
  const label = displayLabel(server) || String(server?.name || "").trim() || "Abyess";
  const tracks = (Array.isArray(envelope?.config?.subtitles) ? envelope.config.subtitles : [])
    .map((subtitle) => ({
      label: safeDecodeComponent(subtitle?.lang || subtitle?.label || "Subtitle"),
      file: subtitle?.slug && subtitle?.type
        ? `https://cdn.iamcdn.net/subtitle/${encodeURIComponent(envelope.md5_id)}/${encodeURIComponent(subtitle.slug)}.${encodeURIComponent(subtitle.type)}`
        : subtitle?.url,
    }))
    .filter((track) => /^https?:/i.test(track.file || ""));
  return sources.map((source) => {
    const filename = String(source.path).split("/").filter(Boolean).at(-1);
    if (!filename || !/^[A-Za-z0-9._-]+$/.test(filename)) return undefined;
    const directUrl =
      `${String(source.url).replace(/\/+$/, "")}/` +
      String(source.path).replace(/^\/+/, "");
    const stream = nativeStream({
      label,
      languageLabel,
      category,
      source: {
        file: directUrl,
        label: source.label || `${source.res_id || ""}p`,
      },
      headers: {
        "User-Agent": UA,
        Accept: "*/*",
        Origin: "https://abyssplayer.com",
        Referer: `${pageUrl}/`,
        // Consumed only by MORROW's localhost/native proxy. Abyss encrypts
        // exactly the first 64 KiB with a filename-derived AES-CTR key.
        "X-Morrow-Media-Transform": `abyss-mp4:${base64UrlAscii(filename)}`,
      },
      episode,
      payload: {tracks},
    });
    if (!stream) return undefined;
    // AnimeLok intentionally exposes more than one "Abyess" button for some
    // languages. Preserve the provider row identity (and its quality) instead
    // of collapsing two factual buttons that happen to share the same label.
    stream.sourceId = sourceId(
      category,
      label,
      `${languageLabel || "unknown"}-${source.label || source.res_id || "auto"}-${server?.id || slug}`,
    );
    stream.serverLabel = displayLabel(server) || "Abyess";
    stream.selectorKind = "server";
    stream.labelProvenance = "provider-api";
    return stream;
  }).filter(Boolean);
}

async function isUsableNativeSource(source, headers, signal, ctx) {
  const link = source?.file || source?.url || source?.src;
  if (!/^https?:/i.test(link || "")) return false;
  if (!/\.m3u8(?:\?|$)/i.test(link)) return /\.mp4(?:\?|$)/i.test(link);
  try {
    const response = await ctx.axios.get(link, {
      signal,
      timeout: 4500,
      forceDoh: true,
      headers,
    });
    return /^\s*#EXTM3U\b/.test(String(response?.data || ""));
  } catch {
    return false;
  }
}

async function extractMegaPlayFamily({
  label,
  languageLabel,
  category,
  wrapperUrl,
  signal,
  ctx,
  episode,
}) {
  const origin = new URL(wrapperUrl).origin;
  const pageHeaders = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    Referer: `${BASE}/`,
  };
  const page = await ctx.axios.get(wrapperUrl, {
    signal,
    timeout: 4500,
    forceDoh: true,
    headers: pageHeaders,
  });
  const html = String(page?.data || "");
  const playerId = html.match(/\bdata-id=["']([^"']+)["']/i)?.[1];
  if (!playerId || /Error\s*Code\s*410/i.test(html)) return [];

  const ajaxHeaders = {
    "User-Agent": UA,
    Accept: "application/json, text/javascript, */*; q=0.01",
    "X-Requested-With": "XMLHttpRequest",
    Origin: origin,
    Referer: wrapperUrl,
  };
  const response = await ctx.axios.get(
    `${origin}/stream/getSources?id=${encodeURIComponent(playerId)}`,
    {signal, timeout: 4500, forceDoh: true, headers: ajaxHeaders},
  );
  const payload = dataOf(response);
  const mediaHeaders = {
    "User-Agent": UA,
    Accept: "*/*",
    Origin: origin,
    // MegaPlay's media edge rejects the full /stream/ani/... player URL as
    // a referer even though that same URL is required by getSources. Its
    // official player requests HLS media from the site root.
    Referer: `${origin}/`,
  };
  const playbackHeaders = {
    ...mediaHeaders,
    // MegaPlay wraps every MPEG-TS segment in a one-pixel PNG envelope.
    // MORROW's native/local media proxy removes that envelope before the
    // demuxer sees it; this is a byte transport repair, not a visual crop.
    "X-Morrow-Media-Transform": "png-ts",
  };
  const candidates = [];
  for (const source of sourceEntries(payload)) {
    if (!await isUsableNativeSource(source, mediaHeaders, signal, ctx)) continue;
    const stream = nativeStream({
      label,
      languageLabel,
      category,
      source,
      headers: playbackHeaders,
      episode,
      payload,
    });
    if (stream) candidates.push(stream);
  }
  return candidates;
}

async function extractVidMaster({
  anilistId,
  episodeNumber,
  variant,
  languageLabel,
  category,
  signal,
  ctx,
  episode,
}) {
  const wrapperUrl = `https://vidnest.fun/animepahe/${anilistId}/${episodeNumber}/${variant}`;
  const response = await ctx.axios.get(
    `${VIDNEST_API}/hianime/anime/${anilistId}/${episodeNumber}/${variant}`,
    {
      signal,
      timeout: 5000,
      forceDoh: true,
      headers: {
        "User-Agent": UA,
        Accept: "application/json, text/plain, */*",
        Origin: "https://vidnest.fun",
        Referer: wrapperUrl,
      },
    },
  );
  const outer = dataOf(response);
  let payload = outer;
  if (outer?.encrypted === true && typeof outer.data === "string") {
    payload = decodeVidNestPayload(outer.data);
  } else if (outer?.data && typeof outer.data === "object") {
    payload = outer.data;
  }
  const verifiedTracks = await verifiedVttTracks(
    payload?.tracks || payload?.subtitles || payload?.captions,
    VIDNEST_MEDIA_HEADERS,
    signal,
    ctx,
  );
  const sourcePayload = {
    ...payload,
    tracks: verifiedTracks,
    subtitles: undefined,
    captions: undefined,
  };

  const candidates = [];
  for (const source of sourceEntries(sourcePayload)) {
    if (!await isUsableNativeSource(source, VIDNEST_MEDIA_HEADERS, signal, ctx)) continue;
    const directLink = source?.file || source?.url || source?.src;
    if (!/^https?:\/\//i.test(directLink || "")) continue;
    const stream = nativeStream({
      label: "VidMaster",
      languageLabel,
      category,
      // The upstream proxy rewrites the playlist but leaves the one-pixel PNG
      // envelope on each segment. Keep the factual provider manifest and let
      // MORROW's native/local proxy strip the envelope so audio, seeking and
      // the intrinsic video aspect ratio survive intact.
      source,
      headers: {
        ...VIDNEST_MEDIA_HEADERS,
        "X-Morrow-Media-Transform": "png-ts",
      },
      episode,
      payload: sourcePayload,
      subtitleHeaders: VIDNEST_MEDIA_HEADERS,
    });
    if (stream) candidates.push(stream);
  }
  return candidates;
}

async function extractMulti(url, label, languageLabel, category, signal, ctx, episode) {
  const id = String(url).match(/\/video\/([^/?#]+)/)?.[1];
  if (!id) return [];
  const origin = new URL(url).origin;
  const response = await ctx.axios.post(
    `${origin}/player/index.php?data=${encodeURIComponent(id)}&do=getVideo`,
    `hash=${encodeURIComponent(id)}&r=${encodeURIComponent(BASE + "/")}`,
    {
      signal,
      timeout: 4500,
      forceDoh: true,
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
        "User-Agent": UA,
        Referer: url,
        Origin: origin,
      },
    },
  );
  const payload = dataOf(response);
  const mediaHeaders = {
    "User-Agent": UA,
    Accept: "*/*",
    Referer: url,
    Origin: origin,
  };
  const candidates = [];
  for (const source of sourceEntries(payload)) {
    if (!await isUsableNativeSource(source, mediaHeaders, signal, ctx)) continue;
    const stream = nativeStream({
      label,
      languageLabel,
      category,
      source,
      headers: mediaHeaders,
      episode,
      payload,
    });
    if (stream) candidates.push(stream);
  }
  return candidates;
}

exports.getStream = async ({link, signal, providerContext}) => {
  const parsed = new URL(link);
  const match = parsed.pathname.match(/\/api\/anime\/([^/]+)\/episodes\/(\d+)/);
  if (!match) throw new Error("AnimeLok episode link is invalid");
  const slug = decodeURIComponent(match[1]);
  const episodeNumber = Number(match[2]);
  const response = await providerContext.axios.get(
    `${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/${episodeNumber}`,
    {
      signal,
      timeout: 8000,
      forceDoh: true,
      headers: {
        Referer: `${BASE}/watch/${slug}`,
        Origin: BASE,
        "User-Agent": UA,
        Accept: "*/*",
      },
    },
  );
  const payload = dataOf(response);
  const episode = payload.episode;
  const anime = payload.anime || {};
  if (!episode) throw new Error("AnimeLok did not return episode server data");

  const episodeLanguages = new Set(
    [
      ...(Array.isArray(episode.languages) ? episode.languages : [episode.languages]),
      ...(Array.isArray(episode.servers) ? episode.servers : [])
        .flatMap((server) =>
          Array.isArray(server?.languages) ? server.languages : [server?.languages],
        ),
    ]
      .map((language) => String(language || "").trim().toUpperCase())
      .filter(Boolean),
  );
  const slugAnilistId = slug.match(/-(\d+)$/)?.[1];
  const anilistId = Number(anime.anilistId || parsed.searchParams.get("anilistId") || slugAnilistId);
  const number = Number(episode.number) || episodeNumber;
  const tasks = [];

  if (episode.hianimeId) {
    if (episodeLanguages.has("JAPANESE")) {
      tasks.push(
        extractMegaPlayFamily({
          label: "Vidstream",
          languageLabel: "JAPANESE",
          category: "sub",
          wrapperUrl: `https://vidwish.live/stream/s-2/${episode.hianimeId}/sub?autostart=false&lang=jap`,
          signal,
          ctx: providerContext,
          episode,
        }).catch(() => []),
      );
    }
    if (episodeLanguages.has("ENGLISH")) {
      tasks.push(
        extractMegaPlayFamily({
          label: "Vidstream",
          languageLabel: "ENGLISH",
          category: "dub",
          wrapperUrl: `https://vidwish.live/stream/s-2/${episode.hianimeId}/dub?autostart=false&lang=eng`,
          signal,
          ctx: providerContext,
          episode,
        }).catch(() => []),
      );
    }
  }

  if (Number.isFinite(anilistId) && anilistId > 0) {
    if (episodeLanguages.has("JAPANESE")) {
      tasks.push(
        extractMegaPlayFamily({
          label: "AniStream",
          languageLabel: "JAPANESE",
          category: "sub",
          wrapperUrl: `https://megaplay.buzz/stream/ani/${anilistId}/${number}/sub?autostart=false`,
          signal,
          ctx: providerContext,
          episode,
        }).catch(() => []),
      );
      tasks.push(
        extractVidMaster({
          anilistId,
          episodeNumber: number,
          variant: "sub",
          languageLabel: "JAPANESE",
          category: "sub",
          signal,
          ctx: providerContext,
          episode,
        }).catch(() => []),
      );
    }
    if (episodeLanguages.has("ENGLISH")) {
      tasks.push(
        extractMegaPlayFamily({
          label: "AniStream",
          languageLabel: "ENGLISH",
          category: "dub",
          wrapperUrl: `https://megaplay.buzz/stream/ani/${anilistId}/${number}/dub?autostart=false`,
          signal,
          ctx: providerContext,
          episode,
        }).catch(() => []),
      );
      tasks.push(
        extractVidMaster({
          anilistId,
          episodeNumber: number,
          variant: "dub",
          languageLabel: "ENGLISH",
          category: "dub",
          signal,
          ctx: providerContext,
          episode,
        }).catch(() => []),
      );
    }
  }

  for (const server of episode.servers || []) {
    const url = String(server?.url || "");
    const category = categoryOf(server);
    const label = displayLabel(server);
    const languageLabel = languageLabelOf(server);
    if (!label) continue;

    const directEntries = directServerEntries(url);
    if (directEntries.length) {
      const headers = {
        Referer: `${BASE}/watch/${slug}`,
        Origin: BASE,
        "User-Agent": UA,
        Accept: "*/*",
      };
      for (const source of directEntries) {
        const stream = nativeStream({
          label,
          languageLabel,
          category,
          source,
          headers,
          episode,
          payload: {},
        });
        if (stream) {
          tasks.push(
            isUsableNativeSource(source, headers, signal, providerContext)
              .then((usable) => usable ? [stream] : [])
              .catch(() => []),
          );
        }
      }
      continue;
    }

    if (!/^https?:/i.test(url)) continue;

    if (/^https?:\/\/(?:short\.icu|abyssplayer\.com)\//i.test(url) || /^abyess$/i.test(String(server?.tip || ""))) {
      tasks.push(
        extractAbyss(server, signal, providerContext, episode).catch(() => []),
      );
      continue;
    }

    if (/\/video\/[^/?#]+/i.test(url)) {
      tasks.push(
        extractMulti(url, label, languageLabel, category, signal, providerContext, episode)
          .catch(() => []),
      );
      continue;
    }

  }

  const streams = (await Promise.all(tasks)).flat();
  const unique = streams.filter((stream, index, all) =>
    all.findIndex((item) => item.sourceId === stream.sourceId && item.link === stream.link) === index,
  );
  const verifiedEpisodeSubtitles = unique
    .flatMap((stream) => Array.isArray(stream.subtitles) ? stream.subtitles : [])
    .filter((track) => track?.verified === true)
    .filter((track, index, all) =>
      all.findIndex((candidate) => candidate.uri === track.uri) === index,
    );
  if (verifiedEpisodeSubtitles.length) {
    unique.forEach((stream) => {
      const ownVerified = (Array.isArray(stream.subtitles) ? stream.subtitles : [])
        .filter((track) => track?.verified === true);
      stream.subtitles = ownVerified.length ? ownVerified : verifiedEpisodeSubtitles;
    });
  }
  if (!unique.length) throw new Error("AnimeLok did not return a native stream for this episode");
  return unique;
};
