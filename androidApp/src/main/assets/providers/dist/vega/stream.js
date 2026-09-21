"use strict";
var __defProp = Object.defineProperty,
  __getOwnPropDesc = Object.getOwnPropertyDescriptor,
  __getOwnPropNames = Object.getOwnPropertyNames,
  __hasOwnProp = Object.prototype.hasOwnProperty,
  __name = (target, value) =>
    __defProp(target, "name", { value: value, configurable: !0 }),
  __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: !0 });
  },
  __copyProps = (to, from, except, desc) => {
    if ((from && "object" == typeof from) || "function" == typeof from)
      for (let key of __getOwnPropNames(from))
        __hasOwnProp.call(to, key) ||
          key === except ||
          __defProp(to, key, {
            get: () => from[key],
            enumerable:
              !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
          });
    return to;
  },
  __toCommonJS = (mod) =>
    __copyProps(__defProp({}, "__esModule", { value: !0 }), mod),
  __async = (__this, __arguments, generator) =>
    new Promise((resolve, reject) => {
      var fulfilled = (value) => {
          try {
            step(generator.next(value));
          } catch (e) {
            reject(e);
          }
        },
        rejected = (value) => {
          try {
            step(generator.throw(value));
          } catch (e) {
            reject(e);
          }
        },
        step = (x) =>
          x.done
            ? resolve(x.value)
            : Promise.resolve(x.value).then(fulfilled, rejected);
      step((generator = generator.apply(__this, __arguments)).next());
    }),
  stream_exports = {};
__export(stream_exports, { getStream: () => getStream });
var hubcloudDecode = __name(function (value) {
    return void 0 === value ? "" : atob(value.toString());
  }, "hubcloudDecode"),
  extractUrlFromScript = __name((html) => {
    var _a, _b, _c;
    const doubleAtobMatch = html.match(
      /var\s+url\s*=\s*atob\(atob\(['"]([^'"]+)['"]\)\)/,
    );
    if (null == doubleAtobMatch ? void 0 : doubleAtobMatch[1])
      return atob(atob(doubleAtobMatch[1]));
    const plainMatch = html.match(/var\s+url\s*=\s*['"]([^'"]+)['"]/);
    return (
      hubcloudDecode(
        null !=
          (_c =
            null ==
            (_b =
              null == (_a = null == plainMatch ? void 0 : plainMatch[1])
                ? void 0
                : _a.split("r="))
              ? void 0
              : _b[1])
          ? _c
          : "",
      ) ||
      (null == plainMatch ? void 0 : plainMatch[1]) ||
      ""
    );
  }, "extractUrlFromScript"),
  getPixelDrainUrl = __name((html) => {
    const match = html.match(/var\s+pxl\s*=\s*['"]([^'"]+)['"];?/i);
    return (null == match ? void 0 : match[1]) || "";
  }, "getPixelDrainUrl"),
  getRedirectedPixelDrainUrl = __name((...htmlSources) => {
    for (const html of htmlSources) {
      if (!html) continue;
      const redirectedUrl = getPixelDrainUrl(html);
      if (redirectedUrl) return redirectedUrl;
    }
    return "";
  }, "getRedirectedPixelDrainUrl");
