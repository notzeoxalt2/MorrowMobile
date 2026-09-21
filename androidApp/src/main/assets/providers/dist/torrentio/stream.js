"use strict";
const __kandoProviderId = "torrentio";
const __kandoLabelProvenance = "provider-api";
const __kandoTransportFor = (stream) => {
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
const __kandoIdPart = (value) => {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
const __kandoIsPlayableLink = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "magnet:") return /^urn:btih:/i.test(parsed.searchParams.get("xt") || "");
    return ["http:", "https:"].includes(parsed.protocol)
      && Boolean(parsed.hostname)
      && !["undefined", "null"].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};
const __kandoNormalizeStreamV2 = (streams, commonHeaders = {}) => {
  const occurrences = new Map();
  return (Array.isArray(streams) ? streams : []).flatMap((candidate) => {
    const stream = candidate && typeof candidate === "object" ? candidate : {};
    const sourceLabel = typeof stream.sourceLabel === "string"
      ? stream.sourceLabel
      : typeof stream.serverLabel === "string"
        ? stream.serverLabel
        : typeof stream.server === "string"
          ? stream.server
          : "";
    const link = typeof stream.link === "string"
      ? stream.link
      : typeof stream.embedUrl === "string"
        ? stream.embedUrl
        : "";
    const checkedLabel = sourceLabel.trim().toLowerCase();
    if (!checkedLabel || checkedLabel === "unknown" || checkedLabel === "unknown server" || !__kandoIsPlayableLink(link)) return [];
    const transport = __kandoTransportFor(stream);
    const selectorKind = ["server", "audio", "source"].includes(stream.selectorKind)
      ? stream.selectorKind
      : "server";
    const stableIdentity = typeof stream.__kandoStableIdentity === "string" && stream.__kandoStableIdentity
      ? stream.__kandoStableIdentity
      : `${selectorKind}|${sourceLabel}|${transport}`;
    const occurrence = (occurrences.get(stableIdentity) || 0) + 1;
    occurrences.set(stableIdentity, occurrence);
    const playbackMode = ["native", "provider-web"].includes(stream.playbackMode)
      ? stream.playbackMode
      : transport === "embed"
        ? "provider-web"
        : "native";
    const {__kandoStableIdentity: _stableIdentity, ...publicStream} = stream;
    return [{
      ...publicStream,
      server: sourceLabel,
      link,
      sourceId: `${__kandoProviderId}:${__kandoIdPart(stableIdentity)}:${occurrence}`,
      selectorKind,
      sourceLabel,
      serverLabel: selectorKind === "server" ? sourceLabel : (stream.serverLabel ?? null),
      labelProvenance: __kandoLabelProvenance,
      playbackMode,
      transport,
      health: ["unchecked", "checking", "ready", "unavailable"].includes(stream.health)
        ? stream.health
        : "unchecked",
      headers: {...commonHeaders, ...(stream.headers || {})},
      ...(playbackMode === "provider-web" ? {embedUrl: stream.embedUrl || link} : {}),
    }];
  });
};
const __kandoParseTorrentioPayload = (id, requestedType) => {
  let payload;
  try {
    payload = JSON.parse(id);
  } catch {
    payload = {imdbId: id};
  }
  if (!payload || typeof payload !== "object") return null;
  const imdbId = typeof payload.imdbId === "string" ? payload.imdbId : "";
  if (!/^tt\d+$/.test(imdbId)) return null;
  const effectiveType = payload.type === "series" || requestedType === "series" ? "series" : "movie";
  const season = String(payload.season ?? "");
  const episode = String(payload.episode ?? "");
  if (effectiveType === "series" && (!/^\d+$/.test(season) || !/^\d+$/.test(episode))) return null;
  return {imdbId, effectiveType, season, episode};
};
const __kandoTorrentioGetStream = async ({link: id, type, signal, providerContext}) => {
  try {
    const payload = __kandoParseTorrentioPayload(id, type);
    if (!payload) return [];
    const suffix = payload.effectiveType === "series"
      ? `${payload.imdbId}:${payload.season}:${payload.episode}`
      : payload.imdbId;
    const endpoint = `https://torrentio.strem.fun/stream/${payload.effectiveType}/${suffix}.json`;
    const response = await providerContext.axios.get(endpoint, {timeout: 10000, signal});
    const rawStreams = Array.isArray(response?.data?.streams) ? response.data.streams : [];
    const streams = rawStreams.flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const sourceLabel = typeof entry.name === "string" && entry.name.trim()
        ? entry.name
        : typeof entry.title === "string" && entry.title.trim()
          ? entry.title
          : "";
      if (!sourceLabel) return [];
      let mediaLink = typeof entry.url === "string" ? entry.url : "";
      const infoHash = typeof entry.infoHash === "string" ? entry.infoHash.trim().toLowerCase() : "";
      if (!mediaLink && /^[a-f0-9]{40}$/i.test(infoHash)) {
        mediaLink = `magnet:?xt=urn:btih:${infoHash}`;
      }
      if (!__kandoIsPlayableLink(mediaLink)) return [];
      const fileIdentity = typeof entry.behaviorHints?.filename === "string"
        ? entry.behaviorHints.filename
        : "";
      return [{
        server: sourceLabel,
        link: mediaLink,
        type: mediaLink.startsWith("magnet:") ? "torrent" : "mp4",
        __kandoStableIdentity: infoHash || `${sourceLabel}|${fileIdentity}`,
      }];
    });
    return __kandoNormalizeStreamV2(streams, providerContext?.commonHeaders || {});
  } catch (error) {
    if (error?.name !== "AbortError") console.error("Torrentio getStream error:", error);
    return [];
  }
};
exports.normalizeStreamV2 = __kandoNormalizeStreamV2;
exports.getStream = __kandoTorrentioGetStream;
