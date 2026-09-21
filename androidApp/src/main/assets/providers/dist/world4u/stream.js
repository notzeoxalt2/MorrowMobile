"use strict";

const PROVIDER_ID = "world4u";
const BROWSER_HEADERS = {
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
};

const absoluteHttpUrl = (value, base) => {
  try {
    const resolved = new URL(String(value || ""), base);
    return /^https?:$/.test(resolved.protocol) ? resolved.href : "";
  } catch {
    return "";
  }
};

const fetchText = async (url, init = {}) => {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
};

const firstMatchingAnchor = ($, predicate, base) => {
  let result = "";
  $("a[href]").each((_, element) => {
    if (result) return;
    const anchor = $(element);
    const href = anchor.attr("href") || "";
    if (predicate(anchor.text(), href)) result = absoluteHttpUrl(href, base);
  });
  return result;
};

const unwrapWorld4uMovie = async (url, cheerio) => {
  const html = await fetchText(url, {headers: BROWSER_HEADERS});
  const $ = cheerio.load(html);
  const controls = [];
  $("a[href]").each((_, element) => {
    const anchor = $(element);
    const label = anchor.text().replace(/\s+/g, " ").trim();
    if (
      !/\binstant\b|direct\s*\[\s*g-?drive|download\s*[–-]\s*watch/i.test(
        label,
      )
    ) return;
    const link = absoluteHttpUrl(anchor.attr("href"), url);
    if (!link || controls.some((control) => control.link === link)) return;
    controls.push({label, link});
  });
  return controls.length ? controls : [{label: "", link: url}];
};

const unwrapFastilinks = async (url, cheerio) => {
  const pageResponse = await fetch(url, {
    headers: {...BROWSER_HEADERS, Referer: url},
  });
  if (!pageResponse.ok) return [];
  const html = await pageResponse.text();
  const $ = cheerio.load(html);
  const tokenInput = $('input[name^="_csrf_token_"]').first();
  const tokenName = tokenInput.attr("name");
  const tokenValue = tokenInput.attr("value");
  if (!tokenName || !tokenValue) return [];

  const form = new FormData();
  form.append(tokenName, tokenValue);
  const cookie = (pageResponse.headers?.getSetCookie?.() || [])
    .map((value) => value.split(";")[0])
    .join("; ");
  const responseHtml = await fetchText(url, {
    method: "POST",
    headers: {
      ...BROWSER_HEADERS,
      Referer: url,
      ...(cookie ? {Cookie: cookie} : {}),
    },
    body: form,
  });
  const $$ = cheerio.load(responseHtml);
  const links = [];
  $$("a[href]").each((_, element) => {
    const anchor = $$(element);
    const href = absoluteHttpUrl(anchor.attr("href"), url);
    if (
      !href ||
      /fastilinks|(?:^|\.)t\.me|telegram|facebook|twitter/i.test(href)
    ) return;
    const hostname = new URL(href).hostname.toLowerCase();
    if (
      !/(?:photolinx|mediafire|gdflix|drivehub|gofile|usersdrive|vikingfile|send\.now|buzzheavier|megaup)/i.test(
        hostname,
      )
    ) return;
    if (links.some((candidate) => candidate.link === href)) return;
    links.push({link: href, hostname});
  });
  return links;
};

const serverNameForHost = (hostname) => {
  if (/photolinx/i.test(hostname)) return "Photolinx";
  if (/mediafire/i.test(hostname)) return "MediaFire";
  if (/gdflix/i.test(hostname)) return "GDFlix";
  if (/drivehub/i.test(hostname)) return "DriveHub";
  if (/gofile/i.test(hostname)) return "GoFile";
  if (/usersdrive/i.test(hostname)) return "UsersDrive";
  if (/vikingfile/i.test(hostname)) return "VikingFile";
  if (/send\.now/i.test(hostname)) return "SendNow";
  if (/buzzheavier/i.test(hostname)) return "Buzzheavier";
  if (/megaup/i.test(hostname)) return "MegaUp";
  return hostname.replace(/^www\./, "");
};

const extractMediafire = async (url, cheerio) => {
  const html = await fetchText(url, {
    headers: {...BROWSER_HEADERS, Referer: url},
  });
  const $ = cheerio.load(html);
  const download = $(".input.popsok").first();
  let directUrl = absoluteHttpUrl(download.attr("href"), url);

  if (!directUrl) {
    const scrambled = download.attr("data-scrambled-url");
    if (scrambled) {
      try {
        directUrl = absoluteHttpUrl(atob(scrambled), url);
      } catch {
        directUrl = "";
      }
    }
  }

  if (!directUrl) {
    directUrl = firstMatchingAnchor(
      $,
      (text, href) =>
        /\bdownload\b/i.test(text) &&
        /(?:download\d+\.mediafire\.com|\.mkv(?:[?#]|$)|\.mp4(?:[?#]|$))/i.test(href),
      url,
    );
  }

  return directUrl
    ? [{
        server: "Mediafire",
        link: directUrl,
        type: /\.mp4(?:[?#]|$)/i.test(directUrl) ? "mp4" : "mkv",
        headers: {Referer: url},
      }]
    : [];
};

const extractPhotolinx = async (url, cheerio) => {
  const html = await fetchText(url, {
    headers: {...BROWSER_HEADERS, Referer: url},
  });
  const $ = cheerio.load(html);
  const generate = $("#generate_url").first();
  const accessToken = generate.attr("data-token");
  const uid = generate.attr("data-uid");
  if (!accessToken || !uid) return [];

  const actionUrl = new URL("/action", url).href;
  const response = await fetch(actionUrl, {
    method: "POST",
    headers: {
      Accept: "application/json, text/plain, */*",
      "Content-Type": "application/json; charset=UTF-8",
      "User-Agent": BROWSER_HEADERS["User-Agent"],
      "X-Requested-With": "XMLHttpRequest",
      Referer: url,
    },
    body: JSON.stringify({
      type: "DOWNLOAD_GENERATE",
      payload: {access_token: accessToken, uid},
    }),
  });
  if (!response.ok) return [];
  const data = await response.json();
  const directUrl = absoluteHttpUrl(data?.download_url, url);
  const isNativeMedia = /\.(?:mkv|mp4|webm|avi|mov)(?:[?#]|$)/i.test(directUrl);
  return directUrl && isNativeMedia
    ? [{
        server: "Photolinx",
        link: directUrl,
        type: /\.mp4(?:[?#]|$)/i.test(directUrl) ? "mp4" : "mkv",
        headers: {Referer: url},
      }]
    : [];
};

const legacyGetStream = async ({link, type, providerContext}) => {
  const cheerio = providerContext?.cheerio;
  if (!cheerio) return [];

  try {
    const requestedUrl = absoluteHttpUrl(link);
    if (!requestedUrl) return [];
    const controls =
      type === "movie"
        ? await unwrapWorld4uMovie(requestedUrl, cheerio)
        : [{label: "", link: requestedUrl}];
    const streams = [];
    for (const control of controls) {
      const destinations = /fastilinks/i.test(new URL(control.link).hostname)
        ? await unwrapFastilinks(control.link, cheerio)
        : [{
            link: control.link,
            hostname: new URL(control.link).hostname.toLowerCase(),
          }];
      for (const destination of destinations) {
        try {
          const url = destination.link;
          if (!url) continue;
          const hostname = destination.hostname ||
            new URL(url).hostname.toLowerCase();
          const innerServer = serverNameForHost(hostname);
          const serverLabel = control.label
            ? `${control.label} · ${innerServer}`
            : innerServer;
          const extracted = hostname.includes("photolinx")
            ? await extractPhotolinx(url, cheerio)
            : hostname.includes("mediafire")
              ? await extractMediafire(url, cheerio)
              : [];
          if (extracted.length) {
            for (const stream of extracted) {
              streams.push({
                ...stream,
                server: serverLabel,
                providerHost: stream.server,
              });
            }
            continue;
          }
          if (hostname.includes("photolinx") || hostname.includes("mediafire")) {
            continue;
          }
          streams.push({
            server: serverLabel,
            link: url,
            embedUrl: url,
            type: "embed",
            transport: "embed",
            playbackMode: "provider-web",
            headers: {Referer: control.link},
          });
        } catch {
          // One failed host must not hide the other unlocked servers.
          continue;
        }
      }
    }
    return streams;
  } catch {
    return [];
  }
};

const transportFor = (stream) => {
  const type = String(stream?.type || "").toLowerCase();
  const link = String(stream?.link || "").toLowerCase();
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
    const sourceLabel = typeof stream?.server === "string" ? stream.server : "";
    const link = String(stream?.link || "");
    if (!sourceLabel || !link) return [];
    const transport = transportFor(stream);
    const identity = `${sourceLabel}|${transport}`;
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    return [{
      ...stream,
      sourceId: `${PROVIDER_ID}:${idPart(identity)}:${occurrence}`,
      selectorKind: "server",
      sourceLabel,
      serverLabel: sourceLabel,
      labelProvenance: "reviewed-host",
      playbackMode: transport === "embed" ? "provider-web" : "native",
      transport,
      health: "unchecked",
      headers: {...commonHeaders, ...(stream.headers || {})},
      ...(typeof stream.seekable === "boolean" ? {seekable: stream.seekable} : {}),
    }];
  });
};

exports.normalizeStreamV2 = normalizeStreamV2;
exports.getStream = async (args) =>
  normalizeStreamV2(
    await legacyGetStream(args),
    args?.providerContext?.commonHeaders || {},
  );