const __kandoGofileApi = "https://api.gofile.io";
const __kandoGofileLanguage = "en-US";
const __kandoGofileWebsiteSecret = "9844d94d963d30";
const __kandoGofileUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";
const __kandoResolveFilePress = async (link, axios, signal) => {
  const requestedLink = String(link || "").trim();
  if (
    !/^https?:\/\/(?:[^/]+\.)?(?:filebee\.xyz|filepress\.(?:baby|cloud))\/file\//i.test(
      requestedLink,
    )
  ) {
    return [];
  }
  let pageUrl = requestedLink;
  try {
    const response = await fetch(requestedLink, {
      headers: {
        Referer: requestedLink,
        "User-Agent": __kandoGofileUserAgent,
      },
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
  try {
    page = new URL(pageUrl);
  } catch {
    return [];
  }
  if (!/filepress\.(?:baby|cloud)$/i.test(page.hostname)) return [];
  const fileId = page.pathname.split("/").filter(Boolean).pop();
  if (!fileId) return [];
  const baseUrl = page.origin;
  const requestBody = {
    id: fileId,
    method: "indexDownlaod",
    captchaValue: null,
  };
  const apiHeaders = {
    "Content-Type": "application/json",
    Origin: baseUrl,
    Referer: `${baseUrl}/`,
  };
  try {
    const tokenResponse = await axios.post(
      `${baseUrl}/api/file/downlaod/`,
      requestBody,
      { headers: apiHeaders, signal },
    );
    const token = tokenResponse?.data?.status ? tokenResponse.data.data : "";
    if (!token) return [];
    const streamResponse = await axios.post(
      `${baseUrl}/api/file/downlaod2/`,
      { ...requestBody, id: token },
      { headers: apiHeaders, signal },
    );
    return (
      Array.isArray(streamResponse?.data?.data) ? streamResponse.data.data : []
    )
      .filter((streamLink) =>
        /^https?:\/\//i.test(String(streamLink || "")),
      )
      .map((streamLink, index) => ({
        server: index ? `FilePress ${index + 1}` : "FilePress",
        link: streamLink,
        type: "mkv",
        headers: { Referer: `${baseUrl}/` },
      }));
  } catch {
    return [];
  }
};
const __kandoFindFirstGofile = (content) => {
  if (content?.type === "file" && content?.link) return content;
  for (const child of Object.values(content?.children || {})) {
    const file = __kandoFindFirstGofile(child);
    if (file) return file;
  }
  return null;
};
const __kandoResolveGofile = async (link, axios, Crypto, signal) => {
  try {
    const id = new URL(link).pathname.split("/").filter(Boolean).pop();
    if (!id || !Crypto?.digestStringAsync) return null;
    const accountResponse = await axios.post(
      `${__kandoGofileApi}/accounts`,
      undefined,
      {
        headers: { "User-Agent": __kandoGofileUserAgent },
        signal,
      },
    );
    const accountToken = accountResponse?.data?.data?.token;
    if (!accountToken) return null;
    const timeBucket = Math.floor(Date.now() / 1_000 / 14_400);
    const websiteToken = await Crypto.digestStringAsync(
      "SHA-256",
      [
        __kandoGofileUserAgent,
        __kandoGofileLanguage,
        accountToken,
        timeBucket,
        __kandoGofileWebsiteSecret,
      ].join("::"),
    );
    const contentResponse = await axios.get(
      `${__kandoGofileApi}/contents/${id}`,
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
          "Accept-Language": `${__kandoGofileLanguage},en;q=0.9`,
          Authorization: `Bearer ${accountToken}`,
          Origin: "https://gofile.io",
          Referer: "https://gofile.io/",
          "User-Agent": __kandoGofileUserAgent,
          "X-BL": __kandoGofileLanguage,
          "X-Website-Token": websiteToken,
        },
        signal,
      },
    );
    if (contentResponse?.data?.status !== "ok") return null;
    const file = __kandoFindFirstGofile(contentResponse.data.data);
    if (!file?.link) return null;
    return {
      server: "Gofile",
      link: file.link,
      type: "mkv",
      headers: {
        Referer: "https://gofile.io/",
        Cookie: `accountToken=${accountToken}`,
      },
    };
  } catch {
    return null;
  }
};
function hubcloudExtractor(link, signal, axios, cheerio, headers2, Crypto) {
  return __async(this, null, function* () {
    var _a, _b, _c, _d, _e;
    try {
      ((headers2.Cookie =
        "ext_name=ojplmecpdpgccookcobabopnaifgidhf; xla=s4t; cf_clearance=woQrFGXtLfmEMBEiGUsVHrUBMT8s3cmguIzmMjmvpkg-1770053679-1.2.1.1-xBrQdciOJsweUF6F2T_OtH6jmyanN_TduQ0yslc_XqjU6RcHSxI7.YOKv6ry7oYo64868HYoULnVyww536H2eVI3R2e4wKzsky6abjPdfQPxqpUaXjxfJ02o6jl3_Vkwr4uiaU7Wy596Vdst3y78HXvVmKdIohhtPvp.vZ9_L7wvWdce0GRixjh_6JiqWmWMws46hwEt3hboaS1e1e4EoWCvj5b0M_jVwvSxBOAW5emFzvT3QrnRh4nyYmKDERnY"),
        console.log("hubcloudExtractor", link));
      const baseUrl = link.split("/").slice(0, 3).join("/"),
        streamLinks = [],
        vLinkText = (yield axios(`${link}`, {
          headers: headers2,
          signal: signal,
        })).data,
        $vLink = cheerio.load(vLinkText);
      let vcloudLink =
        extractUrlFromScript(vLinkText) ||
        $vLink(".fa-file-download.fa-lg").parent().attr("href") ||
        link;
      (console.log("vcloudLink", vcloudLink),
        (null == vcloudLink ? void 0 : vcloudLink.startsWith("/")) &&
          ((vcloudLink = `${baseUrl}${vcloudLink}`),
          console.log("New vcloudLink", vcloudLink)));
      const vcloudRes = yield fetch(vcloudLink, {
          headers: headers2,
          signal: signal,
          redirect: "follow",
        }),
        vcloudText = yield vcloudRes.text(),
        $ = cheerio.load(vcloudText),
        linkClass = $(".btn-success.btn-lg.h6,.btn-danger,.btn-secondary");
      for (const element of linkClass) {
        let link2 = $(element).attr("href") || "";
        const providerLabel = $(element).text().replace(/\s+/g, " ").trim();
        switch (!0) {
          case /(?:filebee\.xyz|filepress\.(?:baby|cloud))\/file\//i.test(
            link2,
          ):
            streamLinks.push(
              ...(yield __kandoResolveFilePress(link2, axios, signal)),
            );
            break;
          case null == link2 ? void 0 : link2.includes("gofile.io/"):
            {
              const gofileSource = yield __kandoResolveGofile(
                link2,
                axios,
                Crypto,
                signal,
              );
              if (gofileSource)
                streamLinks.push({
                  ...gofileSource,
                  server: providerLabel || gofileSource.server,
                });
            }
            break;
          case null == link2 ? void 0 : link2.includes("pixeld"):
            if (
              (console.log("Pixeldrain link found:", link2),
              !(null == link2 ? void 0 : link2.includes("api")))
            ) {
              const redirectedPixelDrainUrl = getRedirectedPixelDrainUrl(
                vLinkText,
                vcloudText,
              );
              redirectedPixelDrainUrl &&
                (console.log(
                  "Special case for token negn6f",
                  redirectedPixelDrainUrl,
                ),
                (link2 = redirectedPixelDrainUrl));
              const token =
                  null == (_a = link2.split("/").pop())
                    ? void 0
                    : _a.split("?")[0],
                baseUrl2 = link2.split("/").slice(0, -2).join("/");
              link2 = `${baseUrl2}/api/file/${token}`;
            }
            streamLinks.push({
              server: providerLabel || "Pixeldrain",
              link: link2,
              type: "mkv",
            });
            break;
          case (null == link2 ? void 0 : link2.includes(".dev")) &&
            !(null == link2 ? void 0 : link2.includes("/?id=")):
            streamLinks.push({
              server: providerLabel || "Cf Worker",
              link: link2,
              type: "mkv",
            });
            break;
          case (null == link2 ? void 0 : link2.includes("hubcloud")) ||
            (null == link2 ? void 0 : link2.includes("/?id=")):
            try {
              const newLinkRes = yield fetch(link2, {
                method: "HEAD",
                headers: headers2,
                signal: signal,
                redirect: "manual",
              });
              let newLink = link2;
              if (
                ((newLink =
                  newLinkRes.status >= 300 && newLinkRes.status < 400
                    ? newLinkRes.headers.get("location") || link2
                    : newLinkRes.url && newLinkRes.url !== link2
                      ? newLinkRes.url
                      : newLinkRes.headers.get("location") || link2),
                newLink.includes("googleusercontent"))
              )
                newLink = newLink.split("?link=")[1];
              else {
                const newLinkRes2 = yield fetch(newLink, {
                  method: "HEAD",
                  headers: headers2,
                  signal: signal,
                  redirect: "manual",
                });
                newLink =
                  newLinkRes2.status >= 300 && newLinkRes2.status < 400
                    ? (null == (_b = newLinkRes2.headers.get("location"))
                        ? void 0
                        : _b.split("?link=")[1]) || newLink
                    : newLinkRes2.url && newLinkRes2.url !== newLink
                      ? newLinkRes2.url.split("?link=")[1] || newLinkRes2.url
                      : (null == (_c = newLinkRes2.headers.get("location"))
                          ? void 0
                          : _c.split("?link=")[1]) || newLink;
              }
              streamLinks.push({
                server:
                  providerLabel || "hubcloud",
                link: newLink,
                type: "mkv",
              });
            } catch (error) {
              console.log("hubcloudExtractor error in hubcloud link: ", error);
            }
            break;
          case null == link2 ? void 0 : link2.includes("cloudflarestorage"):
            streamLinks.push({
              server: providerLabel || "CfStorage",
              link: link2,
              type: "mkv",
            });
            break;
          case (null == link2 ? void 0 : link2.includes("fastdl")) ||
            (null == link2 ? void 0 : link2.includes("fsl.")):
            streamLinks.push({
              server: providerLabel || "FastDl",
              link: link2,
              type: "mkv",
            });
            break;
          case link2.includes("hubcdn") && !link2.includes("/?id="):
            streamLinks.push({
              server: providerLabel || "HubCdn",
              link: link2,
              type: "mkv",
            });
            break;
          default:
            if (
              (null == link2 ? void 0 : link2.includes(".mkv")) ||
              (null == link2 ? void 0 : link2.includes("?token="))
            ) {
              const serverName =
                (null ==
                (_e =
                  null ==
                  (_d = link2.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i))
                    ? void 0
                    : _d[1])
                  ? void 0
                  : _e.replace(/\./g, " ")) || "Unknown";
              streamLinks.push({
                server: serverName,
                link: link2,
                type: "mkv",
              });
            }
        }
      }
      return (console.log("streamLinks", streamLinks), streamLinks);
    } catch (error) {
      return (
        console.log(
          "hubcloudExtractor error: ",
          (null == error ? void 0 : error.message) || error,
        ),
        []
      );
    }
  });
}
__name(hubcloudExtractor, "hubcloudExtractor");
var headers = {
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Cache-Control": "no-store",
  "Accept-Language": "en-US,en;q=0.9",
  DNT: "1",
  "sec-ch-ua":
    '"Not_A Brand";v="8", "Chromium";v="120", "Microsoft Edge";v="120"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  Cookie:
    "ext_name=ojplmecpdpgccookcobabopnaifgidhf; cf_clearance=6yZYfXQxBgjaD1eacR5zZCz7njssbxjtSZZCElTOGk0-1764836255-1.2.1.1-bzHvDcDRLp6AAYo7qvGVzJ6Gk6zaqAepuGiGhAWCGYL.ZDpw5yI4TkUIXDgAnEhGCZ9J5X2_OagzgeMHZrd8rzeyAFQXj0dmYMErcfII7_Rhq5kZ4kAtS0tl9PtaNKKd2m4taIufySXCCstl3iNLMODTjbsW_KZi8U8DauOdGSAhBd1DCGxvLlAOM.snfkhb0yQiVJcLW8Bv9IeKQac0ar_TKkV6QexqNZYiyRXnE7E; xla=s4t",
  "Upgrade-Insecure-Requests": "1",
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36 Edg/142.0.0.0",
};
function getStream(_0) {
  return __async(
    this,
    arguments,
    function* ({
      link: link,
      type: type,
      signal: signal,
      providerContext: providerContext,
    }) {
      var _a, _b, _c, _d;
      const {
        axios: axios,
        cheerio: cheerio,
        commonHeaders: commonHeaders,
        Crypto: Crypto,
      } = providerContext;
      try {
        const streamLinks = [];
        if (
          (console.log("dotlink", link),
          "movie" === type && !link.includes("cloud"))
        ) {
          const dotlinkText = (yield axios(`${link}`, { headers: headers }))
              .data,
            vlink = dotlinkText.match(/<a\s+href="([^"]*cloud\.[^"]*)"/i) || [];
          (console.log("vLink", vlink[1]), (link = vlink[1]));
          try {
            const filepressLink = cheerio
                .load(dotlinkText)(
                  '.btn.btn-sm.btn-outline[style="background:linear-gradient(135deg,rgb(252,185,0) 0%,rgb(0,0,0)); color: #fdf8f2;"]',
                )
                .parent()
                .attr("href"),
              filepressID =
                null == filepressLink ? void 0 : filepressLink.split("/").pop(),
              filepressBaseUrl =
                null == filepressLink
                  ? void 0
                  : filepressLink.split("/").slice(0, -2).join("/"),
              filepressTokenRes = yield axios.post(
                filepressBaseUrl + "/api/file/downlaod/",
                {
                  id: filepressID,
                  method: "indexDownlaod",
                  captchaValue: null,
                },
                {
                  headers: {
                    "Content-Type": "application/json",
                    Referer: filepressBaseUrl,
                  },
                },
              );
            if (null == (_a = filepressTokenRes.data) ? void 0 : _a.status) {
              const filepressToken =
                  null == (_b = filepressTokenRes.data) ? void 0 : _b.data,
                filepressStreamLink = yield axios.post(
                  filepressBaseUrl + "/api/file/downlaod2/",
                  {
                    id: filepressToken,
                    method: "indexDownlaod",
                    captchaValue: null,
                  },
                  {
                    headers: {
                      "Content-Type": "application/json",
                      Referer: filepressBaseUrl,
                    },
                  },
                );
              streamLinks.push({
                server: "filepress",
                link:
                  null ==
                  (_d =
                    null == (_c = filepressStreamLink.data) ? void 0 : _c.data)
                    ? void 0
                    : _d[0],
                type: "mkv",
              });
            }
          } catch (error) {
            console.log("filepress error: ");
          }
        }
        return streamLinks.concat(
          yield hubcloudExtractor(
            link,
            signal,
            axios,
            cheerio,
            commonHeaders,
            Crypto,
          ),
        );
      } catch (error) {
        return (
          console.log("getStream error: ", error),
          error.message.includes("Aborted"),
          []
        );
      }
    },
  );
}
(__name(getStream, "getStream"), (exports.getStream = getStream));

