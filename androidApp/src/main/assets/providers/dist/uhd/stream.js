"use strict";
var __defProp = Object.defineProperty,
  __defProps = Object.defineProperties,
  __getOwnPropDesc = Object.getOwnPropertyDescriptor,
  __getOwnPropDescs = Object.getOwnPropertyDescriptors,
  __getOwnPropNames = Object.getOwnPropertyNames,
  __getOwnPropSymbols = Object.getOwnPropertySymbols,
  __hasOwnProp = Object.prototype.hasOwnProperty,
  __propIsEnum = Object.prototype.propertyIsEnumerable,
  __defNormalProp = (obj, key, value) =>
    key in obj
      ? __defProp(obj, key, {
          enumerable: !0,
          configurable: !0,
          writable: !0,
          value: value,
        })
      : (obj[key] = value),
  __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      __hasOwnProp.call(b, prop) && __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b))
        __propIsEnum.call(b, prop) && __defNormalProp(a, prop, b[prop]);
    return a;
  },
  __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b)),
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
var getStream = __name(
    (_0) =>
      __async(
        null,
        [_0],
        function* ({ link: url, providerContext: providerContext }) {
          var _a, _b;
          try {
            const {
              axios: axios,
              cheerio: cheerio,
              commonHeaders: headers,
            } = providerContext;
            let downloadLink = yield modExtractor(url, providerContext);
            const ddl =
              (null ==
              (_b =
                null == (_a = null == downloadLink ? void 0 : downloadLink.data)
                  ? void 0
                  : _a.match(/content="0;url=(.*?)"/))
                ? void 0
                : _b[1]) ||
              (null == downloadLink
                ? void 0
                : downloadLink.__kandoResolvedUrl) ||
              url;
            console.log("ddl", ddl);
            const driveLink = yield isDriveLink(ddl),
              ServerLinks = [],
              driveHtml = (yield axios.get(driveLink, { headers: headers }))
                .data,
              $drive = cheerio.load(driveHtml);
            try {
              const seed = $drive(".btn-danger").attr("href") || "",
                instantToken = seed.split("=")[1],
                InstantFromData = new FormData();
              InstantFromData.append("keys", instantToken);
              const videoSeedUrl =
                  seed.split("/").slice(0, 3).join("/") + "/api",
                instantLinkRes = yield fetch(videoSeedUrl, {
                  method: "POST",
                  body: InstantFromData,
                  headers: { "x-token": videoSeedUrl },
                }),
                instantLinkData = yield instantLinkRes.json();
              if (!1 === instantLinkData.error) {
                const instantLink = instantLinkData.url;
                ServerLinks.push({
                  server: "Gdrive-Instant",
                  link: instantLink,
                  type: "mkv",
                });
              } else console.log("Instant link not found", instantLinkData);
            } catch (err) {
              console.log("Instant link not found", err);
            }
            try {
              const seed = $drive(".btn-danger").attr("href") || "",
                newLinkRes = yield fetch(seed, {
                  method: "HEAD",
                  headers: headers,
                  redirect: "manual",
                });
              let newLink = seed;
              newLink =
                newLinkRes.status >= 300 && newLinkRes.status < 400
                  ? newLinkRes.headers.get("location") || seed
                  : newLinkRes.url && newLinkRes.url !== seed
                    ? newLinkRes.url || newLinkRes.url
                    : newLinkRes.headers.get("location") || seed;
              const directLink = resolveDirectMediaLink(newLink, seed);
              (console.log("Gdrive-Instant-2 link", directLink),
                directLink &&
                  ServerLinks.push({
                    server: "Gdrive-Instant-2",
                    link: directLink,
                    type: "mkv",
                  }));
            } catch (err) {
              console.log("Instant link not found", err);
            }
            try {
              const resumeDrive = driveLink.replace("/file", "/zfile"),
                resumeDriveHtml = (yield axios.get(resumeDrive, {
                  headers: headers,
                })).data,
                resumePage = cheerio.load(resumeDriveHtml);
              let resumeLink = resumePage(".btn-success").attr("href");
              if (!resumeLink) {
                const key = String(resumeDriveHtml || "").match(
                    /formData\.append\(["']key["']\s*,\s*["']([^"']+)/,
                  )?.[1],
                  actionToken =
                    String(resumeDriveHtml || "").match(
                      /var\s+cf_token\s*=\s*["']([^"']*)/,
                    )?.[1] || "";
                if (key) {
                  const resumeForm = new FormData();
                  resumeForm.append("action", "cloud");
                  resumeForm.append("key", key);
                  resumeForm.append("action_token", actionToken);
                  const generatedResponse = yield fetch(resumeDrive, {
                      method: "POST",
                      headers: {
                        ...headers,
                        Referer: resumeDrive,
                        "x-token": new URL(resumeDrive).hostname,
                      },
                      body: resumeForm,
                    }),
                    generatedText = yield generatedResponse.text();
                  try {
                    const generated = JSON.parse(generatedText);
                    if (!generated.error)
                      resumeLink = generated.url || generated.visit_url || "";
                  } catch (_error) {
                    // A generated response is useful only when it is valid JSON.
                  }
                }
              }
              resumeLink &&
                ServerLinks.push({
                  server: "Resume Cloud",
                  link: resumeLink,
                  type: "mkv",
                });
            } catch (err) {
              console.log("Resume link not found");
            }
            try {
              $drive(".btn-success").each((i, el) => {
                var _a2;
                const link = null == (_a2 = el.attribs) ? void 0 : _a2.href;
                link &&
                  !ServerLinks.some((source) => source.link === link) &&
                  ServerLinks.push({
                    server: "Resume Worker " + (i + 1),
                    link: link,
                    type: "mkv",
                  });
              });
            } catch (err) {
              console.log("Base page worker link not found", err);
            }
            try {
              const cfWorkersLink =
                  driveLink.replace("/file", "/wfile") + "?type=1",
                cfWorkersHtml = (yield axios.get(cfWorkersLink, {
                  headers: headers,
                })).data;
              cheerio
                .load(cfWorkersHtml)(".btn-success")
                .each((i, el) => {
                  var _a2;
                  const link = null == (_a2 = el.attribs) ? void 0 : _a2.href;
                  link &&
                    ServerLinks.push({
                      server: "Cf Worker 1." + i,
                      link: link,
                      type: "mkv",
                    });
                });
            } catch (err) {
              console.log("CF workers link not found", err);
            }
            try {
              const cfWorkersLink =
                  driveLink.replace("/file", "/wfile") + "?type=2",
                cfWorkersHtml = (yield axios.get(cfWorkersLink, {
                  headers: headers,
                })).data;
              cheerio
                .load(cfWorkersHtml)(".btn-success")
                .each((i, el) => {
                  var _a2;
                  const link = null == (_a2 = el.attribs) ? void 0 : _a2.href;
                  link &&
                    ServerLinks.push({
                      server: "Cf Worker 2." + i,
                      link: link,
                      type: "mkv",
                    });
                });
            } catch (err) {
              console.log("CF workers link not found", err);
            }
            const uniqueServerLinks = ServerLinks.filter(
              (source, index, all) =>
                source.link &&
                all.findIndex((candidate) => candidate.link === source.link) ===
                  index,
            );
            return (
              console.log("ServerLinks", uniqueServerLinks),
              uniqueServerLinks
            );
          } catch (err) {
            return (console.log("getStream error", err), []);
          }
        },
      ),
    "getStream",
  ),
  isDriveLink = __name(
    (ddl) =>
      __async(null, null, function* () {
        if (ddl.includes("drive")) {
          const driveLeach = yield fetch(ddl),
            pathMatch = (yield driveLeach.text()).match(
              /window\.location\.replace\("([^"]+)"\)/,
            ),
            path = null == pathMatch ? void 0 : pathMatch[1];
          if (!path) return ddl;
          const mainUrl = ddl.split("/")[2];
          return (
            console.log(`driveUrl = https://${mainUrl}${path}`),
            `https://${mainUrl}${path}`
          );
        }
        return ddl;
      }),
    "isDriveLink",
  );
function resolveDirectMediaLink(candidate, baseUrl) {
  if ("string" != typeof candidate || !candidate.trim()) return null;
  try {
    const resolved = new URL(candidate.trim(), baseUrl),
      wrapped = resolved.searchParams.get("url");
    if (wrapped) {
      try {
        const direct = new URL(wrapped);
        return /^https?:$/.test(direct.protocol) ? direct.href : null;
      } catch (_error) {
        // Current DriveSeed may advertise an expiring encrypted token in
        // `?url=`. It is a generator-page token, not a playable media URL.
        return null;
      }
    }
    return /^https?:$/.test(resolved.protocol) ? resolved.href : null;
  } catch (_error) {
    return null;
  }
}
function getWithWAF(url, axios, openWebView, headers) {
  return __async(this, null, function* () {
    var _a;
    const baseUrl = url.split("/").slice(0, 3).join("/");
    try {
      return yield axios.get(url, {
        headers: __spreadProps(__spreadValues({}, headers), {
          Referer: baseUrl,
        }),
      });
    } catch (error) {
      if (
        403 === (null == (_a = error.response) ? void 0 : _a.status) &&
        openWebView
      ) {
        console.log(`WAF detected (403) for ${url}, using solver...`);
        const wafResult = yield openWebView(baseUrl, {
          title: "Solve the captcha below and click done",
          description: "Required to bypass anti-bot protection.",
          headers: __spreadProps(__spreadValues({}, headers), {
            Referer: baseUrl,
          }),
          waitForCookie: "cf_clearance",
          force: !0,
        });
        return yield axios.get(url, {
          headers: __spreadProps(__spreadValues({}, headers), {
            Referer: baseUrl,
            Cookie: wafResult.cookie,
          }),
        });
      }
      throw error;
    }
  });
}
function modExtractor(url, providerContext) {
  return __async(this, null, function* () {
    const {
      axios: axios,
      cheerio: cheerio,
      openWebView: openWebView,
    } = providerContext;
    try {
      const wpHttp = url.split("sid=")[1];
      var bodyFormData0 = new FormData();
      bodyFormData0.append("_wp_http", wpHttp);
      const res = yield fetch(url.split("?")[0], {
          method: "POST",
          body: bodyFormData0,
        }),
        html = yield res.text(),
        $ = cheerio.load(html),
        wpHttp2 = $("input").attr("name", "_wp_http2").val();
      var bodyFormData = new FormData();
      bodyFormData.append("_wp_http2", wpHttp2);
      const formUrl = $("form").attr("action") || url.split("?")[0],
        res2 = yield fetch(formUrl, { method: "POST", body: bodyFormData }),
        linkMatch = (yield res2.text()).match(
          /setAttribute\("href",\s*"(.*?)"/,
        );
      if (!linkMatch) return null;
      const link = linkMatch[1];
      console.log(link);
      const cookie = link.split("=")[1];
      console.log("cookie", cookie);
      const resolvedPage = yield getWithWAF(link, axios, openWebView, {
        Referer: formUrl,
        Cookie: `${cookie}=${wpHttp2}`,
      });
      return {
        ...resolvedPage,
        __kandoResolvedUrl: link,
      };
    } catch (err) {
      console.log("modGetStream error", err);
    }
  });
}
(__name(getWithWAF, "getWithWAF"),
  __name(modExtractor, "modExtractor"),
  (exports.getStream = getStream));
("use strict");
const __kandoProviderId = "uhd";
const __kandoLabelProvenance = "reviewed-host";
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
        labelProvenance: __kandoLabelProvenance,
        playbackMode: transport === "embed" ? "provider-web" : "native",
        transport,
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
