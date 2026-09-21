const BASE = "https://www.desidubanime.me";
const HELPER = "https://pro.iqsmartgames.com";
const PLAYER_KEY = new TextEncoder().encode("kiemtienmua911ca");
const PLAYER_IV = new TextEncoder().encode("1234567890oiuytr");
const BROWSER_HEADERS = {
  "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Accept:"*/*", "Accept-Language":"en-US,en;q=0.9",
  "Sec-Fetch-Dest":"empty", "Sec-Fetch-Mode":"cors", "Sec-Fetch-Site":"same-origin",
};

function absolute(value, base) { if (!value) return ""; try { return new URL(value, base).href; } catch { return ""; } }
function decode(value) {
  try {
    const raw = String(value || "").replace(/\s+/g, "");
    const bytes = Uint8Array.from(atob(raw), (char) => char.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return {}; }
}

async function decryptPlayerPayload(value) {
  const clean = String(value || "").trim();
  if (!/^[0-9a-f]+$/i.test(clean) || clean.length % 32 !== 0) return null;
  const encrypted = Uint8Array.from(clean.match(/.{2}/g), (part) => parseInt(part, 16));
  const key = await crypto.subtle.importKey("raw", PLAYER_KEY, {name:"AES-CBC"}, false, ["decrypt"]);
  const clear = await crypto.subtle.decrypt({name:"AES-CBC", iv:PLAYER_IV}, key, encrypted);
  return JSON.parse(new TextDecoder().decode(clear));
}

function subtitleTracks(payload, origin) {
  const rows = payload?.subtitle && typeof payload.subtitle === "object" ? Object.entries(payload.subtitle) : [];
  return rows.map(([label, value]) => {
    const raw = String(value || "");
    const language = String(raw.split("#").pop() || label || "en").slice(0, 2).toLowerCase();
    return {title:String(label || language).toUpperCase(), language, type:"text/vtt", uri:absolute(raw.split("#")[0], origin)};
  }).filter((track) => /^https?:/i.test(track.uri));
}

function serverLabel(category, label) {
  return String(label || "").trim();
}

function expiryOf(value) {
  try {
    const url = new URL(value);
    const raw = Number(url.searchParams.get("expires") || url.searchParams.get("exp") || url.searchParams.get("kx"));
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    return raw > 10_000_000_000 ? raw : raw * 1000;
  } catch { return undefined; }
}

function sourceId(category, label, url, variant = "") {
  let host = "";
  try { host = new URL(url).hostname; } catch {}
  return ["desidub", category, label, host, variant]
    .map((part) => String(part || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean)
    .join(":");
}

function responseHeader(headers, name) {
  if (typeof headers?.get === "function") return String(headers.get(name) || "");
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return String(entry?.[1] || "");
}

function nativeKindFromUrl(value) {
  try {
    const pathname = new URL(value).pathname.toLowerCase();
    if (pathname.endsWith(".m3u8")) return "hls";
    if (pathname.endsWith(".mpd")) return "dash";
    if (pathname.endsWith(".mp4")) return "progressive";
  } catch {}
  return "";
}

function manifestUriLines(value) {
  return String(value || "").split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function hlsVariants(value, baseUrl) {
  const lines = String(value || "").split(/\r?\n/).map((line) => line.trim());
  const variants = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!/^#EXT-X-STREAM-INF:/i.test(lines[index])) continue;
    const uri = lines.slice(index + 1).find((line) => line && !line.startsWith("#"));
    const url = absolute(uri, baseUrl);
    if (!url) continue;
    const height = Number(lines[index].match(/\bRESOLUTION=\d+x(\d+)/i)?.[1] || 0);
    const bandwidth = Number(lines[index].match(/\bBANDWIDTH=(\d+)/i)?.[1] || 0);
    variants.push({url, height, bandwidth});
  }
  return variants.sort((left, right) =>
    right.height - left.height || right.bandwidth - left.bandwidth
  );
}

function hlsAudioRenditions(value, baseUrl) {
  return String(value || "").split(/\r?\n/)
    .filter((line) => /^#EXT-X-MEDIA:/i.test(line) && /\bTYPE=AUDIO\b/i.test(line))
    .map((line) => {
      const uri = line.match(/\bURI=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i)
        ?.slice(1).find(Boolean);
      const url = absolute(uri, baseUrl);
      const preferred = /\bDEFAULT=YES\b/i.test(line) || /\bAUTOSELECT=YES\b/i.test(line);
      return url ? {url, preferred} : null;
    })
    .filter(Boolean)
    .sort((left, right) => Number(right.preferred) - Number(left.preferred));
}

function initMapUri(value) {
  return String(value || "").match(
    /#EXT-X-MAP:[^\r\n]*\bURI=(?:"([^"]+)"|'([^']+)'|([^,\s]+))/i,
  )?.slice(1).find(Boolean) || "";
}

function toBytes(value) {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return new TextEncoder().encode(String(value || ""));
}

function isMediaSegmentResponse(response) {
  const bytes = toBytes(response?.data);
  const contentType = responseHeader(response?.headers, "content-type").toLowerCase();
  if (bytes.byteLength < 512 || /(?:text\/html|application\/json)/i.test(contentType)) return false;
  const prefix = new TextDecoder().decode(bytes.slice(0, 160)).trimStart().toLowerCase();
  return !/^(?:<!doctype|<html|<body|\{\\?"(?:error|message|status)")/.test(prefix);
}

async function verifiedMediaPlaylist(url, manifest, headers, signal, providerContext) {
  const references = [
    initMapUri(manifest),
    ...manifestUriLines(manifest).slice(0, 2),
  ].filter((value, index, all) => value && all.indexOf(value) === index);
  if (!references.length) return false;
  const probes = await Promise.all(references.map(async (reference) => {
    const segmentUrl = absolute(reference, url);
    if (!segmentUrl) return false;
    try {
      const segmentResponse = await providerContext.axios.get(segmentUrl, {
        signal,
        timeout:5500,
        forceDoh:true,
        responseType:"arraybuffer",
        headers:{...headers, Range:"bytes=0-65535"},
      });
      return isMediaSegmentResponse(segmentResponse);
    } catch {
      return false;
    }
  }));
  return probes.every(Boolean);
}

async function verifiedHlsCandidate(url, playerUrl, signal, providerContext) {
  const parsed = new URL(playerUrl);
  const headers = {
    ...BROWSER_HEADERS,
    Accept:"application/vnd.apple.mpegurl, application/x-mpegURL, */*",
    Referer:playerUrl,
    Origin:parsed.origin,
  };
  const response = await providerContext.axios.get(url, {
    signal, timeout:4500, forceDoh:true, responseType:"text", headers,
  });
  const manifest = String(response?.data || "").trimStart();
  const contentType = responseHeader(response?.headers, "content-type").toLowerCase();
  if (!/^#EXTM3U\b/.test(manifest) && !/(?:mpegurl|vnd\.apple)/.test(contentType)) return null;

  let mediaUrl = url;
  let mediaManifest = manifest;
  let selectedHeight = 0;
  let videoPlaylistVerified = false;
  if (/#EXT-X-STREAM-INF:/i.test(manifest)) {
    const variants = hlsVariants(manifest, url).slice(0, 6);
    if (!variants.length) return null;
    const verifiedVariants = (await Promise.all(variants.map(async (variant) => {
      try {
        const variantResponse = await providerContext.axios.get(variant.url, {
          signal, timeout:4500, forceDoh:true, responseType:"text", headers,
        });
        const body = String(variantResponse?.data || "").trimStart();
        if (
          !/^#EXTM3U\b/.test(body) ||
          !await verifiedMediaPlaylist(
            variant.url,
            body,
            headers,
            signal,
            providerContext,
          )
        ) return null;
        return {...variant, manifest:body};
      } catch {
        return null;
      }
    }))).filter(Boolean);
    // Returning the master lets MPV keep its audio group and quality selector.
    // Do not expose it when one of the qualities it advertises is already
    // dead, because libav may select that row and hang before playback starts.
    if (verifiedVariants.length !== variants.length) return null;
    const resolved = verifiedVariants[0];
    mediaUrl = resolved.url;
    mediaManifest = resolved.manifest;
    selectedHeight = resolved.height;
    videoPlaylistVerified = true;
  }

  if (
    !videoPlaylistVerified &&
    !await verifiedMediaPlaylist(
      mediaUrl,
      mediaManifest,
      headers,
      signal,
      providerContext,
    )
  ) {
    return null;
  }

  const audioRenditions = hlsAudioRenditions(manifest, url);
  if (audioRenditions.length) {
    let workingAudio = false;
    for (const audio of audioRenditions.slice(0, 4)) {
      try {
        const audioResponse = await providerContext.axios.get(audio.url, {
          signal, timeout:4500, forceDoh:true, responseType:"text", headers,
        });
        const audioManifest = String(audioResponse?.data || "").trimStart();
        if (
          /^#EXTM3U\b/.test(audioManifest) &&
          await verifiedMediaPlaylist(
            audio.url,
            audioManifest,
            headers,
            signal,
            providerContext,
          )
        ) {
          workingAudio = true;
          break;
        }
      } catch {}
    }
    if (!workingAudio) return null;
    return {url, kind:"hls"};
  }

  return {
    url:mediaUrl,
    kind:"hls",
    quality:selectedHeight ? String(selectedHeight) : undefined,
  };
}

