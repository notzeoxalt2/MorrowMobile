const BASE = "https://www.miruro.to";
const OBFUSCATION_KEY = Uint8Array.from("71951034f8fbcf53d89db52ceb3dc22c".match(/.{2}/g), (hex) => parseInt(hex, 16));

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBytes(value) {
  const raw = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
}

function header(response, name) {
  return response.headers?.get?.(name) || response.headers?.[name] || response.headers?.[name.toLowerCase()] || "";
}

function decodeSecurePayload(data, obfuscated, providerContext) {
  if (!obfuscated) return typeof data === "string" ? JSON.parse(data) : data;
  let bytes = decodeBytes(data);
  if (String(obfuscated) === "2") {
    bytes = bytes.map((byte, index) => byte ^ OBFUSCATION_KEY[index % OBFUSCATION_KEY.length]);
  }
  return JSON.parse(new TextDecoder().decode(providerContext.gunzipSync(bytes)));
}

function isAbort(error, signal) {
  return signal?.aborted || error?.name === "AbortError" || error?.code === "ERR_CANCELED";
}

function responseStatus(error) {
  return Number(error?.response?.status || error?.status || 0);
}

function retryDelay(error, attempt) {
  const headers = error?.response?.headers;
  const raw = headers?.get?.("retry-after") || headers?.["retry-after"];
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 5000);
  const date = Date.parse(String(raw || ""));
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 5000);
  return Math.min(400 * 2 ** attempt, 2000);
}

function waitForRetry(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Episode lookup was cancelled", "AbortError"));
      return;
    }
    const timer = setTimeout(resolve, milliseconds);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Episode lookup was cancelled", "AbortError"));
    }, {once: true});
  });
}

async function withinSecureBudget(promise, milliseconds, message) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function secureGet(path, query, signal, providerContext) {
  const envelope = {path, method: "GET", query: query || {}, body: null};
  let httpError;

  // Use KANDO's Chrome-emulated Rust session first. The previous Chromium-first
  // route could sit on a Cloudflare interstitial until the UI's global timeout,
  // even though this same native session could return the real episode payload.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await withinSecureBudget(providerContext.axios.get(
        `${BASE}/api/secure/pipe?e=${encode(envelope)}`,
        {
          signal,
          timeout: 8000,
          responseType: "text",
          forceDoh: true,
          headers: {Accept: "application/json", Referer: `${BASE}/`, "Sec-Fetch-Dest": "empty", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin"},
        },
      ), 8500, "Miruro's secure episode request timed out");
      return decodeSecurePayload(response.data, header(response, "x-obfuscated"), providerContext);
    } catch (error) {
      if (isAbort(error, signal)) throw error;
      httpError = error;
      const status = responseStatus(error);
      const transient = status === 0 || status === 429 || status >= 500;
      if (!transient || attempt === 2) break;
      await waitForRetry(retryDelay(error, attempt), signal);
    }
  }

  // Chromium is a bounded fallback only. It remains useful on installations
  // where the WAF accepts WebView2, but a blocked hidden document must never
  // leave the season page permanently loading.
  if (providerContext.chromiumGetMany) {
    try {
      const [bridgeResponse] = await withinSecureBudget(
        providerContext.chromiumGetMany([{path, query: query || {}}]),
        9000,
        "Miruro's Chromium session timed out",
      );
      if (!bridgeResponse?.ok) {
        const status = Number(bridgeResponse?.status || 0);
        const error = new Error(
          status === 403
            ? "Miruro blocked its secure episode request (HTTP 403)"
            : `Miruro secure request failed: ${status || "unknown"}`,
        );
        error.status = status;
        error.providerBlocked = status === 403;
        throw error;
      }
      return decodeSecurePayload(
        bridgeResponse.data,
        bridgeResponse.headers?.["x-obfuscated"],
        providerContext,
      );
    } catch (bridgeError) {
      if (isAbort(bridgeError, signal)) throw bridgeError;
      if (bridgeError?.providerBlocked || responseStatus(bridgeError) === 403) throw bridgeError;
      throw new Error("Miruro's secure episode service is unavailable right now");
    }
  }

  throw httpError instanceof Error
    ? httpError
    : new Error("Miruro's secure episode service is unavailable right now");
}

function pack(value) { return encode(value); }

const CANONICAL_CACHE_MS = 14 * 24 * 60 * 60 * 1000;
const canonicalEpisodeCache = new Map();