const __kandoProviderId = "vega";
const __kandoLegacyGetStream = exports.getStream;
const __kandoTransportFor = (stream) => {
  const type = String(stream?.type || "").toLowerCase();
  const link = String(stream?.link || "").toLowerCase();
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
const __kandoNormalizeStreamV2 = (streams, commonHeaders = {}) => {
  const occurrences = new Map();
  return (Array.isArray(streams) ? streams : []).flatMap((stream) => {
    const sourceLabel = typeof stream?.server === "string" ? stream.server : "";
    const link = String(stream?.link || "");
    if (!sourceLabel || !link) return [];
    const transport = __kandoTransportFor(stream);
    const identity = `${sourceLabel}|${transport}`;
    const occurrence = (occurrences.get(identity) || 0) + 1;
    occurrences.set(identity, occurrence);
    return [
      {
        ...stream,
        sourceId: `${__kandoProviderId}:${__kandoIdPart(identity)}:${occurrence}`,
        selectorKind: "server",
        sourceLabel,
        serverLabel: sourceLabel,
        labelProvenance: "reviewed-host",
        playbackMode: transport === "embed" ? "provider-web" : "native",
        transport,
        health: "unchecked",
        headers: { ...commonHeaders, ...(stream.headers || {}) },
        ...(typeof stream.seekable === "boolean"
          ? { seekable: stream.seekable }
          : {}),
      },
    ];
  });
};
exports.normalizeStreamV2 = __kandoNormalizeStreamV2;
exports.getStream = async (args) =>
  __kandoNormalizeStreamV2(
    await __kandoLegacyGetStream(args),
    args?.providerContext?.commonHeaders || {},
  );
