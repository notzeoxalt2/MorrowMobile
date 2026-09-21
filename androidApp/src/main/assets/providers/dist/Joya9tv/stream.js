"use strict";
const __kandoProviderId = "Joya9tv";
const __kandoLabelProvenance = "reviewed-host";
const __kandoLegacyGetStream = async ({ link, signal, providerContext }) => {
  const { axios, cheerio, commonHeaders = {} } = providerContext;
  const headers = { ...commonHeaders };
  const absolute = (value, base) => {
    try {
      return new URL(value, base).href;
    } catch {
      return "";
    }
  };
  const decodeGateway = (html) => {
    const twice = html.match(
      /var\s+url\s*=\s*atob\(atob\(['"]([^'"]+)['"]\)\)/i,
    )?.[1];
    if (twice) {
      try {
        return atob(atob(twice));
      } catch {}
    }
    const plain = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/i)?.[1] || "";
    if (!plain) return "";
    try {
      return plain.includes("r=") ? atob(plain.split("r=").pop()) : plain;
    } catch {
      return plain;
    }
  };
  const extractMultiCloudSource = async (html, pageUrl) => {
    const $page = cheerio.load(String(html || ""));
    const multiCloudPages = [
      ...new Set(
        $page("a[href]")
          .toArray()
          .map((node) => absolute($page(node).attr("href") || "", pageUrl))
          .filter((href) =>
            /\/\/[^/]*multicloudlinks\.com\/view\//i.test(href),
          ),
      ),
    ];
    for (const multiCloudPage of multiCloudPages) {
      try {
        const response = await fetch(multiCloudPage, {
          headers: { ...headers, Referer: pageUrl },
          signal,
          redirect: "follow",
        });
        if (!response.ok) continue;
        const sourceHtml = await response.text();
        const $source = cheerio.load(sourceHtml);
        const directNode = $source("a[href]")
          .toArray()
          .find((node) => {
            const href = $source(node).attr("href") || "";
            const label = $source(node).text().replace(/\s+/g, " ").trim();
            return (
              /multidownload\.website\/d\//i.test(href) ||
              /Turbo Download\s*\(R2\)/i.test(label)
            );
          });
        const directLink = absolute(
          directNode ? $source(directNode).attr("href") || "" : "",
          response.url || multiCloudPage,
        );
        if (!/^https?:\/\//i.test(directLink)) continue;

        const fileName = $source(".file-icon-name")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const episode =
          fileName.match(/\bS\d+\s*E0*(\d+)\b/i)?.[1] ||
          fileName.match(/\b(?:Episode|Epi|Ep)\s*0*(\d+)\b/i)?.[1];
        const quality = fileName.match(/\b(\d{3,4}p)\b/i)?.[1];
        const server = [
          "Turbo Download (R2)",
          episode ? `E${Number(episode)}` : "",
          quality || "",
        ]
          .filter(Boolean)
          .join(" · ");
        return [
          {
            server,
            link: directLink,
            type: /\.mp4(?:[?#]|$)/i.test(directLink) ? "mp4" : "mkv",
            headers: { ...headers, Referer: response.url || multiCloudPage },
          },
        ];
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }
    return [];
  };
  const extractAllMultiCloudSources = async (html, pageUrl) => {
    const $page = cheerio.load(String(html || ""));
    const multiCloudPages = [
      ...new Set(
        $page("a[href]")
          .toArray()
          .map((node) => absolute($page(node).attr("href") || "", pageUrl))
          .filter((href) =>
            /\/\/[^/]*multicloudlinks\.com\/view\//i.test(href),
          ),
      ),
    ];
    const results = $page("a[href]")
      .toArray()
      .map((node) => ({
        label: $page(node).text().replace(/\s+/g, " ").trim(),
        link: absolute($page(node).attr("href") || "", pageUrl),
      }))
      .filter(({ link }) => /\/\/[^/]*(?:filepress|filebee)\./i.test(link))
      .map(({ label, link }) => ({
        server:
          !label || /^https?:\/\//i.test(label) ? "FilePress Mirror" : label,
        link,
        type: "embed",
        playbackMode: "provider-web",
        transport: "embed",
        embedUrl: link,
        headers: { ...headers, Referer: pageUrl },
      }));

    for (const multiCloudPage of multiCloudPages) {
      try {
        const response = await fetch(multiCloudPage, {
          headers: { ...headers, Referer: pageUrl },
          signal,
          redirect: "follow",
        });
        if (!response.ok) continue;
        const sourceHtml = await response.text();
        const $source = cheerio.load(sourceHtml);
        const fileName = $source(".file-icon-name")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const episode =
          fileName.match(/\bS\d+\s*E0*(\d+)\b/i)?.[1] ||
          fileName.match(/\b(?:Episode|Epi|Ep)\s*0*(\d+)\b/i)?.[1];
        const quality = fileName.match(/\b(\d{3,4}p)\b/i)?.[1];
        const qualifier = [episode ? `E${Number(episode)}` : "", quality || ""]
          .filter(Boolean)
          .join(" · ");
        const withQualifier = (label) =>
          [label, qualifier].filter(Boolean).join(" · ");
        const sourcePageUrl = response.url || multiCloudPage;

        for (const node of $source("a.premium-btn[href]").toArray()) {
          const providerLabel = $source(node)
            .text()
            .replace(/\s+/g, " ")
            .trim();
          let sourceLink = absolute(
            $source(node).attr("href") || "",
            sourcePageUrl,
          );
          if (
            !providerLabel ||
            !/^https?:\/\//i.test(sourceLink) ||
            /torrent/i.test(providerLabel)
          ) {
            continue;
          }

          if (/watch online/i.test(providerLabel)) {
            try {
              const playerResponse = await fetch(sourceLink, {
                headers: { ...headers, Referer: sourcePageUrl },
                signal,
                redirect: "follow",
              });
              if (!playerResponse.ok) continue;
              sourceLink =
                (await playerResponse.text()).match(
                  /streamSrc\s*=\s*['"]([^'"]+)/i,
                )?.[1] || "";
            } catch (error) {
              if (signal?.aborted) throw error;
              sourceLink = "";
            }
          } else if (/pixeldrain/i.test(providerLabel)) {
            try {
              const mirrorResponse = await fetch(sourceLink, {
                headers: { ...headers, Referer: sourcePageUrl },
                signal,
                redirect: "follow",
              });
              const mirrorUrl = mirrorResponse.url || sourceLink;
              await mirrorResponse.body?.cancel?.().catch?.(() => {});
              const id = new URL(mirrorUrl).pathname.match(
                /\/(?:u|api\/file)\/([^/?#]+)/i,
              )?.[1];
              sourceLink = id
                ? `${new URL(mirrorUrl).origin}/api/file/${id}`
                : "";
            } catch (error) {
              if (signal?.aborted) throw error;
              sourceLink = "";
            }
          }
          if (
            /direct download/i.test(providerLabel) &&
            /\/\/bdl[^/]*\.multicloudlinks\.com\//i.test(sourceLink)
          ) {
            const directUrl = new URL(sourceLink);
            directUrl.searchParams.set("download", "true");
            sourceLink = directUrl.href;
          }

          if (!/^https?:\/\//i.test(sourceLink)) continue;
          const providerWeb = /viking|gofile|filepress/i.test(providerLabel);
          results.push({
            server: withQualifier(providerLabel),
            link: sourceLink,
            type: providerWeb
              ? "embed"
              : /\.mp4(?:[?#]|$)/i.test(sourceLink)
                ? "mp4"
                : "mkv",
            ...(providerWeb
              ? {
                  playbackMode: "provider-web",
                  transport: "embed",
                  embedUrl: sourceLink,
                }
              : {}),
            headers: { ...headers, Referer: sourcePageUrl },
          });
        }
      } catch (error) {
        if (signal?.aborted) throw error;
      }
    }

    const seen = new Set();
    return results.filter((source) => {
      const key = `${source.server}|${source.link}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  try {
    let gateway = String(link || "");
    if (!gateway.includes("cloud")) {
      const landing = await axios.get(gateway, { headers, signal });
      const landingUrl =
        landing?.request?.responseURL ||
        landing?.request?._currentUrl ||
        gateway;
      const multiCloudSources = await extractAllMultiCloudSources(
        landing.data,
        landingUrl,
      );
      if (multiCloudSources.length) return multiCloudSources;
      const $landing = cheerio.load(landing.data);
      gateway =
        $landing("a[href]")
          .toArray()
          .map((node) => $landing(node).attr("href") || "")
          .find((href) => /(?:hubcloud|vcloud|cloud\.)/i.test(href)) || gateway;
      gateway = absolute(gateway, link);
    }
    const gatewayResponse = await axios.get(gateway, { headers, signal });
    const gatewayHtml = String(gatewayResponse.data || "");
    const gatewayUrl =
      gatewayResponse?.request?.responseURL ||
      gatewayResponse?.request?._currentUrl ||
      gateway;
    const multiCloudSources = await extractAllMultiCloudSources(
      gatewayHtml,
      gatewayUrl,
    );
    if (multiCloudSources.length) return multiCloudSources;
    const $gateway = cheerio.load(gatewayHtml);
    let cloudPage =
      decodeGateway(gatewayHtml) ||
      $gateway(".fa-file-download.fa-lg").parent().attr("href") ||
      $gateway("a[href*='hubcloud'],a[href*='/drive/']").first().attr("href") ||
      gateway;
    cloudPage = absolute(cloudPage, gateway);
    const cloudResponse = await fetch(cloudPage, {
      headers,
      signal,
      redirect: "follow",
    });
    const cloudHtml = await cloudResponse.text();
    const $ = cheerio.load(cloudHtml);
    const results = [];
    for (const node of $(
      ".btn-success.btn-lg.h6,.btn-danger,.btn-secondary,a[href*='pixeldrain'],a[href*='hubcdn']",
    ).toArray()) {
      let mediaLink = absolute($(node).attr("href") || "", cloudPage);
      if (!mediaLink || !/^https?:\/\//i.test(mediaLink)) continue;
      const providerLabel = $(node).text().replace(/\s+/g, " ").trim();
      let server = "";
      if (/pixeld/i.test(mediaLink)) {
        server = providerLabel || "Pixeldrain";
        if (!mediaLink.includes("/api/file/")) {
          const token = mediaLink.split("/").pop()?.split("?")[0];
          if (token)
            mediaLink = `${new URL(mediaLink).origin}/api/file/${token}`;
        }
      } else if (/cloudflarestorage/i.test(mediaLink))
        server = providerLabel || "CfStorage";
      else if (/(?:fastdl|fsl\.)/i.test(mediaLink))
        server = providerLabel || "FastDl";
      else if (/hubcdn/i.test(mediaLink)) server = providerLabel || "HubCdn";
      else if (/(?:hubcloud|\/\?id=)/i.test(mediaLink))
        server = providerLabel || "hubcloud";
      else if (/\.(?:mkv|mp4)(?:[?#]|$)|[?&]token=/i.test(mediaLink))
        server = providerLabel;
      if (!server) continue;
      results.push({
        server,
        link: mediaLink,
        type: /\.mp4(?:[?#]|$)/i.test(mediaLink) ? "mp4" : "mkv",
        headers,
      });
    }
    return results;
  } catch (error) {
    if (error?.name !== "AbortError" && error?.code !== "ERR_CANCELED")
      console.error("Joya9tv stream error", error);
    return [];
  }
};
const __kandoTransportFor = (stream) => {
  const explicit = String(stream?.transport || "").toLowerCase();
  if (["hls", "dash", "progressive", "torrent", "embed"].includes(explicit))
    return explicit;
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
    if (parsed.protocol === "magnet:")
      return /^urn:btih:/i.test(parsed.searchParams.get("xt") || "");
    return (
      ["http:", "https:"].includes(parsed.protocol) &&
      Boolean(parsed.hostname) &&
      !["undefined", "null"].includes(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
};
const __kandoNormalizeStreamV2 = (streams, commonHeaders = {}) => {
  const occurrences = new Map();
  return (Array.isArray(streams) ? streams : []).flatMap((candidate) => {
    const stream = candidate && typeof candidate === "object" ? candidate : {};
    const sourceLabel =
      typeof stream.sourceLabel === "string"
        ? stream.sourceLabel
        : typeof stream.serverLabel === "string"
          ? stream.serverLabel
          : typeof stream.server === "string"
            ? stream.server
            : "";
    const link =
      typeof stream.link === "string"
        ? stream.link
        : typeof stream.embedUrl === "string"
          ? stream.embedUrl
          : "";
    const checkedLabel = sourceLabel.trim().toLowerCase();
    if (
      !checkedLabel ||
      checkedLabel === "unknown" ||
      checkedLabel === "unknown server" ||
      !__kandoIsPlayableLink(link)
    )
      return [];
    const transport = __kandoTransportFor(stream);
    const selectorKind = ["server", "audio", "source"].includes(
      stream.selectorKind,
    )
      ? stream.selectorKind
      : "server";
    const stableIdentity =
      typeof stream.__kandoStableIdentity === "string" &&
      stream.__kandoStableIdentity
        ? stream.__kandoStableIdentity
        : `${selectorKind}|${sourceLabel}|${transport}`;
    const occurrence = (occurrences.get(stableIdentity) || 0) + 1;
    occurrences.set(stableIdentity, occurrence);
    const playbackMode = ["native", "provider-web"].includes(
      stream.playbackMode,
    )
      ? stream.playbackMode
      : transport === "embed"
        ? "provider-web"
        : "native";
    const { __kandoStableIdentity: _stableIdentity, ...publicStream } = stream;
    return [
      {
        ...publicStream,
        server: sourceLabel,
        link,
        sourceId: `${__kandoProviderId}:${__kandoIdPart(stableIdentity)}:${occurrence}`,
        selectorKind,
        sourceLabel,
        serverLabel:
          selectorKind === "server"
            ? sourceLabel
            : (stream.serverLabel ?? null),
        labelProvenance: __kandoLabelProvenance,
        playbackMode,
        transport,
        health: ["unchecked", "checking", "ready", "unavailable"].includes(
          stream.health,
        )
          ? stream.health
          : "unchecked",
        headers: { ...commonHeaders, ...(stream.headers || {}) },
        ...(playbackMode === "provider-web"
          ? { embedUrl: stream.embedUrl || link }
          : {}),
      },
    ];
  });
};
exports.normalizeStreamV2 = __kandoNormalizeStreamV2;
exports.getStream = async (args) => {
  const playbackHeaders = { ...(args?.providerContext?.commonHeaders || {}) };
  const requestHeaders = { ...playbackHeaders };
  const providerContext = {
    ...(args?.providerContext || {}),
    commonHeaders: requestHeaders,
  };
  return __kandoNormalizeStreamV2(
    await __kandoLegacyGetStream({ ...args, providerContext }),
    playbackHeaders,
  );
};
