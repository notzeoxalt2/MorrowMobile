"use strict";
const __kandoProviderId = "luxMovies";
const __kandoLabelProvenance = "reviewed-host";
const __kandoRogUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";
const __kandoResolveRogFilePress = async (link, axios, signal) => {
  const requestedLink = String(link || "").trim();
  if (
    !/^https?:\/\/(?:[^/]+\.)?(?:filebee\.xyz|filepress\.(?:baby|cloud))\/file\//i.test(
      requestedLink,
    )
  ) return [];
  let pageUrl = requestedLink;
  try {
    const response = await fetch(requestedLink, {
      headers: {Referer: requestedLink, "User-Agent": __kandoRogUserAgent},
      signal,
      redirect: "follow",
    });
    if (!response.ok) return [];
    pageUrl = response.url || requestedLink;
    await response.body?.cancel?.().catch(() => {});
  } catch {
    return [];
  }
  let page;
  try { page = new URL(pageUrl); } catch { return []; }
  if (!/filepress\.(?:baby|cloud)$/i.test(page.hostname)) return [];
  const fileId = page.pathname.split("/").filter(Boolean).pop();
  if (!fileId) return [];
  const baseUrl = page.origin;
  const body = {id: fileId, method: "indexDownlaod", captchaValue: null};
  const apiHeaders = {
    "Content-Type": "application/json",
    Origin: baseUrl,
    Referer: `${baseUrl}/`,
  };
  try {
    const tokenResponse = await axios.post(
      `${baseUrl}/api/file/downlaod/`,
      body,
      {headers: apiHeaders, signal},
    );
    const token = tokenResponse?.data?.status ? tokenResponse.data.data : "";
    if (!token) return [];
    const streamResponse = await axios.post(
      `${baseUrl}/api/file/downlaod2/`,
      {...body, id: token},
      {headers: apiHeaders, signal},
    );
    return (Array.isArray(streamResponse?.data?.data)
      ? streamResponse.data.data
      : [])
      .filter((mediaLink) => /^https?:\/\//i.test(String(mediaLink || "")))
      .map((mediaLink, index) => ({
        server: index ? `FilePress ${index + 1}` : "FilePress",
        link: mediaLink,
        type: "mkv",
        headers: {Referer: `${baseUrl}/`},
      }));
  } catch {
    return [];
  }
};
const __kandoRogGofileApi = "https://api.gofile.io";
const __kandoRogGofileLanguage = "en-US";
const __kandoRogGofileWebsiteSecret = "9844d94d963d30";
const __kandoFindRogGofile = (content) => {
  if (content?.type === "file" && content?.link) return content;
  for (const child of Object.values(content?.children || {})) {
    const file = __kandoFindRogGofile(child);
    if (file) return file;
  }
  return null;
};
const __kandoResolveRogGofile = async (link, axios, Crypto, signal) => {
  try {
    const id = new URL(link).pathname.split("/").filter(Boolean).pop();
    if (!id || !Crypto?.digestStringAsync) return [];
    const accountResponse = await axios.post(
      `${__kandoRogGofileApi}/accounts`,
      undefined,
      {headers: {"User-Agent": __kandoRogUserAgent}, signal},
    );
    const accountToken = accountResponse?.data?.data?.token;
    if (!accountToken) return [];
    const timeBucket = Math.floor(Date.now() / 1_000 / 14_400);
    const websiteToken = await Crypto.digestStringAsync(
      "SHA-256",
      [
        __kandoRogUserAgent,
        __kandoRogGofileLanguage,
        accountToken,
        timeBucket,
        __kandoRogGofileWebsiteSecret,
      ].join("::"),
    );
    const contentResponse = await axios.get(
      `${__kandoRogGofileApi}/contents/${id}`,
      {
        params: {
          contentFilter: "",
          page: 1,
          pageSize: 1_000,
          sortField: "name",
          sortDirection: 1,
        },
        headers: {
          Accept: "*/*",
          "Accept-Language": `${__kandoRogGofileLanguage},en;q=0.9`,
          Authorization: `Bearer ${accountToken}`,
          Origin: "https://gofile.io",
          Referer: "https://gofile.io/",
          "User-Agent": __kandoRogUserAgent,
          "X-BL": __kandoRogGofileLanguage,
          "X-Website-Token": websiteToken,
        },
        signal,
      },
    );
    if (contentResponse?.data?.status !== "ok") return [];
    const file = __kandoFindRogGofile(contentResponse.data.data);
    if (!file?.link) return [];
    return [{
      server: "Gofile",
      link: file.link,
      type: "mkv",
      headers: {
        Referer: "https://gofile.io/",
        Cookie: `accountToken=${accountToken}`,
      },
    }];
  } catch {
    return [];
  }
};
const __kandoLegacyGetStream = async ({link, signal, providerContext}) => {
  const {axios, cheerio, commonHeaders = {}, Crypto} = providerContext;
  const headers = {...commonHeaders};
  const absolute = (value, base) => {
    try { return new URL(value, base).href; } catch { return ""; }
  };
  const decodeGateway = (html) => {
    const twice = html.match(/var\s+url\s*=\s*atob\(atob\(['"]([^'"]+)['"]\)\)/i)?.[1];
    if (twice) {
      try { return atob(atob(twice)); } catch {}
    }
    const plain = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i)?.[1] || "";
    if (!plain) return "";
    try { return plain.includes("r=") ? atob(plain.split("r=").pop()) : plain; } catch { return plain; }
  };
  try {
    let gateway = String(link || "");
    let landingHtml = "";
    let landingUrl = gateway;
    const results = [];
    const seen = new Set();
    const append = (streams) => {
      for (const stream of Array.isArray(streams) ? streams : []) {
        if (!stream?.link || seen.has(stream.link)) continue;
        seen.add(stream.link);
        results.push(stream);
      }
    };
    if (!gateway.includes("cloud")) {
      const landing = await axios.get(gateway, {headers, signal});
      landingHtml = String(landing.data || "");
      landingUrl =
        landing?.request?.res?.responseUrl ||
        landing?.config?.url ||
        gateway;
      const $landing = cheerio.load(landingHtml);
      const landingLinks = $landing("a[href]").toArray()
        .map((node) => absolute($landing(node).attr("href") || "", landingUrl))
        .filter(Boolean);
      gateway = landingLinks
        .find((href) => /(?:hubcloud|vcloud|cloud\.)/i.test(href)) || gateway;
      gateway = absolute(gateway, link);
      for (const candidate of landingLinks) {
        if (/(?:filebee\.xyz|filepress\.(?:baby|cloud))\/file\//i.test(candidate)) {
          append(await __kandoResolveRogFilePress(candidate, axios, signal));
        } else if (/gofile\.io\/d\//i.test(candidate)) {
          append(await __kandoResolveRogGofile(candidate, axios, Crypto, signal));
        }
      }
    }
    const gatewayResponse = await axios.get(gateway, {headers, signal});
    const gatewayHtml = String(gatewayResponse.data || "");
    const $gateway = cheerio.load(gatewayHtml);
    let cloudPage = decodeGateway(gatewayHtml) ||
      $gateway(".fa-file-download.fa-lg").parent().attr("href") ||
      $gateway("a[href*='hubcloud'],a[href*='/drive/']").first().attr("href") ||
      gateway;
    cloudPage = absolute(cloudPage, gateway);
    const cloudResponse = await fetch(cloudPage, {headers, signal, redirect: "follow"});
    const cloudHtml = await cloudResponse.text();
    const $ = cheerio.load(cloudHtml);
    const redirectedPixelDrain =
      cloudHtml.match(/var\s+pxl\s*=\s*['"]([^'"]+)['"];?/i)?.[1] || "";
    for (const node of $(".btn-success.btn-lg.h6,.btn-danger,.btn-secondary,a[href*='pixeldrain'],a[href*='hubcdn']").toArray()) {
      const rawHref = String($(node).attr("href") || "").trim();
      if (!rawHref) continue;
      let mediaLink = absolute(rawHref, cloudPage);
      if (!mediaLink || !/^https?:\/\//i.test(mediaLink)) continue;
      const providerLabel = $(node).text().replace(/\s+/g, " ").trim();
      if (!providerLabel || /android\s+app|telegram|tutorial|login|\b(?:idm|ida|vpn)\b/i.test(providerLabel)) continue;
      let server = "";
      if (/pixeld/i.test(mediaLink)) {
        server = providerLabel || "Pixeldrain";
        if (redirectedPixelDrain) mediaLink = absolute(redirectedPixelDrain, cloudPage);
        if (!mediaLink.includes("/api/file/")) {
          const token = new URL(mediaLink).pathname.match(/\/u\/([^/?#]+)/i)?.[1];
          if (token) mediaLink = `${new URL(mediaLink).origin}/api/file/${token}`;
        }
        try {
          const probe = await fetch(mediaLink, {method: "HEAD", headers, signal, redirect: "follow"});
          await probe.body?.cancel?.().catch?.(() => {});
          if (probe.status === 404 || probe.status === 410) continue;
        } catch {
          // A failed validation request is inconclusive; keep the exact row.
        }
      } else if (/gofile\.io\/d\//i.test(mediaLink)) {
        append(await __kandoResolveRogGofile(mediaLink, axios, Crypto, signal));
        continue;
      } else if (/(?:filebee\.xyz|filepress\.(?:baby|cloud))\/file\//i.test(mediaLink)) {
        append(await __kandoResolveRogFilePress(mediaLink, axios, signal));
        continue;
      } else if (/cloudflarestorage/i.test(mediaLink)) server = providerLabel || "CfStorage";
      else if (/(?:fastdl|fsl\.)/i.test(mediaLink)) server = providerLabel || "FastDl";
      else if (/hubcdn/i.test(mediaLink)) server = providerLabel || "HubCdn";
      else if (/(?:hubcloud|\/\?id=)/i.test(mediaLink)) {
        try {
          const first = await fetch(mediaLink, {
            method: "HEAD",
            headers: {...headers, Referer: cloudPage},
            signal,
            redirect: "manual",
          });
          let resolvedUrl =
            first.headers?.get?.("location") ||
            (first.url && first.url !== mediaLink ? first.url : mediaLink);
          await first.body?.cancel?.().catch?.(() => {});
          let directLink = new URL(resolvedUrl).searchParams.get("link") || "";
          if (!directLink && !/googleusercontent/i.test(resolvedUrl)) {
            const second = await fetch(resolvedUrl, {
              method: "HEAD",
              headers: {...headers, Referer: cloudPage},
              signal,
              redirect: "manual",
            });
            resolvedUrl =
              second.headers?.get?.("location") ||
              (second.url && second.url !== resolvedUrl
                ? second.url
                : resolvedUrl);
            await second.body?.cancel?.().catch?.(() => {});
            directLink = new URL(resolvedUrl).searchParams.get("link") || "";
          }
          mediaLink = directLink ||
            (/googleusercontent/i.test(resolvedUrl) ? resolvedUrl : "");
        } catch {
          mediaLink = "";
        }
        if (mediaLink) server = providerLabel || "hubcloud";
      }
      else if (/\.(?:mkv|mp4)(?:[?#]|$)|[?&]token=/i.test(mediaLink)) server = providerLabel;
      if (!server || !mediaLink || seen.has(mediaLink)) continue;
      seen.add(mediaLink);
      results.push({server, link: mediaLink, type: /\.mp4(?:[?#]|$)/i.test(mediaLink) ? "mp4" : "mkv", headers});
    }
    return results;
  } catch (error) {
    if (error?.name !== "AbortError" && error?.code !== "ERR_CANCELED") console.error("RogMovies stream error", error);
    return [];
  }
};
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
exports.normalizeStreamV2 = __kandoNormalizeStreamV2;
exports.getStream = async (args) => {
  const playbackHeaders = {...(args?.providerContext?.commonHeaders || {})};
  const requestHeaders = {...playbackHeaders};
  const providerContext = {...(args?.providerContext || {}), commonHeaders: requestHeaders};
  return __kandoNormalizeStreamV2(
    await __kandoLegacyGetStream({...args, providerContext}),
    playbackHeaders,
  );
};