const STREAMING_CONFIG_CACHE_MS = 30 * 60 * 1000;
const STREAMING_CONFIG_RETRY_MS = 5 * 60 * 1000;
let streamingConfigCache = null;
let streamingConfigRequest = null;

// Miruro also embeds this data in its homepage. Keep a reviewed fallback so a
// temporary homepage/WAF failure never collapses the real menu back to a lone
// provider. A successful homepage read replaces it and follows config changes.
const FALLBACK_STREAMING_CONFIG = {
  providerOrder: ["bonk", "kiwi", "hop", "ally", "pewe", "bee", "moo", "nun", "bun", "twin", "cog", "telli"],
  streaming: {
    bonk: {visible: true, capabilities: {sub: true, ssub: true}, variantOrder: ["ssub", "sub"]},
    kiwi: {visible: true, capabilities: {sub: true, ssub: false}},
    hop: {visible: true, capabilities: {sub: false, ssub: true}},
    ally: {visible: true, capabilities: {sub: true, ssub: false}},
    pewe: {visible: true, capabilities: {sub: true, ssub: false}},
    bee: {visible: true, capabilities: {sub: false, ssub: true}},
    moo: {visible: true, capabilities: {sub: true, ssub: false}},
    nun: {visible: true, parent: "ally", relationship: "embed", capabilities: {sub: true, ssub: false}},
    bun: {visible: true, parent: "bee", relationship: "embed", capabilities: {sub: false, ssub: true}},
    twin: {visible: true, parent: "bonk", relationship: "embed", capabilities: {sub: true, ssub: true}, variantOrder: ["sub", "ssub"]},
    cog: {visible: true, parent: "moo", relationship: "embed", capabilities: {sub: true, ssub: false}},
    telli: {visible: false, parent: "kiwi", relationship: "embed", capabilities: {sub: true, ssub: false}},
  },
};

function validStreamingConfig(value) {
  const streaming = value?.streaming;
  if (!streaming || typeof streaming !== "object" || Array.isArray(streaming)) return null;
  const providerOrder = Array.isArray(value?.providerOrder)
    ? value.providerOrder.map((provider) => String(provider || "").trim()).filter(Boolean)
    : [];
  return {streaming, providerOrder};
}

function embeddedSsrConfig(html) {
  const text = String(html || "");
  const marker = /window\.__SSR_CONFIG__\s*=\s*/g;
  const match = marker.exec(text);
  if (!match) return null;
  const start = match.index + match[0].length;
  if (text[start] !== "{") return null;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') { quoted = true; continue; }
    if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, index + 1)); } catch (_) { return null; }
      }
    }
  }
  return null;
}

async function fetchStreamingConfig(providerContext) {
  const now = Date.now();
  if (streamingConfigCache && now - streamingConfigCache.cachedAt < streamingConfigCache.ttl) {
    return streamingConfigCache.value;
  }
  if (streamingConfigRequest) return streamingConfigRequest;
  streamingConfigRequest = (async () => {
    try {
      const response = await withinSecureBudget(providerContext.axios.get(`${BASE}/`, {
        timeout: 2200,
        responseType: "text",
        forceDoh: true,
        headers: {Accept: "text/html,application/xhtml+xml", Referer: `${BASE}/`},
      }), 2500, "Miruro streaming config lookup timed out");
      const parsed = validStreamingConfig(embeddedSsrConfig(response?.data));
      if (!parsed) throw new Error("Miruro homepage did not contain streaming config");
      streamingConfigCache = {cachedAt: Date.now(), ttl: STREAMING_CONFIG_CACHE_MS, value: parsed};
      return parsed;
    } catch (_) {
      const fallback = validStreamingConfig(FALLBACK_STREAMING_CONFIG);
      streamingConfigCache = {cachedAt: Date.now(), ttl: STREAMING_CONFIG_RETRY_MS, value: fallback};
      return fallback;
    } finally {
      streamingConfigRequest = null;
    }
  })();
  return streamingConfigRequest;
}

function explicitFiller(value) {
  return value === true || value === 1 || /^(?:true|filler)$/i.test(String(value || "").trim());
}

