"use strict";

const PROVIDER_ID = "movieBox";
const MOVIEBOX_PROXY = "https://worker.zendax.me/api/moviebox";
const MOVIEBOX_MEDIA_HEADERS = {
  Accept: "*/*",
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64; rv:137.0) Gecko/20100101 Firefox/137.0",
  Origin: "https://moviebox.ph",
  Referer: "https://moviebox.ph/",
};

const isExpiredSignedUrl = (value, nowSeconds = Date.now() / 1000) => {
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) return true;
    const rawExpiry = parsed.searchParams.get("t");
    if (!rawExpiry) return false;
    const expiresAt = Number(rawExpiry);
    return !Number.isFinite(expiresAt) || expiresAt <= nowSeconds;
  } catch {
    return true;
  }
};

const refreshedProviderPath = (value) => {
  try {
    const parsed = new URL(String(value || ""), "https://moviebox.ph");
    parsed.searchParams.delete("_kandoSeNum");
    parsed.searchParams.set("_kando_stream_refresh", String(Date.now()));
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(value || "");
  }
};

const requestResourceUrl = async (resourcePath, refresh = false) => {
  if (!String(resourcePath || "").trim()) return "";
  const providerPath = refresh
    ? refreshedProviderPath(resourcePath)
    : String(resourcePath);
  const proxyUrl =
    `${MOVIEBOX_PROXY}?url=${encodeURIComponent(providerPath)}` +
    (refresh ? `&_=${Date.now()}` : "");
  const response = await fetch(proxyUrl, {
    headers: {"Cache-Control": "no-cache, no-store", Pragma: "no-cache"},
  });
  if (!response.ok) return "";
  const payload = await response.json();
  const items = Array.isArray(payload?.data?.list) ? payload.data.list : [];
  return String(items[0]?.resourceLink || "").trim();
};

const legacyGetStream = async ({link, providerContext}) => {
  try {
    const data = JSON.parse(link);
    let url = String(data?.url || "").trim();
    const title = String(data?.title || "").trim();
    const resourcePath = String(data?.resourcePath || "").trim();
    if ((!url || isExpiredSignedUrl(url)) && resourcePath) {
      url = await requestResourceUrl(resourcePath);
      if (!url || isExpiredSignedUrl(url)) {
        // The upstream proxy can occasionally cache a resource payload until
        // after its CDN signature expires. Bypass that cache exactly once.
        url = await requestResourceUrl(resourcePath, true);
      }
    }
    if (!url || !title || isExpiredSignedUrl(url)) return [];
    return [{
      link: url,
      server: title,
      type: "mp4",
      headers: {
        ...MOVIEBOX_MEDIA_HEADERS,
        ...(providerContext?.commonHeaders || {}),
      },
    }];
  } catch {
    return [];
  }
};

const transportFor = (stream) => {
  const explicit = String(stream?.transport || "").toLowerCase();
  if (["hls", "dash", "progressive", "torrent", "embed"].includes(explicit)) return explicit;
  const type = String(stream?.type || "").toLowerCase();
  const link = String(stream?.link || stream?.embedUrl || "").toLowerCase();
  if (type === "embed") return "embed";
  if (type === "m3u8" || /\.m3u8(?:[?#]|$)/.test(link)) return "hls";
  if (type === "mpd" || /\.mpd(?:[?#]|$)/.test(link)) return "dash";
  if (type === "torrent" || link.startsWith("magnet:")) return "torrent";
  return "progressive";
};

const idPart = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeStreamV2 = (streams, commonHeaders = {}) => {
  const occurrences = new Map();
  return (Array.isArray(streams) ? streams : []).flatMap((stream) => {
    const sourceLabel = typeof stream?.sourceLabel === "string"
      ? stream.sourceLabel
      : typeof stream?.serverLabel === "string"
        ? stream.serverLabel
        : typeof stream?.server === "string"
          ? stream.server
          : "";
    const link = typeof stream?.link === "string"
      ? stream.link
      : typeof stream?.embedUrl === "string"
        ? stream.embedUrl
        : "";
    const checkedLabel = sourceLabel.trim().toLowerCase();
    if (!checkedLabel || checkedLabel === "unknown" || checkedLabel === "unknown server" || !link.trim()) {
      return [];
    }
    const transport = transportFor(stream);
    const selectorKind = ["server", "audio", "source"].includes(stream?.selectorKind)
      ? stream.selectorKind
      : "server";
    const identity = `${selectorKind}|${sourceLabel}|${transport}`;
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    const playbackMode = ["native", "provider-web"].includes(stream?.playbackMode)
      ? stream.playbackMode
      : transport === "embed"
        ? "provider-web"
        : "native";
    return [{
      ...stream,
      server: sourceLabel,
      link,
      sourceId: `${PROVIDER_ID}:${idPart(identity)}:${occurrence}`,
      selectorKind,
      sourceLabel,
      serverLabel: selectorKind === "server" ? sourceLabel : (stream.serverLabel ?? null),
      labelProvenance: "provider-api",
      playbackMode,
      transport,
      health: ["unchecked", "checking", "ready", "unavailable"].includes(stream?.health)
        ? stream.health
        : "unchecked",
      headers: {...commonHeaders, ...(stream.headers || {})},
      ...(playbackMode === "provider-web" ? {embedUrl: stream.embedUrl || link} : {}),
    }];
  });
};

exports.isExpiredSignedUrl = isExpiredSignedUrl;
exports.refreshedProviderPath = refreshedProviderPath;
exports.requestResourceUrl = requestResourceUrl;
exports.normalizeStreamV2 = normalizeStreamV2;
exports.getStream = async (args) =>
  normalizeStreamV2(
    await legacyGetStream(args),
    args?.providerContext?.commonHeaders || {},
  );