async function verifiedNativeCandidate(value, playerUrl, signal, providerContext) {
  const url = absolute(value, playerUrl);
  const hintedKind = nativeKindFromUrl(url);
  if (!url || !hintedKind) return null;
  // Progressive URLs are explicit media values from the player/API. Avoid
  // downloading an entire MP4 during extraction when an origin ignores Range.
  if (hintedKind === "progressive") return {url, kind:hintedKind};
  try {
    if (hintedKind === "hls") {
      return await verifiedHlsCandidate(url, playerUrl, signal, providerContext);
    }
    const parsed = new URL(playerUrl);
    const response = await providerContext.axios.get(url, {
      signal, timeout:4000, forceDoh:true, responseType:"text",
      headers:{...BROWSER_HEADERS, Accept:"application/dash+xml, */*", Referer:playerUrl, Origin:parsed.origin},
    });
    const body = String(response?.data || "").trimStart();
    const contentType = responseHeader(response?.headers, "content-type").toLowerCase();
    const isDash = /<MPD(?:\s|>)/i.test(body) && /(?:dash|xml)/.test(contentType);
    if (hintedKind === "dash" && isDash) return {url, kind:"dash"};
  } catch {}
  return null;
}

async function resolveEncryptedPlayer(playerUrl, label, category, signal, providerContext) {
  let parsed;
  try { parsed = new URL(playerUrl); } catch { return []; }
  const videoId = parsed.hash.replace(/^#/, "").split("&")[0];
  if (!videoId) return [];
  try {
    const apiUrl = `${parsed.origin}/api/v1/video?id=${encodeURIComponent(videoId)}&w=1920&h=1080&r=desidubanime.me`;
    const response = await providerContext.axios.get(apiUrl, {
      signal, timeout:3500, forceDoh:true,
      headers:{...BROWSER_HEADERS, Referer:playerUrl},
    });
    const payload = await decryptPlayerPayload(response.data);
    const candidates = [payload?.cfNative, payload?.source, payload?.cf, payload?.hlsVideoTiktok, payload?.hlsVideoGoogle]
      .map((value) => absolute(value, parsed.origin))
      .filter((value, index, all) => /^https?:/i.test(value) && all.indexOf(value) === index);
    const tracks = subtitleTracks(payload, parsed.origin);
    let selected = null;
    for (const candidate of candidates) {
      selected = await verifiedNativeCandidate(candidate, playerUrl, signal, providerContext);
      if (selected) break;
    }
    if (!selected) return [];
    return [{
      server:serverLabel(category, label),
      serverLabel:serverLabel(category, label),
      sourceLabel:serverLabel(category, label),
      selectorKind:"server",
      labelProvenance:"provider-dom",
      playbackMode:"native",
      health:"unchecked",
      languageCategory:category,
      link:selected.url,
      expiresAt:expiryOf(selected.url),
      transport:selected.kind,
      type:selected.kind === "hls" ? "m3u8" : selected.kind === "dash" ? "mpd" : "mp4",
      quality:selected.quality,
      headers:{...BROWSER_HEADERS, Referer:playerUrl, Origin:parsed.origin},
      subtitles:tracks,
    }];
  } catch { return []; }
}

async function resolveDirectPage(playerUrl, label, category, signal, providerContext) {
  try {
    const parsed = new URL(playerUrl);
    const response = await providerContext.axios.get(playerUrl, {signal, timeout:3000, forceDoh:true, headers:{...BROWSER_HEADERS, Referer:BASE}});
    const html = String(response.data || "").replace(/\\\//g, "/");
    const $ = providerContext.cheerio.load(html);
    const tagged = $("video[src],source[src]").map((_, element) => $(element).attr("src")).get();
    const configured = [...html.matchAll(/(?:\bfile|\bsrc|\bsource)\s*[=:]\s*["']([^"']+?\.(?:m3u8|mp4)(?:\?[^"']*)?)["']/gi)]
      .map((match) => match[1]);
    // Only accept URLs explicitly configured as media. A broad page-wide URL
    // regex can accidentally promote an advertisement into a KANDO server.
    const urls = [...tagged, ...configured]
      .map((value) => absolute(String(value || "").replace(/\\u0026/g, "&"), playerUrl))
      .filter((url) => /^https?:/i.test(url))
      .filter((url, index, all) => all.indexOf(url) === index);
    let selected = null;
    for (const url of urls) {
      selected = await verifiedNativeCandidate(url, playerUrl, signal, providerContext);
      if (selected) break;
    }
    if (!selected) return [];
    return [{
      server:serverLabel(category, label),
      serverLabel:serverLabel(category, label),
      sourceLabel:serverLabel(category, label),
      selectorKind:"server",
      labelProvenance:"provider-dom",
      playbackMode:"native", health:"unchecked",
      languageCategory:category, link:selected.url, expiresAt:expiryOf(selected.url),
      transport:selected.kind,
      type:selected.kind === "hls" ? "m3u8" : selected.kind === "dash" ? "mpd" : "mp4",
      quality:selected.quality,
      headers:{...BROWSER_HEADERS, Referer:playerUrl, Origin:parsed.origin},
    }];
  } catch { return []; }
}

function decodeBase64(value) {
  try { return new TextDecoder().decode(Uint8Array.from(atob(String(value || "")), (char) => char.charCodeAt(0))); }
  catch { return ""; }
}

function decodePlayerButton(element, $, pageUrl) {
  const encoded = String($(element).attr("data-embed-id") || "");
  const separator = encoded.indexOf(":");
  if (separator < 1) return null;
  const key = decodeBase64(encoded.slice(0, separator)).toLowerCase();
  const payload = decodeBase64(encoded.slice(separator + 1)).replace(/\\\//g, "/");
  const rawUrl = payload.match(/https?:\/\/[^'"<>\s]+/i)?.[0] || payload;
  const playerUrl = absolute(rawUrl, pageUrl);
  if (!/^https?:/i.test(playerUrl)) return null;
  const label = $(element).text().replace(/\s+/g, " ").trim();
  if (!label) return null;
  const category = /sub/.test(key) ? "sub" : /multi/.test(key) ? "multi" : "dub";
  return {playerUrl, label, category};
}

async function resolveMirror(playerUrl, label, category, signal, providerContext) {
  const sid = String(playerUrl).match(/\/embed\/([^/?#]+)/i)?.[1];
  if (!sid) return [];
  try {
    const result = await providerContext.axios.post(`${HELPER}/embedhelper2.php`,
      `sid=${encodeURIComponent(sid)}&UserFavSite=&currentDomain=${encodeURIComponent(JSON.stringify(["www.desidubanime.me", "pro.iqsmartgames.com"]))}`,
      {signal, timeout:3500, forceDoh:true, headers:{"Content-Type":"application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With":"XMLHttpRequest", Referer:playerUrl, Origin:HELPER}},
    );
    const payload = typeof result.data === "string" ? JSON.parse(result.data) : result.data || {};
    const codes = decode(payload.mresult);
    const sources = Array.isArray(payload.sources)
      ? payload.sources.map((source) => [source?.key || source?.id || source?.name, source])
      : Object.entries(payload.sources || {});
    const jobs = sources.map(async ([sourceKey, source]) => {
      const key = sourceKey || source?.key || source?.id || source?.name;
      const code = codes?.[key] ?? codes?.[source?.source] ?? source?.code;
      const prefix = source?.siteUrl || source?.site_url || source?.url;
      if (!key || !code || !prefix) throw new Error("Incomplete mirror source");
      const url = `${prefix}${code}${source?.embed_suffix || source?.suffix || ""}`;
      if (!/^https?:/i.test(url)) throw new Error("Invalid mirror source");
      const native = await resolveEncryptedPlayer(url, label, category, signal, providerContext);
      const result = native.length ? native : await resolveDirectPage(url, label, category, signal, providerContext);
      if (!result.length) throw new Error("Mirror did not expose native media");
      return result;
    });
    // The visible site exposes these as one Mirror button. Return the first
    // working backing CDN instead of waiting for every hidden replica timeout.
    const first = await Promise.any(jobs);
    return first.map((stream) => ({...stream, server:serverLabel(category, label)}));
  } catch { return []; }
}

exports.getStream = async ({link, signal, providerContext}) => {
  const page = await providerContext.axios.get(link, {signal, timeout:15000, forceDoh:true});
  const $ = providerContext.cheerio.load(String(page.data || ""));
  const buttons = $('[data-embed-id]').map((_, element) => decodePlayerButton(element, $, link)).get().filter(Boolean);
  if (!buttons.length) throw new Error("DesiDubAnime did not expose its episode players");
  const jobs = buttons.map(async ({playerUrl, label, category}) => {
    let candidates;
    if (/gdmirrorbot\./i.test(playerUrl)) candidates = await resolveMirror(playerUrl, label, category, signal, providerContext);
    else {
      const native = await resolveEncryptedPlayer(playerUrl, label, category, signal, providerContext);
      candidates = native.length ? native : await resolveDirectPage(playerUrl, label, category, signal, providerContext);
    }
    if (candidates.length) {
      // These sources came from a provider player/API, so keep all real
      // variants. Playback health is checked through the same header-preserving
      // session that will actually play them, not a lossy extraction preflight.
      return candidates.map((candidate, index) => ({
        ...candidate,
        playbackMode:"native",
        health:"unchecked",
        sourceId:sourceId(category, label, playerUrl, candidates.length > 1 ? index + 1 : ""),
      }));
    }
    // The original button exists, but its player did not expose a native media
    // URI. Omit it instead of turning provider UI into a playback fallback.
    return [];
  });
  const streams = (await Promise.all(jobs)).flat();
  const unique = streams.filter((stream, index, all) => all.findIndex((other) => other.link === stream.link && other.server === stream.server && other.playbackMode === stream.playbackMode) === index);
  if (!unique.length) throw new Error("DesiDubAnime did not expose a native media URI; its remaining choices require opaque provider players");
  return unique;
};
