const BASE = "https://www.miruro.to";
const OBFUSCATION_KEY = Uint8Array.from("71951034f8fbcf53d89db52ceb3dc22c".match(/.{2}/g), (hex) => parseInt(hex, 16));

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unpack(value) {
  const raw = String(value).replace(/^miruro-source:/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function header(response, name) {
  return response.headers?.get?.(name) || response.headers?.[name] || response.headers?.[name.toLowerCase()] || "";
}

function decodePayload(data, obfuscated, providerContext) {
  if (!obfuscated) return typeof data === "string" ? JSON.parse(data) : data;
  const text = String(data || "");
  const raw = text.replace(/-/g, "+").replace(/_/g, "/");
  let bytes = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  if (String(obfuscated) === "2") {
    bytes = bytes.map((byte, index) => byte ^ OBFUSCATION_KEY[index % OBFUSCATION_KEY.length]);
  }
  return JSON.parse(new TextDecoder().decode(providerContext.gunzipSync(bytes)));
}

async function secureGet(path, query, signal, providerContext) {
  const response = await providerContext.axios.get(`${BASE}/api/secure/pipe?e=${encode({path, method: "GET", query, body: null})}`, {
    signal,
    timeout: 12000,
    responseType: "text",
    forceDoh: true,
    headers: {
      Accept: "application/json",
      Referer: `${BASE}/`,
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "same-origin",
    },
  });
  return decodePayload(response.data, header(response, "x-obfuscated"), providerContext);
}

async function withinSourceBudget(promise, milliseconds = 9000) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Miruro server timed out")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function explicitQuality(value) {
  const match = String(value || "").match(/(?:^|\D)(2160|1080|720|480|360)(?:p|\D|$)/i);
  return match?.[1];
}

function language(value) {
  const text = String(value || "").trim().toLowerCase();
  const aliases = {
    japanese: "ja", ja: "ja", jpn: "ja",
    english: "en", en: "en", eng: "en",
    hindi: "hi", hi: "hi", hin: "hi",
    tamil: "ta", ta: "ta", tam: "ta",
    telugu: "te", te: "te", tel: "te",
    spanish: "es", es: "es", spa: "es",
    arabic: "ar", ar: "ar", ara: "ar",
    french: "fr", fr: "fr", fre: "fr", fra: "fr",
    german: "de", de: "de", ger: "de", deu: "de",
    italian: "it", it: "it", ita: "it",
    portuguese: "pt", pt: "pt", por: "pt",
    russian: "ru", ru: "ru", rus: "ru",
    korean: "ko", ko: "ko", kor: "ko",
    chinese: "zh", zh: "zh", zho: "zh", chi: "zh",
    indonesian: "id", id: "id", ind: "id",
    thai: "th", th: "th", tha: "th",
    turkish: "tr", tr: "tr", tur: "tr",
    vietnamese: "vi", vi: "vi", vie: "vi",
  };
  if (aliases[text]) return aliases[text];
  const prefix = text.match(/^([a-z]{2})(?:[-_][a-z]{2})?$/)?.[1];
  if (prefix && Object.values(aliases).includes(prefix)) return prefix;
  return "und";
}

function trackType(track, uri) {
  const format = String(track?.format || track?.type || uri || "").toLowerCase();
  if (/\.srt(?:\?|$)|subrip/.test(format)) return "application/x-subrip";
  if (/\.ttml?(?:\?|$)|ttml/.test(format)) return "application/ttml+xml";
  return "text/vtt";
}

function tracks(...payloads) {
  const output = [];
  const seen = new Set();
  for (const payload of payloads) {
    const found = payload?.subtitles || payload?.tracks || payload?.captions || payload?.data?.subtitles || payload?.data?.tracks || [];
    for (const track of Array.isArray(found) ? found : []) {
      const uri = track?.file || track?.url || track?.src;
      if (!/^https?:/i.test(String(uri || "")) || seen.has(uri)) continue;
      seen.add(uri);
      const explicitTitle = String(track?.label || track?.name || track?.language || track?.lang || "Subtitles").trim();
      output.push({
        title: explicitTitle,
        language: language(track?.language || track?.lang || track?.label || track?.name),
        type: trackType(track, uri),
        uri,
      });
    }
  }
  return output;
}

function mergeTracks(...lists) {
  const seen = new Set();
  return lists.flat().filter((track) => {
    if (!track?.uri || seen.has(track.uri)) return false;
    seen.add(track.uri);
    return true;
  });
}

function segment(value) {
  if (!value) return null;
  let start = Number(Array.isArray(value) ? value[0] : value.start ?? value.startTime ?? value.from);
  let end = Number(Array.isArray(value) ? value[1] : value.end ?? value.endTime ?? value.to);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (end > 43200 && start >= 0) { start /= 1000; end /= 1000; }
  if (start < 0 || end <= start || end > 43200 || end - start > 600) return null;
  return {start, end};
}

function sourceItems(payload) {
  const output = [];
  const seen = new Set();
  const add = (value, forcedType) => {
    const source = typeof value === "string" ? {url: value, type: forcedType || ""} : value;
    if (!source || typeof source !== "object") return;
    const url = source.url || source.file || source.src || source.link;
    if (!/^https?:/i.test(String(url || ""))) return;
    const identity = `${String(source.type || forcedType || "").toLowerCase()}|${url}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    output.push({...source, url, type: source.type || forcedType || ""});
  };
  const visit = (value, depth = 0) => {
    if (depth > 5 || value == null) return;
    if (typeof value === "string") { add(value, ""); return; }
    if (Array.isArray(value)) { value.forEach((entry) => visit(entry, depth + 1)); return; }
    if (typeof value !== "object") return;
    add(value, "");
    for (const key of ["streams", "sources", "servers", "links", "videoSources"]) {
      if (value[key] != null) visit(value[key], depth + 1);
    }
  };
  visit(payload?.data ?? payload ?? {});
  return output;
}

function playbackKind(source) {
  const url = String(source?.url || "");
  const type = String(source?.type || source?.kind || "").trim().toLowerCase();
  if (/hls|m3u8|application\/x-mpegurl/.test(type) || /\.m3u8(?:\?|$)/i.test(url)) {
    return {type: "m3u8", transport: "hls"};
  }
  if (/^(?:dash|mpd|application\/dash\+xml)$/.test(type) || /\.mpd(?:\?|$)/i.test(url)) {
    return {type: "mpd", transport: "dash"};
  }
  if (/^(?:mp4|video|file|direct|progressive)$/.test(type) || /\.mp4(?:\?|$)|\/play\/[^?#]*video\.mp4(?:\?|$)/i.test(url)) {
    return {type: "mp4", transport: "progressive"};
  }
  return null;
}

function explicitTags(...values) {
  const tags = [];
  const add = (tag) => { if (tag && !tags.includes(tag)) tags.push(tag); };
  for (const value of values.flat(Infinity)) {
    const text = String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ");
    if (!text) continue;
    if (/(?:^|\s)(?:download|dl)(?:\s|$)/.test(text)) add("DL");
    if (/hard\s*sub|h\s*sub/.test(text)) add("H-SUB");
    if (/soft\s*sub|s\s*sub/.test(text)) add("S-SUB");
  }
  return tags;
}

function normalizeHeaders(...values) {
  const output = {};
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    for (const [name, headerValue] of Object.entries(value)) {
      if (headerValue == null || typeof headerValue === "object") continue;
      output[String(name)] = String(headerValue);
    }
  }
  return output;
}

function sourceExpiry(url) {
  try {
    const parsed = new URL(url);
    for (const key of ["expires", "expiry", "exp"]) {
      const raw = Number(parsed.searchParams.get(key));
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const milliseconds = raw < 10_000_000_000 ? raw * 1000 : raw;
      if (milliseconds > Date.now() - 60_000 && milliseconds < Date.now() + 365 * 24 * 60 * 60 * 1000) return milliseconds;
    }
  } catch (_) {}
  return undefined;
}

function stablePart(value) {
  return String(value || "source").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "source";
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === "string") return new TextEncoder().encode(value);
  return new Uint8Array();
}

function responsePrefix(response) {
  return new TextDecoder("utf-8", {fatal: false})
    .decode(toBytes(response?.data).subarray(0, 4096))
    .replace(/^\uFEFF/, "")
    .trimStart();
}

function isVerifiedMediaResponse(response, kind) {
  const bytes = toBytes(response?.data);
  const prefix = responsePrefix(response);
  const contentType = String(header(response, "content-type") || "").toLowerCase();
  if (/^(?:<!doctype\s+html|<html\b|<head\b|<body\b)/i.test(prefix) || /(?:text\/html|application\/xhtml)/.test(contentType)) {
    return false;
  }
  if (/^(?:\{|\[)/.test(prefix) || /(?:application\/json|\+json)/.test(contentType)) {
    return false;
  }
  if (kind.transport === "hls") return /^#EXTM3U\b/.test(prefix);
  if (kind.transport === "dash") return /<MPD(?:\s|>)/i.test(prefix);
  return bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70;
}

function absoluteMediaUrl(value, base) {
  try { return new URL(String(value || "").trim(), base).toString(); }
  catch (_) { return ""; }
}

function hlsVariantUrls(manifest, baseUrl) {
  const lines = String(manifest || "").split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].startsWith("#EXT-X-STREAM-INF")) continue;
    const bandwidth = Number(lines[index].match(/\bBANDWIDTH=(\d+)/i)?.[1] || 0);
    const uri = lines.slice(index + 1).find((line) => line && !line.startsWith("#"));
    const url = absoluteMediaUrl(uri, baseUrl);
    if (url) variants.push({url, bandwidth});
  }
  return variants
    .sort((left, right) => right.bandwidth - left.bandwidth)
    .map((variant) => variant.url)
    .filter((url, index, all) => all.indexOf(url) === index);
}

function hlsFirstMediaUrl(manifest, baseUrl) {
  const init = String(manifest || "").match(/#EXT-X-MAP:[^\r\n]*\bURI="([^"]+)"/i)?.[1];
  if (init) return absoluteMediaUrl(init, baseUrl);
  const uri = String(manifest || "").split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#"));
  return absoluteMediaUrl(uri, baseUrl);
}

function hlsEncryptionKey(manifest, baseUrl) {
  const line = String(manifest || "").split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => /^#EXT-X-KEY:/i.test(entry) && !/\bMETHOD=NONE\b/i.test(entry));
  if (!line || !/\bMETHOD=AES-128\b/i.test(line)) return null;
  const uri = line.match(/\bURI="([^"]+)"/i)?.[1];
  const url = absoluteMediaUrl(uri, baseUrl);
  return url ? {url, method: "AES-128"} : null;
}

function isVerifiedMediaSegment(response) {
  const bytes = toBytes(response?.data);
  const prefix = responsePrefix(response);
  const contentType = String(header(response, "content-type") || "").toLowerCase();
  if (!bytes.length || /^(?:<!doctype\s+html|<html\b|<head\b|<body\b|\{|\[)/i.test(prefix)) return false;
  if (/(?:text\/html|application\/xhtml|application\/json|\+json|image\/)/.test(contentType)) return false;
  if (bytes[0] === 0x47 && (bytes.length <= 188 || bytes[188] === 0x47)) return true;
  if (bytes.length >= 12) {
    const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    if (box === "ftyp" || box === "styp" || box === "moof") return true;
  }
  return bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3;
}

async function probeUrl(url, headers, accept, signal, providerContext) {
  return withinSourceBudget(providerContext.axios.get(url, {
    signal,
    timeout: 5000,
    responseType: "arraybuffer",
    headers: {...headers, Accept: headers.Accept || headers.accept || accept, Range: "bytes=0-65535"},
  }), 5500);
}

function responseUrl(response, fallback) {
  return String(
    response?.request?.responseURL ||
    response?.request?._currentUrl ||
    response?.config?.url ||
    fallback ||
    "",
  );
}

async function probeHlsSource(source, headers, signal, providerContext) {
  const accept = "application/vnd.apple.mpegurl, application/x-mpegURL, */*";
  let masterResponse;
  try {
    masterResponse = await probeUrl(source.url, headers, accept, signal, providerContext);
  } catch (_) {
    return false;
  }
  if (!isVerifiedMediaResponse(masterResponse, {transport: "hls"})) return false;
  const master = responsePrefix(masterResponse);
  const masterUrl = responseUrl(masterResponse, source.url);
  const variants = hlsVariantUrls(master, masterUrl);
  const playlists = variants.length ? variants : [masterUrl];
  for (const playlistUrl of playlists) {
    let playlist = master;
    let resolvedPlaylistUrl = playlistUrl;
    if (playlistUrl !== masterUrl) {
      try {
        const response = await probeUrl(playlistUrl, headers, accept, signal, providerContext);
        if (!isVerifiedMediaResponse(response, {transport: "hls"})) continue;
        playlist = responsePrefix(response);
        resolvedPlaylistUrl = responseUrl(response, playlistUrl);
      } catch (_) {
        continue;
      }
    }
    const mediaUrl = hlsFirstMediaUrl(playlist, resolvedPlaylistUrl);
    if (!mediaUrl || mediaUrl === resolvedPlaylistUrl) continue;
    try {
      const mediaResponse = await probeUrl(
        mediaUrl,
        headers,
        "video/mp2t, video/mp4, application/octet-stream, */*",
        signal,
        providerContext,
      );
      if (isVerifiedMediaSegment(mediaResponse)) return true;
      const encryption = hlsEncryptionKey(playlist, resolvedPlaylistUrl);
      if (encryption) {
        const encryptedBytes = toBytes(mediaResponse?.data);
        const prefix = responsePrefix(mediaResponse);
        const contentType = String(header(mediaResponse, "content-type") || "").toLowerCase();
        const disguisedDocument = /^(?:<!doctype\s+html|<html\b|<head\b|<body\b|\{|\[)/i.test(prefix) ||
          /(?:text\/html|application\/xhtml|application\/json|\+json|image\/)/.test(contentType);
        if (!disguisedDocument && encryptedBytes.length >= 32 && encryptedBytes.length % 16 === 0) {
          try {
            const keyResponse = await probeUrl(
              encryption.url,
              headers,
              "application/octet-stream, */*",
              signal,
              providerContext,
            );
            const keyBytes = toBytes(keyResponse?.data);
            if (keyBytes.length === 16) return true;
          } catch (_) {}
        }
      }
    } catch (_) {}
  }
  return false;
}

function sourceHeaders(payload, source) {
  const root = payload?.data || payload || {};
  const headers = normalizeHeaders(root?.headers, payload?.headers, source?.headers);
  const referer = String(source?.referer || source?.referrer || "").trim();
  if (referer && !headers.Referer && !headers.referer) {
    headers.Referer = referer;
    try { headers.Origin = new URL(referer).origin; } catch (_) {}
  }
  return headers;
}

async function probeNativeSource(source, kind, headers, signal, providerContext) {
  if (kind.transport === "hls") {
    return probeHlsSource(source, headers, signal, providerContext);
  }
  const accept = kind.transport === "dash"
    ? "application/dash+xml, application/xml, text/xml, */*"
    : "video/mp4, application/octet-stream, */*";
  try {
    const response = await probeUrl(source.url, headers, accept, signal, providerContext);
    return isVerifiedMediaResponse(response, kind);
  } catch (_) {
    return false;
  }
}

function normalizedAudioCategory(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/dub/.test(text)) return "dub";
  if (/multi/.test(text)) return "multi";
  if (/sub|caption|soft|hard/.test(text)) return "sub";
  return "";
}

function sourcePayloadMatches(payload, item, variant) {
  const roots = [payload, payload?.data, payload?.meta, payload?.data?.meta]
    .filter((value) => value && typeof value === "object");
  for (const root of roots) {
    const explicitAniList = Number(root.anilistId ?? root.aniListId ?? root.aniId ?? root.anilist ?? 0);
    if (explicitAniList > 0 && explicitAniList !== Number(item.anilistId)) return false;
    const explicitEpisode = Number(root.episodeNumber ?? root.episode_number ?? 0);
    if (explicitEpisode > 0 && explicitEpisode !== Number(item.number)) return false;
    const explicitProvider = typeof root.provider === "string" ? root.provider.trim().toLowerCase() : "";
    if (explicitProvider && explicitProvider !== String(variant.provider || "").trim().toLowerCase()) return false;
    const explicitAudio = normalizedAudioCategory(root.languageCategory ?? root.audio);
    if (explicitAudio && explicitAudio !== normalizedAudioCategory(variant.languageCategory)) return false;
  }
  return true;
}

async function selectVerifiedNativeSource(payload, item, variant, signal, providerContext) {
  if (!sourcePayloadMatches(payload, item, variant)) return null;
  // Miruro's current WatchRoute selects the first native stream in API order
  // and falls through only when that exact media URI fails. Embed rows are
  // handled by its iframe player and therefore never become MORROW sources.
  const candidates = sourceItems(payload)
    .map((source) => ({source, kind: playbackKind(source)}))
    .filter((entry) => entry.kind);
  for (const candidate of candidates) {
    const headers = sourceHeaders(payload, candidate.source);
    if (await probeNativeSource(candidate.source, candidate.kind, headers, signal, providerContext)) {
      return {...candidate, headers};
    }
  }
  return null;
}

async function mapLimited(items, limit, mapper) {
  const output = new Array(items.length);
  let next = 0;
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return output;
}

function sourceQuery(item, variant, live) {
  const query = {
    episodeId: variant.episodeId,
    provider: variant.provider,
    category: variant.category || variant.languageCategory || "",
    anilistId: item.anilistId,
  };
  if (live) {
    query.live = "true";
    query._t = Math.floor(Date.now() / 600_000) * 600_000;
  } else if (String(variant.provider || "").trim().toLowerCase() === "bee") {
    // This is the TTL used by Miruro's current frontend for Bee.
    query.ttl = 86400;
  }
  return query;
}

async function requestSourcePayloads(variants, item, live, signal, providerContext) {
  const responses = await mapLimited(variants, 6, async (variant) => {
    try {
      const payload = await withinSourceBudget(
        secureGet("sources", sourceQuery(item, variant, live), signal, providerContext),
        8000,
      );
      return {variant, payload};
    } catch (error) {
      return {variant, error};
    }
  });

  const failedIndexes = responses
    .map((response, index) => response.payload ? -1 : index)
    .filter((index) => index >= 0);
  if (failedIndexes.length && providerContext.chromiumGetMany && !signal?.aborted) {
    try {
      const requests = failedIndexes.map((index) => ({
        path: "sources",
        query: sourceQuery(item, variants[index], live),
      }));
      const fallbackPayloads = await withinSourceBudget(
        providerContext.chromiumGetMany(requests),
        9000,
      );
      failedIndexes.forEach((responseIndex, fallbackIndex) => {
        const bridged = fallbackPayloads?.[fallbackIndex];
        if (!bridged?.ok) return;
        try {
          responses[responseIndex] = {
            variant: variants[responseIndex],
            payload: decodePayload(
              bridged.data,
              bridged.headers?.["x-obfuscated"],
              providerContext,
            ),
          };
        } catch (_) {}
      });
    } catch (_) {
      // Native responses from other provider rows remain usable.
    }
  }
  return responses;
}

exports.getStream = async ({link, signal, providerContext}) => {
  if (!String(link).startsWith("miruro-source:")) throw new Error("Refresh this Miruro season to load its real episode IDs");
  const item = unpack(link);
  const anilistId = Number(item.anilistId);
  const episodeNumber = Number(item.number);
  if (!(anilistId > 0) || !(episodeNumber > 0)) {
    throw new Error("Refresh this Miruro season to verify its episode identity");
  }
  const variants = (Array.isArray(item.variants) ? item.variants : []).filter((variant) =>
    variant &&
    String(variant.provider || "").trim() &&
    String(variant.episodeId || "").trim() &&
    Number(variant.number) === episodeNumber &&
    ["sub", "dub", "multi"].includes(String(variant.languageCategory || "").trim().toLowerCase())
  );
  if (!variants.length) throw new Error("Refresh this Miruro season to verify its server variants");

  let responses = await requestSourcePayloads(variants, item, false, signal, providerContext);
  let selected = await mapLimited(responses, 6, async (result) =>
    result.payload
      ? selectVerifiedNativeSource(result.payload, item, result.variant, signal, providerContext)
      : null
  );

  // Signed URLs can expire while Miruro's source cache is still warm. Its own
  // report/refresh path uses live=true with a ten-minute bucket, so retry only
  // failed rows through that same provider-specific contract. No other
  // provider or episode ID is ever substituted.
  const refreshIndexes = selected
    .map((entry, index) => entry ? -1 : index)
    .filter((index) => index >= 0);
  if (refreshIndexes.length && !signal?.aborted) {
    const refreshVariants = refreshIndexes.map((index) => variants[index]);
    const refreshedResponses = await requestSourcePayloads(
      refreshVariants,
      item,
      true,
      signal,
      providerContext,
    );
    const refreshedSelections = await mapLimited(refreshedResponses, 6, async (result) =>
      result.payload
        ? selectVerifiedNativeSource(result.payload, item, result.variant, signal, providerContext)
        : null
    );
    refreshIndexes.forEach((responseIndex, refreshIndex) => {
      if (!refreshedSelections[refreshIndex]) return;
      responses[responseIndex] = refreshedResponses[refreshIndex];
      selected[responseIndex] = refreshedSelections[refreshIndex];
    });
  }

  const streams = [];
  for (let resultIndex = 0; resultIndex < responses.length; resultIndex += 1) {
    const result = responses[resultIndex];
    const chosen = selected[resultIndex];
    if (!result?.payload || !chosen) continue;
    const {variant, payload} = result;
    const {source, kind, headers: verifiedHeaders} = chosen;
    const root = payload?.data || payload;
    const sourceTracks = tracks(payload);
    // Both source timing and Miruro's AniSkip mapping are explicit upstream
    // data. No duration-based guessing is performed here.
    const intro = segment(root?.intro || root?.opening || payload?.intro || payload?.opening) || segment(item.intro);
    const outro = segment(root?.outro || root?.ending || payload?.outro || payload?.ending) || segment(item.outro);
    const url = String(source.url || "");
    const tags = explicitTags(
      root?.download ? "download" : "",
      root?.category,
      root?.variant,
      root?.subType,
      root?.subtype,
      variant.category,
      variant.variantLabel,
      source?.category,
      source?.variant,
      source?.subType,
      source?.subtype,
      source?.download ? "download" : "",
      source?.tags,
    );
    // Provider labels are the exact Miruro menu contract. Internal player
    // labels such as HD-1 remain implementation details, just as on Miruro.
    const server = [String(variant.provider || "").trim(), ...tags]
      .filter(Boolean)
      .join(" \u00B7 ");
    if (!server) continue;
    const normalizedLanguage = language(variant.languageLabel);
    streams.push({
      sourceId: [
        "miruro",
        stablePart(variant.provider),
        stablePart(variant.languageCategory),
        stablePart(variant.category),
      ].join(":"),
      server,
      serverLabel: server,
      sourceLabel: server,
      selectorKind: "server",
      labelProvenance: "provider-api",
      languageCategory: variant.languageCategory,
      languageLabel: variant.languageLabel,
      ...(String(variant.languageLabel || "").trim() ? {providerLanguageCode: String(variant.languageLabel).trim()} : {}),
      ...(normalizedLanguage !== "und" ? {languageCode: normalizedLanguage} : {}),
      link: url,
      playbackMode: "native",
      transport: kind.transport,
      type: kind.type,
      quality: explicitQuality(source?.quality || source?.label || source?.server),
      expiresAt: sourceExpiry(url),
      health: "ready",
      verified: true,
      headers: verifiedHeaders,
      subtitles: mergeTracks(sourceTracks, tracks(source)),
      introStart: intro?.start,
      introEnd: intro?.end,
      outroStart: outro?.start,
      outroEnd: outro?.end,
    });
  }

  const unique = streams.filter((stream, index, all) => all.findIndex((other) =>
    other.sourceId === stream.sourceId &&
    other.link === stream.link &&
    other.languageCategory === stream.languageCategory
  ) === index);
  if (!unique.length) {
    const failed = responses.filter((result) => result.error).length;
    throw new Error(failed === responses.length
      ? "Miruro's source service did not respond"
      : "Miruro returned no verified native source for this episode");
  }
  return unique;
};