function cleanText(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function withinBudget(promise, milliseconds) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Episode artwork lookup timed out")), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function canonicalMapFromEpisodes(episodes, seasonNumber) {
  const mapped = new Map();
  for (const episode of Array.isArray(episodes) ? episodes : []) {
    if (Number(episode?.season) !== seasonNumber || !Number(episode?.number)) continue;
    mapped.set(Number(episode.number), {
      title: cleanText(episode.name),
      image: episode.image?.original || episode.image?.medium || "",
      description: cleanText(episode.summary),
    });
  }
  return mapped;
}

async function fetchCanonicalEpisodeMap(payload, providerContext) {
  const mappings = payload?.mappings || payload?.data?.mappings || {};
  const title = cleanText(mappings.title);
  const seasonNumber = Number(mappings.tmdbSeason || mappings.defaultTvdbSeason || 1) || 1;
  const tvdbId = Number(mappings.thetvdbId || 0);
  // Never use a title-only result as episode metadata. Similar titles and
  // remakes are common in anime; the TVDB identity keeps a different series
  // from donating episode titles or artwork.
  if (!title || !tvdbId) return new Map();

  const key = `${tvdbId || title.toLowerCase()}:${seasonNumber}`;
  const cached = canonicalEpisodeCache.get(key);
  if (cached && Date.now() - cached.cachedAt < CANONICAL_CACHE_MS) return cached.episodes;

  try {
    const query = encodeURIComponent(title);
    const response = await withinBudget(providerContext.axios.get(
      `https://api.tvmaze.com/singlesearch/shows?q=${query}&embed=episodes`,
      {timeout: 4500, headers: {Accept: "application/json"}},
    ), 4500);
    let show = response?.data || {};
    let episodes = show?._embedded?.episodes || [];

    // A title search is fast, but the TVDB identity check prevents similarly
    // named anime from ever donating the wrong episode list or artwork.
    if (tvdbId && Number(show?.externals?.thetvdb || 0) !== tvdbId) {
      const lookup = await withinBudget(providerContext.axios.get(
        `https://api.tvmaze.com/lookup/shows?thetvdb=${tvdbId}`,
        {timeout: 3500, headers: {Accept: "application/json"}},
      ), 3500);
      const showId = Number(lookup?.data?.id || 0);
      if (!showId) return new Map();
      const episodeResponse = await withinBudget(providerContext.axios.get(
        `https://api.tvmaze.com/shows/${showId}/episodes?specials=1`,
        {timeout: 3500, headers: {Accept: "application/json"}},
      ), 3500);
      episodes = episodeResponse?.data || [];
    }

    const mapped = canonicalMapFromEpisodes(episodes, seasonNumber);
    if (mapped.size) canonicalEpisodeCache.set(key, {cachedAt: Date.now(), episodes: mapped});
    return mapped;
  } catch (_) {
    return new Map();
  }
}

function episodeDecorations(payload) {
  const mappings = payload?.mappings || payload?.data?.mappings || {};
  const filler = new Map();
  for (const entry of Array.isArray(mappings.animefillerlist) ? mappings.animefillerlist : []) {
    const number = Number(entry?.number || entry?.episode);
    if (!number) continue;
    const type = String(entry?.type || "").toLowerCase();
    filler.set(number, type.includes("filler"));
  }

  const skip = new Map();
  for (const entry of Array.isArray(mappings.aniskip) ? mappings.aniskip : []) {
    const number = Number(entry?.episode);
    const start = Number(entry?.start);
    const end = Number(entry?.end);
    const type = String(entry?.type || "").toLowerCase();
    if (!number || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end - start > 600) continue;
    const kind = /^(op|mixed-op)$/.test(type) ? "intro" : /^(ed|mixed-ed)$/.test(type) ? "outro" : "";
    if (!kind) continue;
    const votes = Number(entry?.votes || 0);
    const existing = skip.get(number) || {};
    if (!existing[kind] || votes > existing[kind].votes) {
      existing[kind] = {start, end, votes, episodeLength: Number(entry?.episode_length || 0)};
      skip.set(number, existing);
    }
  }
  return {filler, skip};
}

function explicitProviderIdentity(providerValue) {
  const meta = providerValue?.meta || providerValue?.data?.meta || {};
  const aniList = Number(meta.aniId ?? meta.anilistId ?? meta.anilist ?? 0);
  const mal = Number(meta.malId ?? meta.mal ?? 0);
  const links = [meta.externalLinks, meta.links].flat(Infinity).filter(Boolean).map(String);
  const linkedAniList = Number(links.map((link) => link.match(/anilist\.co\/anime\/(\d+)/i)?.[1]).find(Boolean) || 0);
  const linkedMal = Number(links.map((link) => link.match(/myanimelist\.net\/anime\/(\d+)/i)?.[1]).find(Boolean) || 0);
  return {aniList: aniList || linkedAniList, mal: mal || linkedMal};
}

