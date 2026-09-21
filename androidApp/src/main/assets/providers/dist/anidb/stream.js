const BASE = "https://anidb.app";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

function unpack(value) {
  const raw = String(value || "").replace(/^anidb-source:/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
function requestHeaders(animeId, pageUrl, accept = "application/json") {
  return {
    Accept: accept,
    Referer: pageUrl || `${BASE}/anime/title-${animeId}#player`,
    Origin: BASE,
    "User-Agent": USER_AGENT,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
  };
}
function dataOf(value, providerContext) {
  if (value && typeof value === "object") return value;
  const raw = String(value || "").trim();
  try { return JSON.parse(raw); } catch {}
  try {
    const $ = providerContext.cheerio.load(raw);
    return JSON.parse($("pre").first().text() || $("body").text());
  } catch { throw new Error("AniDB returned an invalid language response"); }
}
async function chromiumText(url, animeId, pageUrl, signal, providerContext, accept) {
  const bridge = providerContext.chromiumRequest || providerContext.chromiumFetch;
  if (typeof bridge === "function") {
    const response = await bridge({
      provider: "anidb",
      url,
      method: "GET",
      headers: requestHeaders(animeId, pageUrl, accept),
      responseType: "text",
      signal,
    });
    if (!response?.ok) {
      const error = new Error(`AniDB Chromium request failed: ${response?.status || "unknown"}`);
      error.status = Number(response?.status || 0);
      throw error;
    }
    return String(response.data || "");
  }
  const response = await providerContext.axios.get(url, {
    signal,
    timeout: 12000,
    responseType: "text",
    headers: requestHeaders(animeId, pageUrl, accept),
  });
  return typeof response.data === "string" ? response.data : JSON.stringify(response.data || {});
}
async function requestJson(url, animeId, pageUrl, signal, providerContext) {
  const raw = await chromiumText(
    url,
    animeId,
    pageUrl,
    signal,
    providerContext,
    "application/json",
  );
  return dataOf(raw, providerContext);
}
function clean(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
function htmlValue(value) {
  return String(value || "")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .replace(/&amp;/gi, "&");
}
function safeEmbed(value) {
  const raw = clean(value);
  if (!raw || /^(?:blob|data|javascript):/i.test(raw)) return "";
  try {
    // AniDB currently returns same-origin `/embed/v2/...` values. Resolve
    // those relative values exactly as its page does, while retaining support
    // for an AniDB-owned player subdomain. Never turn this API into an
    // arbitrary provider-web launcher.
    const url = new URL(raw, BASE);
    const ownedHost = url.hostname === "anidb.app" || url.hostname.endsWith(".anidb.app");
    if (
      url.protocol !== "https:" ||
      !ownedHost ||
      url.port ||
      url.username ||
      url.password ||
      !/^\/embed(?:\/|$)/i.test(url.pathname)
    ) return "";
    if (!url.searchParams.has("autoplay")) url.searchParams.set("autoplay", "1");
    return url.href;
  } catch {
    return "";
  }
}

function safeHls(value) {
  const raw = htmlValue(value).trim();
  try {
    const url = new URL(raw);
    const ownedHost = url.hostname === "anidb.app" || url.hostname.endsWith(".anidb.app");
    if (
      url.protocol !== "https:" ||
      !ownedHost ||
      url.port ||
      url.username ||
      url.password ||
      !/\.m3u8(?:$|[?#])/i.test(url.href)
    ) return "";
    return url.href;
  } catch {
    return "";
  }
}

function languageCode(value) {
  const text = clean(value).toLowerCase();
  const aliases = {
    eng: "en", english: "en", en: "en",
    jpn: "ja", japanese: "ja", ja: "ja",
    hin: "hi", hindi: "hi", hi: "hi",
    spa: "es", spanish: "es", es: "es",
    ara: "ar", arabic: "ar", ar: "ar",
  };
  return aliases[text] || (/^[a-z]{2}$/.test(text) ? text : "und");
}

function sourceId(animeId, episodeId, code, label) {
  const stable = clean(code || label || "source")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "source";
  return `anidb:${animeId}:e${episodeId}:${stable}`;
}

function setupBlock(html, key) {
  const match = String(html || "").match(
    new RegExp(`\\b${key}\\s*:\\s*\\[([\\s\\S]*?)\\]\\s*,`, "i"),
  );
  return match?.[1] || "";
}

function mediaFromEmbed(html) {
  const sources = setupBlock(html, "sources");
  const urls = [...sources.matchAll(
    /(?:\bfile|\bsrc)\s*:\s*(['"])(https?:\/\/[\s\S]*?\.m3u8(?:\?[\s\S]*?)?)\1/gi,
  )]
    .map((match) => safeHls(match[2]))
    .filter(Boolean);
  return urls.find((url, index, all) => all.indexOf(url) === index) || "";
}

function subtitlesFromEmbed(html) {
  const block = setupBlock(html, "tracks");
  if (!block) return [];
  const output = [];
  for (const object of block.match(/\{[\s\S]*?\}/g) || []) {
    const file = object.match(
      /(?:\bfile|\bsrc)\s*:\s*(['"])(https?:\/\/[\s\S]*?)\1/i,
    )?.[2];
    const uri = htmlValue(file || "").trim();
    if (!/^https:\/\//i.test(uri) || !/\.(?:vtt|srt|ass)(?:$|[?#])/i.test(uri)) continue;
    const label = clean(
      object.match(/\b(?:label|name)\s*:\s*(['"])([\s\S]*?)\1/i)?.[2] || "Subtitles",
    );
    const language = languageCode(
      object.match(/\b(?:language|lang)\s*:\s*(['"])([\s\S]*?)\1/i)?.[2] || label,
    );
    const pathname = new URL(uri).pathname.toLowerCase();
    output.push({
      title: label,
      language,
      type: pathname.endsWith(".srt")
        ? "application/x-subrip"
        : pathname.endsWith(".ass") ? "text/x-ass" : "text/vtt",
      uri,
    });
  }
  return output.filter(
    (track, index, all) => all.findIndex((other) => other.uri === track.uri) === index,
  );
}

async function extractLanguageStream(language, animeId, episodeId, pageUrl, signal, providerContext) {
  const embedUrl = safeEmbed(language?.embed_url);
  if (!embedUrl) return null;
  const html = await chromiumText(
    embedUrl,
    animeId,
    pageUrl,
    signal,
    providerContext,
    "text/html,application/xhtml+xml,*/*;q=0.8",
  );
  const link = mediaFromEmbed(html);
  if (!link) return null;
  const label = clean(language?.name || language?.code || "Source");
  const code = languageCode(language?.code || label);
  return {
    server: label,
    serverLabel: label,
    sourceLabel: label,
    sourceId: sourceId(animeId, episodeId, language?.code, label),
    selectorKind: "server",
    labelProvenance: "provider-api",
    playbackMode: "native",
    transport: "hls",
    type: "m3u8",
    health: "unchecked",
    languageCategory: code === "ja" ? "sub" : "dub",
    languageLabel: label,
    providerLanguageCode: clean(language?.code),
    link,
    headers: {
      Accept: "application/vnd.apple.mpegurl,application/x-mpegURL,*/*",
      Referer: embedUrl,
      Origin: BASE,
      "User-Agent": USER_AGENT,
    },
    subtitles: subtitlesFromEmbed(html),
    seekable: true,
  };
}

exports.getStream = async ({link, signal, providerContext}) => {
  const episode = unpack(link);
  const animeId = Number(episode?.animeId || 0);
  const episodeId = Number(episode?.episodeId || 0);
  if (!animeId || !episodeId) throw new Error("Invalid AniDB episode source");
  let pageUrl = "";
  try {
    const candidate = new URL(String(episode?.pageUrl || ""));
    if (candidate.origin === BASE && Number(candidate.pathname.match(/-(\d+)\/?$/)?.[1] || 0) === animeId) pageUrl = candidate.href;
  } catch {}

  const payload = await requestJson(`${BASE}/api/frontend/episode/${episodeId}/languages`, animeId, pageUrl, signal, providerContext);
  const languages = Array.isArray(payload?.languages) ? payload.languages : [];
  const resolved = await Promise.all(languages.map((language) =>
    extractLanguageStream(
      language,
      animeId,
      episodeId,
      pageUrl,
      signal,
      providerContext,
    ).catch(() => null),
  ));
  const streams = resolved.filter(Boolean).filter(
    (stream, index, all) => all.findIndex((other) => other.sourceId === stream.sourceId) === index,
  );
  if (streams.length) return streams;
  const embeddedLabels = languages.map(
    (language) => clean(language?.name || language?.code),
  ).filter(Boolean);
  throw new Error(
    embeddedLabels.length
      ? `AniDB's ${embeddedLabels.join(", ")} player did not expose native media`
      : "AniDB did not expose a native media URI for this episode",
  );
};