function identityTitle(value) {
  return cleanText(value).toLowerCase().normalize("NFKD")
    .replace(/\([^)]*\b(?:tv|uncut)\b[^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function providerTitles(providerValue) {
  const meta = providerValue?.meta || providerValue?.data?.meta || {};
  return [
    meta.title,
    meta.englishTitle,
    meta.title_en,
    meta.nativeTitle,
    meta.japanese,
    meta.altTitle,
    meta.otherNames,
  ].flat(Infinity).filter(Boolean).flatMap((value) => String(value).split(/[;|]/)).map(identityTitle).filter(Boolean);
}

function providerIdentityMatches(providerValue, mappings) {
  const explicit = explicitProviderIdentity(providerValue);
  const expectedAniList = Number(mappings?.aniId ?? mappings?.anilistId ?? mappings?.anilist ?? 0);
  const expectedMal = Number(mappings?.malId ?? 0);
  if (explicit.aniList && expectedAniList && explicit.aniList !== expectedAniList) return false;
  if (explicit.mal && expectedMal && explicit.mal !== expectedMal) return false;
  const expectedTitles = [mappings?.title, mappings?.synonyms].flat(Infinity).filter(Boolean).map(identityTitle).filter(Boolean);
  const offeredTitles = providerTitles(providerValue);
  if (expectedTitles.length && offeredTitles.length && !offeredTitles.some((offered) =>
    expectedTitles.some((expected) => offered === expected || offered.includes(expected) || expected.includes(offered)))) return false;
  return true;
}

function episodeNumbersFromProvider(providerValue) {
  const episodeRoot = providerValue?.episodes || providerValue?.data?.episodes;
  const rows = Array.isArray(episodeRoot)
    ? episodeRoot
    : episodeRoot && typeof episodeRoot === "object"
      ? Object.values(episodeRoot).flatMap((value) => Array.isArray(value) ? value : [])
      : [];
  return rows
    .map((episode) => Number(
      episode?.number ??
      episode?.episodeNumber ??
      episode?.episode_number ??
      episode?.episode ??
      episode?.ep,
    ))
    .filter((number) => number > 0);
}

function collectVariants(payload) {
  const variants = [];
  const seen = new Set();
  const languageOf = (value, fallback) => {
    const category = String(fallback || "").trim().toLowerCase();
    if (/dub/.test(category)) return "dub";
    if (/multi/.test(category)) return "multi";
    if (/sub|caption|soft|hard|(^|\W)(?:es|spa|spanish)(?:$|\W)/.test(category)) return "sub";
    const text = String(value || "").trim().toLowerCase();
    if (/dub/.test(text)) return "dub";
    if (/multi/.test(text)) return "multi";
    return "sub";
  };
  // This field is shown alongside the source selector, so keep Miruro's exact
  // value. "dub" does not prove English and "sub" does not prove Japanese.
  const languageLabelOf = (value, fallback) => cleanText(value ?? fallback);
  const add = (value, provider, categoryHint) => {
    if (!value || typeof value !== "object") return;
    const number = Number(value.number ?? value.episodeNumber ?? value.episode_number ?? value.episode ?? value.ep);
    const episodeId = value.episodeId ?? value.episode_id ?? value.id;
    if (!(number > 0) || episodeId == null || !provider) return;
    const languageCategory = languageOf(
      value.languageCategory ?? value.language ?? value.audio ?? value.lang,
      categoryHint,
    );
    const explicitCategory = String(value.category ?? value.variant ?? value.type ?? categoryHint ?? "").trim();
    const category = explicitCategory || languageCategory;
    const languageLabel = languageLabelOf(
      value.languageLabel ?? value.audioLabel ?? value.language ?? value.audio ?? value.lang,
      categoryHint,
    );
    const variantLabel = cleanText(value.variantLabel ?? value.menuVariant ?? "");
    const key = `${provider}|${languageCategory}|${languageLabel}|${category}|${variantLabel}|${episodeId}|${number}`;
    if (seen.has(key)) return;
    seen.add(key);
    variants.push({
      provider,
      languageCategory,
      languageLabel,
      category,
      variantLabel,
      episodeId: String(episodeId),
      number,
      title: value.title || value.name || "",
      image: value.image || value.thumbnail || value.img || "",
      description: value.description || value.overview || value.summary || "",
      isFiller: explicitFiller(value.isFiller ?? value.filler),
    });
  };

  // Miruro's secure contract is provider -> episodes -> audio/category. Walk
  // that shape directly. Arbitrary nested object keys must never become server
  // names, which was the source of several bogus entries in the app.
  const providerRoot = payload?.providers || payload?.data?.providers || payload?.result?.providers;
  const mappings = payload?.mappings || payload?.data?.mappings || {};
  if (providerRoot && typeof providerRoot === "object" && !Array.isArray(providerRoot)) {
    for (const [providerName, providerValue] of Object.entries(providerRoot)) {
      const provider = String(providerName || "").trim();
      if (!providerIdentityMatches(providerValue, mappings)) continue;
      // A one-episode ONA/movie must never inherit a parent TV provider's
      // twelve-episode list. Miruro's own SSR metadata currently does exactly
      // that for Operation Desert Pasta, so require the provider list itself
      // to fit the exact mapped release before accepting episode 1.
      const mappedEpisodeCount = Number(mappings?.episodes || 0);
      const providerNumbers = episodeNumbersFromProvider(providerValue);
      if (mappedEpisodeCount === 1 && providerNumbers.some((number) => number > 1)) continue;
      const episodeRoot = providerValue?.episodes || providerValue?.data?.episodes;
      if (!provider || !episodeRoot || typeof episodeRoot !== "object") continue;
      if (Array.isArray(episodeRoot)) {
        episodeRoot.forEach((episode) => add(episode, provider, ""));
        continue;
      }
      for (const [category, episodeList] of Object.entries(episodeRoot)) {
        if (!Array.isArray(episodeList)) continue;
        episodeList.forEach((episode) => add(episode, provider, category));
      }
    }
  }

  // Some deployments return a compact episode array. It is accepted only
  // when every row explicitly names its provider.
  const compact = payload?.episodes || payload?.data?.episodes;
  if (Array.isArray(compact)) {
    for (const episode of compact) {
      const provider = String(episode?.provider ?? episode?.server ?? episode?.source ?? "").trim();
      add(episode, provider, episode?.category ?? episode?.audio ?? episode?.language);
    }
  }
  return variants;
}

function payloadIdentity(payload) {
  const mappings = payload?.mappings || payload?.data?.mappings || {};
  return {
    anilistId: Number(mappings.aniId ?? mappings.anilistId ?? mappings.anilist ?? 0),
    malId: Number(mappings.malId ?? mappings.mal_id ?? 0),
    episodes: Number(mappings.episodes ?? mappings.episodeCount ?? 0),
    format: String(mappings.format || mappings.type || "").trim().toUpperCase(),
  };
}

function identityProblem(payload, expected) {
  const actual = payloadIdentity(payload);
  if (!actual.anilistId) return "Miruro did not return a verifiable AniList identity";
  if (actual.anilistId !== expected.anilistId) {
    return `Miruro returned episodes for AniList ${actual.anilistId}, not ${expected.anilistId}`;
  }
  if (expected.malId && actual.malId && actual.malId !== expected.malId) {
    return `Miruro returned MAL ${actual.malId}, not ${expected.malId}`;
  }
  if (expected.episodes && actual.episodes && actual.episodes !== expected.episodes) {
    return `Miruro returned a ${actual.episodes}-episode release, not the selected ${expected.episodes}-episode release`;
  }
  if (expected.format && actual.format && actual.format !== expected.format) {
    return `Miruro returned format ${actual.format}, not ${expected.format}`;
  }
  return "";
}

function liveEpisodeQuery(anilistId) {
  const cacheBucket = Math.floor(Date.now() / (10 * 60 * 1000)) * (10 * 60 * 1000);
  return {anilistId, live: "true", _t: cacheBucket};
}

function categoryMode(value) {
  const category = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
  if (/^(?:ssub|s-sub|soft-sub|softsub)$/.test(category)) return "ssub";
  if (/^(?:sub|h-sub|hard-sub|hardsub)$/.test(category)) return "sub";
  return "";
}

function configuredSubModes(config) {
  const capabilities = config?.capabilities || {};
  const requested = Array.isArray(config?.variantOrder)
    ? config.variantOrder.map((mode) => String(mode || "").trim().toLowerCase())
    : ["sub", "ssub"];
  const output = [];
  for (const mode of [...requested, "sub", "ssub"]) {
    if ((mode !== "sub" && mode !== "ssub") || !capabilities[mode] || output.includes(mode)) continue;
    output.push(mode);
  }
  return output;
}

function expandConfiguredVariants(rawVariants, config) {
  if (!config?.streaming || typeof config.streaming !== "object") return rawVariants;
  const byProvider = new Map();
  for (const variant of rawVariants) {
    const key = String(variant.provider || "").trim().toLowerCase();
    if (!key) continue;
    const rows = byProvider.get(key) || [];
    rows.push(variant);
    byProvider.set(key, rows);
  }

  const configuredNames = [
    ...(Array.isArray(config.providerOrder) ? config.providerOrder : []),
    ...Object.keys(config.streaming),
  ].map((provider) => String(provider || "").trim()).filter(Boolean);
  const order = configuredNames.filter((provider, index, all) =>
    all.findIndex((other) => other.toLowerCase() === provider.toLowerCase()) === index);
  const configuredKeys = new Set(Object.keys(config.streaming).map((provider) => provider.toLowerCase()));
  const parentKeys = new Set(Object.values(config.streaming)
    .map((entry) => String(entry?.parent || "").trim().toLowerCase())
    .filter(Boolean));
  const output = [];

  for (const provider of order) {
    const providerKey = provider.toLowerCase();
    const entryName = Object.keys(config.streaming).find((name) => name.toLowerCase() === providerKey);
    const entry = entryName ? config.streaming[entryName] : null;
    // Miruro's iframe children are separate provider webpages, not media
    // sources. MORROW exposes only rows the official config assigns to its
    // native player.
    if (
      !entry ||
      entry.visible === false ||
      String(entry.player || "native").trim().toLowerCase() !== "native"
    ) continue;
    const parent = String(entry.parent || entryName || provider).trim();
    const parentRows = byProvider.get(parent.toLowerCase()) || [];
    if (!parentRows.length) continue;

    const rawSubRows = parentRows.filter((variant) =>
      variant.languageCategory === "sub" && categoryMode(variant.category));
    const subRowsByEpisode = new Map();
    for (const variant of rawSubRows) {
      const rows = subRowsByEpisode.get(variant.number) || [];
      rows.push(variant);
      subRowsByEpisode.set(variant.number, rows);
    }
    for (const mode of configuredSubModes(entry)) {
      for (const rows of subRowsByEpisode.values()) {
        const exact = rows.filter((variant) => categoryMode(variant.category) === mode);
        const base = exact.length ? exact : rows.filter((variant) => categoryMode(variant.category) === "sub");
        for (const variant of base) {
          output.push({
            ...variant,
            provider: entryName || provider,
            category: mode,
            variantLabel: mode === "ssub" ? "S-SUB" : "H-SUB",
          });
        }
      }
    }

    // Miruro's visible native Dub menu is one row per provider.
    for (const variant of parentRows.filter((row) => row.languageCategory === "dub")) {
      output.push({...variant, provider: entryName || provider, category: "dub", variantLabel: ""});
    }

    // Preserve additional explicit language/category buckets (for example an
    // `es` row) on their owning provider. Do not clone them into child servers
    // unless Miruro's config explicitly defines a mode for them.
    if (!entry.parent) {
      for (const variant of parentRows.filter((row) =>
        row.languageCategory !== "dub" && !categoryMode(row.category))) {
        output.push({...variant, provider: entryName || provider});
      }
    }
  }

  // If the API adds a provider before the homepage config is refreshed, keep
  // its explicit rows instead of silently losing a genuine source. Hidden
  // configured providers remain hidden.
  for (const variant of rawVariants) {
    const key = String(variant.provider || "").trim().toLowerCase();
    if (!configuredKeys.has(key) && !parentKeys.has(key)) output.push(variant);
  }

  const seen = new Set();
  return output.filter((variant) => {
    const identity = [
      variant.provider,
      variant.languageCategory,
      variant.languageLabel,
      variant.category,
      variant.variantLabel,
      variant.episodeId,
      variant.number,
    ].join("\u0000");
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

exports.getEpisodes = async ({url, signal, providerContext}) => {
  const parsed = new URL(String(url).replace(/^miruro:/, "https://miruro.local/"));
  const anilistId = Number(parsed.pathname.replace(/^\//, ""));
  const expected = Number(parsed.searchParams.get("episodes") || 0);
  const expectedIdentity = {
    anilistId,
    malId: Number(parsed.searchParams.get("malId") || 0),
    episodes: expected,
    format: String(parsed.searchParams.get("format") || "").trim().toUpperCase(),
  };
  if (!anilistId) throw new Error("Invalid Miruro season link");

  // The homepage config and episode payload are independent and Miruro's own
  // UI needs both. Fetch them concurrently so server expansion adds no serial
  // wait to the season page.
  const streamingConfigPromise = fetchStreamingConfig(providerContext);
  let payload = await secureGet("episodes", {anilistId}, signal, providerContext);
  let usedLiveRefresh = false;
  let problem = identityProblem(payload, expectedIdentity);
  // Miruro's current frontend exposes this exact live refresh contract. Use it
  // once when the cached mapper hands a special/ONA the parent series identity;
  // never accept the parent response merely to make an episode card appear.
  if (problem) {
    usedLiveRefresh = true;
    payload = await secureGet("episodes", liveEpisodeQuery(anilistId), signal, providerContext);
    problem = identityProblem(payload, expectedIdentity);
    if (problem) throw new Error(problem);
  }
  // Episode rows must appear promptly. Canonical artwork/title enrichment is
  // useful, but an optional metadata host can never hold the real Miruro list
  // hostage for several seconds.
  const [streamingConfig, canonical] = await Promise.all([
    streamingConfigPromise,
    withinBudget(fetchCanonicalEpisodeMap(payload, providerContext), 1800).catch(() => new Map()),
  ]);
  let variants = expandConfiguredVariants(collectVariants(payload), streamingConfig);
  if (!variants.length && !usedLiveRefresh) {
    usedLiveRefresh = true;
    const refreshed = await secureGet("episodes", liveEpisodeQuery(anilistId), signal, providerContext);
    problem = identityProblem(refreshed, expectedIdentity);
    if (problem) throw new Error(problem);
    payload = refreshed;
    variants = expandConfiguredVariants(collectVariants(payload), streamingConfig);
  }
  const decorations = episodeDecorations(payload);
  const grouped = new Map();
  for (const variant of variants) {
    if (expected && variant.number > expected) continue;
    const existing = grouped.get(variant.number) || {number: variant.number, variants: [], metadata: {}};
    existing.variants.push({
      provider: variant.provider,
      languageCategory: variant.languageCategory,
      languageLabel: variant.languageLabel,
      category: variant.category,
      variantLabel: variant.variantLabel,
      episodeId: variant.episodeId,
      number: variant.number,
    });
    if (!existing.metadata.title && variant.title) existing.metadata.title = cleanText(variant.title);
    if (!existing.metadata.image && /^https?:/i.test(String(variant.image || ""))) existing.metadata.image = variant.image;
    if (!existing.metadata.description && variant.description) existing.metadata.description = cleanText(variant.description);
    if (variant.isFiller) existing.explicitFiller = true;
    grouped.set(variant.number, existing);
  }

  const episodes = [...grouped.values()].sort((a, b) => a.number - b.number);
  if (!episodes.length) throw new Error(`Miruro returned no published episodes${expected ? ` for this ${expected}-episode season` : ""}`);
  return episodes.map((episode) => {
    const metadata = canonical.get(episode.number) || episode.metadata || {};
    const timing = decorations.skip.get(episode.number) || {};
    episode.title = metadata.title || "";
    return {
    title: `Episode ${episode.number}${episode.title && !new RegExp(`^episode\\s*${episode.number}$`, "i").test(episode.title) ? ` · ${episode.title}` : ""}`,
    link: `miruro-source:${pack({
      anilistId,
      number: episode.number,
      variants: episode.variants,
      intro: timing.intro ? {start: timing.intro.start, end: timing.intro.end, episodeLength: timing.intro.episodeLength} : null,
      outro: timing.outro ? {start: timing.outro.start, end: timing.outro.end, episodeLength: timing.outro.episodeLength} : null,
    })}`,
    image: metadata.image || "",
    description: metadata.description || "",
    number: episode.number,
    isFiller: decorations.filler.get(episode.number) === true || episode.explicitFiller === true,
    };
  });
};
