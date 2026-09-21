"use strict";var __defProp=Object.defineProperty,__defProps=Object.defineProperties,__getOwnPropDesc=Object.getOwnPropertyDescriptor,__getOwnPropDescs=Object.getOwnPropertyDescriptors,__getOwnPropNames=Object.getOwnPropertyNames,__getOwnPropSymbols=Object.getOwnPropertySymbols,__hasOwnProp=Object.prototype.hasOwnProperty,__propIsEnum=Object.prototype.propertyIsEnumerable,__defNormalProp=(obj,key,value)=>key in obj?__defProp(obj,key,{enumerable:!0,configurable:!0,writable:!0,value:value}):obj[key]=value,__spreadValues=(a,b)=>{for(var prop in b||(b={}))__hasOwnProp.call(b,prop)&&__defNormalProp(a,prop,b[prop]);if(__getOwnPropSymbols)for(var prop of __getOwnPropSymbols(b))__propIsEnum.call(b,prop)&&__defNormalProp(a,prop,b[prop]);return a},__spreadProps=(a,b)=>__defProps(a,__getOwnPropDescs(b)),__name=(target,value)=>__defProp(target,"name",{value:value,configurable:!0}),__export=(target,all)=>{for(var name in all)__defProp(target,name,{get:all[name],enumerable:!0})},__copyProps=(to,from,except,desc)=>{if(from&&"object"==typeof from||"function"==typeof from)for(let key of __getOwnPropNames(from))__hasOwnProp.call(to,key)||key===except||__defProp(to,key,{get:()=>from[key],enumerable:!(desc=__getOwnPropDesc(from,key))||desc.enumerable});return to},__toCommonJS=mod=>__copyProps(__defProp({},"__esModule",{value:!0}),mod),__async=(__this,__arguments,generator)=>new Promise((resolve,reject)=>{var fulfilled=value=>{try{step(generator.next(value))}catch(e){reject(e)}},rejected=value=>{try{step(generator.throw(value))}catch(e){reject(e)}},step=x=>x.done?resolve(x.value):Promise.resolve(x.value).then(fulfilled,rejected);step((generator=generator.apply(__this,__arguments)).next())}),stream_exports={};function gdflixExtractor(link,signal,axios,cheerio,headers,providerContext){return __async(this,null,function*(){var _a,_b,_c,_d,_e,_f,_g,_h,_i;try{let wafCookies;try{yield axios.get(link,{headers:headers,signal:signal})}catch(error){if(403!==(null==(_a=error.response)?void 0:_a.status)||!(null==providerContext?void 0:providerContext.openWebView))throw error;{console.log("gdflix: WAF detected (403), using solver...");const baseUrl=link.split("/").slice(0,3).join("/");wafCookies=(yield providerContext.openWebView(link,{title:"Solve the captcha below and click done",description:"Required to bypass GDFlix anti-bot protection.",headers:__spreadProps(__spreadValues({},headers),{Referer:baseUrl}),force:!0,waitForCookie:"cf_clearance"})).cookies}}wafCookies&&(headers.Cookie=wafCookies);const streamLinks=[],res=yield axios(`${link}`,{headers:headers,signal:signal});console.log("gdflixExtractor",link);const data=res.data;let $drive=cheerio.load(data);if(null==(_b=$drive("body").attr("onload"))?void 0:_b.includes("location.replace")){const newLink=null==(_e=null==(_d=null==(_c=$drive("body").attr("onload"))?void 0:_c.split("location.replace('"))?void 0:_d[1].split("'"))?void 0:_e[0];if(console.log("newLink",newLink),newLink){const newRes=yield axios.get(newLink,{headers:headers,signal:signal});$drive=cheerio.load(newRes.data)}}try{const baseUrl=link.split("/").slice(0,3).join("/"),resumeDrive=$drive(".btn-secondary").attr("href")||"";if(console.log("resumeDrive",resumeDrive),resumeDrive.includes("indexbot")){const resumeBotRes=yield axios.get(resumeDrive,{headers:headers}),resumeBotToken=resumeBotRes.data.match(/formData\.append\('token', '([a-f0-9]+)'\)/)[1],resumeBotBody=new FormData;resumeBotBody.append("token",resumeBotToken);const resumeBotPath=resumeBotRes.data.match(/fetch\('\/download\?id=([a-zA-Z0-9\/+]+)'/)[1],resumeBotBaseUrl=resumeDrive.split("/download")[0],resumeBotDownload=yield fetch(resumeBotBaseUrl+"/download?id="+resumeBotPath,{method:"POST",body:resumeBotBody,headers:{Referer:resumeDrive,Cookie:"PHPSESSID=7e9658ce7c805dab5bbcea9046f7f308"}}),resumeBotDownloadData=yield resumeBotDownload.json();console.log("resumeBotDownloadData",resumeBotDownloadData.url),streamLinks.push({server:"ResumeBot",link:resumeBotDownloadData.url,type:"mkv"})}else{const url=baseUrl+resumeDrive,resumeDriveHtml=(yield axios.get(url,{headers:headers})).data,resumeLink=cheerio.load(resumeDriveHtml)(".btn-success").attr("href");resumeLink&&streamLinks.push({server:"ResumeCloud",link:resumeLink,type:"mkv"})}}catch(err){console.log("Resume link not found")}try{const seed=$drive(".btn-danger").attr("href")||"";if(console.log("seed",seed),seed.includes("?url=")){const instantToken=seed.split("=")[1],InstantFromData=new FormData;InstantFromData.append("keys",instantToken);const videoSeedUrl=seed.split("/").slice(0,3).join("/")+"/api",instantLinkRes=yield fetch(videoSeedUrl,{method:"POST",body:InstantFromData,headers:{"x-token":videoSeedUrl}}),instantLinkData=yield instantLinkRes.json();if(!1===instantLinkData.error){const instantLink=instantLinkData.url;streamLinks.push({server:"Gdrive-Instant",link:instantLink,type:"mkv"})}else console.log("Instant link not found",instantLinkData)}else{const newLinkRes=yield axios.head(seed,{headers:headers,signal:signal});console.log("newLinkRes",null==(_f=newLinkRes.request)?void 0:_f.responseURL);const newLink=(null==(_i=null==(_h=null==(_g=newLinkRes.request)?void 0:_g.responseURL)?void 0:_h.split("?url="))?void 0:_i[1])||seed;streamLinks.push({server:"G-Drive",link:newLink,type:"mkv"})}}catch(err){console.log("Instant link not found",err)}return streamLinks}catch(error){return console.log("gdflix error: ",error),[]}})}__export(stream_exports,{getStream:()=>getStream}),__name(gdflixExtractor,"gdflixExtractor");var getStream=__name(function(_0){return __async(this,arguments,function*({link:link,signal:signal,providerContext:providerContext}){const{axios:axios,cheerio:cheerio,commonHeaders:headers}=providerContext;try{const data=(yield axios.get(link,{signal:signal})).data,$=cheerio.load(data),streams=[],promises=$(".button2,.button1,.button3,.button4,.button").toArray().map(element=>__async(null,null,function*(){const title=$(element).text();let link2=$(element).attr("href");if(title.includes("GDFLIX")&&link2){const gdLinks=yield gdflixExtractor(link2,signal,axios,cheerio,headers,providerContext);streams.push(...gdLinks)}const alreadyAdded=streams.find(s=>s.link===link2);!title||!link2||title.includes("Watch")||title.includes("Login")||title.includes("GoFile")||alreadyAdded||streams.push({server:title,link:link2,type:"mkv"})}));return yield Promise.all(promises),streams}catch(err){return console.error(err),[]}})},"getStream");exports.getStream=getStream;

"use strict";
const __kandoProviderId = "filmyfly";
const __kandoLabelProvenance = "reviewed-host";
const __kandoLegacyGetStream = exports.getStream;
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
const __kandoNormalizeStreamV2 = (streams, commonHeaders = {}) => {
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
    if (!checkedLabel || checkedLabel === "unknown" || checkedLabel === "unknown server" || !link.trim()) return [];
    const transport = __kandoTransportFor(stream);
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
      sourceId: `${__kandoProviderId}:${__kandoIdPart(identity)}:${occurrence}`,
      selectorKind,
      sourceLabel,
      serverLabel: selectorKind === "server" ? sourceLabel : (stream.serverLabel ?? null),
      labelProvenance: __kandoLabelProvenance,
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
exports.normalizeStreamV2 = __kandoNormalizeStreamV2;
exports.getStream = async (args) => {
  const commonHeaders = {...(args?.providerContext?.commonHeaders || {})};
  const providerContext = {...(args?.providerContext || {}), commonHeaders};
  return __kandoNormalizeStreamV2(
    await __kandoLegacyGetStream({...args, providerContext}),
    commonHeaders,
  );
};

// FilmyFly's download page mixes actual media URLs with landing pages and a
// Telegram bot link. Resolve the two supported landing-page families here so
// the native player never receives HTML labelled as an MKV.
const __kandoFilmyFlyBaseGetStream = exports.getStream;
const __kandoFilmyFlyClean = (value) => String(value || "").replace(/\s+/g, " ").trim();
const __kandoFilmyFlyGofileApi = "https://api.gofile.io";
const __kandoFilmyFlyGofileLanguage = "en-US";
const __kandoFilmyFlyGofileWebsiteSecret = "9844d94d963d30";
const __kandoFilmyFlyGofileUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0";
const __kandoFilmyFlyFindGofile = (content) => {
  if (content?.type === "file" && content?.link) return content;
  for (const child of Object.values(content?.children || {})) {
    const file = __kandoFilmyFlyFindGofile(child);
    if (file) return file;
  }
  return null;
};
const __kandoFilmyFlyResolveGofile = async (
  link,
  label,
  {axios, Crypto, signal},
) => {
  try {
    const id = new URL(link).pathname.split("/").filter(Boolean).pop();
    if (!id || !Crypto?.digestStringAsync) return [];
    const accountResponse = await axios.post(
      `${__kandoFilmyFlyGofileApi}/accounts`,
      undefined,
      {
        headers: {"User-Agent": __kandoFilmyFlyGofileUserAgent},
        signal,
      },
    );
    const accountToken = accountResponse?.data?.data?.token;
    if (!accountToken) return [];
    const timeBucket = Math.floor(Date.now() / 1_000 / 14_400);
    const websiteToken = await Crypto.digestStringAsync(
      "SHA-256",
      [
        __kandoFilmyFlyGofileUserAgent,
        __kandoFilmyFlyGofileLanguage,
        accountToken,
        timeBucket,
        __kandoFilmyFlyGofileWebsiteSecret,
      ].join("::"),
    );
    const contentResponse = await axios.get(
      `${__kandoFilmyFlyGofileApi}/contents/${id}`,
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
          "Accept-Language": `${__kandoFilmyFlyGofileLanguage},en;q=0.9`,
          Authorization: `Bearer ${accountToken}`,
          Origin: "https://gofile.io",
          Referer: "https://gofile.io/",
          "User-Agent": __kandoFilmyFlyGofileUserAgent,
          "X-BL": __kandoFilmyFlyGofileLanguage,
          "X-Website-Token": websiteToken,
        },
        signal,
      },
    );
    if (contentResponse?.data?.status !== "ok") return [];
    const file = __kandoFilmyFlyFindGofile(contentResponse.data.data);
    if (!file?.link) return [];
    return [{
      server: label || "GoFile",
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
const __kandoFilmyFlyGofileControls = async (args) => {
  const {axios, cheerio, Crypto} = args?.providerContext || {};
  if (!axios || !cheerio || !Crypto) return [];
  try {
    const response = await axios.get(args.link, {
      headers: args?.providerContext?.commonHeaders || {},
      signal: args?.signal,
    });
    const $ = cheerio.load(String(response?.data || ""));
    const controls = $("a[href]").toArray()
      .map((node) => ({
        label: __kandoFilmyFlyClean($(node).text()),
        link: String($(node).attr("href") || "").trim(),
      }))
      .filter(({label, link}) =>
        /go\s*file/i.test(label) && /gofile\.io\/d\//i.test(link),
      );
    const streams = [];
    for (const control of controls) {
      streams.push(...await __kandoFilmyFlyResolveGofile(
        control.link,
        control.label,
        {axios, Crypto, signal: args?.signal},
      ));
    }
    return streams;
  } catch {
    return [];
  }
};
const __kandoFilmyFlyRawControls = async (args) => {
  const {axios, cheerio, commonHeaders = {}} = args?.providerContext || {};
  if (!axios || !cheerio) return [];
  try {
    const response = await axios.get(args.link, {
      headers: commonHeaders,
      signal: args?.signal,
    });
    const $ = cheerio.load(String(response?.data || ""));
    return $(".button2,.button1,.button3,.button4,.button")
      .toArray()
      .flatMap((node) => {
        const label = __kandoFilmyFlyClean($(node).text());
        const link = String($(node).attr("href") || "").trim();
        if (
          !label ||
          !/^https?:\/\//i.test(link) ||
          /telegram|\bwatch\b/i.test(label) ||
          /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(link) ||
          /go\s*file/i.test(label)
        ) return [];
        const providerWeb =
          /gdflix|buzz/i.test(label) ||
          /(?:gdflix|buzzheavier|bzzhr)\./i.test(link);
        return [{
          server: label,
          link,
          ...(providerWeb ? {embedUrl: link} : {}),
          type: providerWeb ? "embed" : "mkv",
          transport: providerWeb ? "embed" : "progressive",
          playbackMode: providerWeb ? "provider-web" : "native",
          headers: commonHeaders,
        }];
      });
  } catch {
    return [];
  }
};
const __kandoFilmyFlyAbsolute = (value, base) => {
  try { return new URL(value, base).href; } catch { return ""; }
};
const __kandoFilmyFlyPixeldrainDirect = (value) => {
  try {
    const url = new URL(value);
    const id = url.pathname.match(/\/(?:u|api\/file)\/([^/?#]+)/i)?.[1];
    return id ? `${url.origin}/api/file/${id}` : "";
  } catch {
    return "";
  }
};
const __kandoFilmyFlyFollow = async (url, {headers, signal, referer} = {}) => {
  const response = await fetch(url, {
    headers: {...(headers || {}), ...(referer ? {Referer: referer} : {})},
    signal,
    redirect: "follow",
  });
  const finalUrl = response.url || url;
  await response.body?.cancel?.().catch?.(() => {});
  return {ok: response.ok, status: response.status, url: finalUrl};
};
const __kandoFilmyFlyTerminalPixeldrain = async (url, {headers, signal, referer} = {}) => {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {...(headers || {}), ...(referer ? {Referer: referer} : {})},
      signal,
      redirect: "follow",
    });
    await response.body?.cancel?.().catch?.(() => {});
    return response.status === 404 || response.status === 410;
  } catch {
    // A network/WAF failure is inconclusive; retain the provider's real row.
    return false;
  }
};
const __kandoFilmyFlyResolvePixeldrain = async (stream, args) => {
  try {
    const followed = await __kandoFilmyFlyFollow(stream.link, {
      headers: stream.headers,
      signal: args?.signal,
    });
    const direct = __kandoFilmyFlyPixeldrainDirect(followed.url) ||
      __kandoFilmyFlyPixeldrainDirect(stream.link);
    if (!direct || await __kandoFilmyFlyTerminalPixeldrain(direct, {
      headers: stream.headers,
      signal: args?.signal,
    })) return null;
    return {...stream, link: direct, type: "mkv", transport: "progressive"};
  } catch {
    return null;
  }
};
const __kandoFilmyFlyResolveMediaFire = async (stream, args) => {
  try {
    const commonHeaders = args?.providerContext?.commonHeaders || {};
    const providerWebFallback = () => ({
      ...stream,
      link: stream.link,
      embedUrl: stream.link,
      type: "embed",
      transport: "embed",
      playbackMode: "provider-web",
      headers: {
        ...commonHeaders,
        ...(stream.headers || {}),
      },
    });
    const first = await fetch(stream.link, {
      headers: {...commonHeaders, ...(stream.headers || {})},
      signal: args?.signal,
      redirect: "manual",
    });
    const redirect = first.headers.get("location");
    await first.body?.cancel?.().catch?.(() => {});
    const mediaUrl = __kandoFilmyFlyAbsolute(redirect, stream.link);
    if (!/\/\/download[^/]*\.mediafire\.com\//i.test(mediaUrl)) {
      return /(?:^|\/\/)(?:www\.)?mediafire\.com\//i.test(mediaUrl)
        ? providerWebFallback()
        : null;
    }

    const probe = await fetch(mediaUrl, {
      headers: {
        ...commonHeaders,
        ...(stream.headers || {}),
        Range: "bytes=0-0",
        Referer: stream.link,
      },
      signal: args?.signal,
      redirect: "manual",
    });
    const repairLocation = probe.headers.get("location") || "";
    const contentType = probe.headers.get("content-type") || "";
    const isMedia =
      (probe.status === 200 || probe.status === 206) &&
      !/text\/html/i.test(contentType);
    await probe.body?.cancel?.().catch?.(() => {});
    if (/download_repair/i.test(repairLocation)) return providerWebFallback();
    if (!isMedia) return null;
    return {
      ...stream,
      link: mediaUrl,
      type: "mkv",
      transport: "progressive",
      headers: {
        ...commonHeaders,
        ...(stream.headers || {}),
        Referer: stream.link,
      },
    };
  } catch (error) {
    if (args?.signal?.aborted) throw error;
    return null;
  }
};
const __kandoFilmyFlyResolveHubCloud = async (stream, args) => {
  const {cheerio, commonHeaders = {}} = args?.providerContext || {};
  if (!cheerio) return [];
  try {
    const landingResponse = await fetch(stream.link, {
      headers: {...commonHeaders, ...(stream.headers || {})},
      signal: args?.signal,
      redirect: "follow",
    });
    if (!landingResponse.ok) return [];
    const landingUrl = landingResponse.url || stream.link;
    const landingHtml = await landingResponse.text();
    const $landing = cheerio.load(landingHtml);
    const generatorHref = $landing("a[href]").toArray()
      .map((node) => ({
        href: $landing(node).attr("href") || "",
        label: __kandoFilmyFlyClean($landing(node).text()),
      }))
      .find((candidate) => /generate\s+direct\s+download/i.test(candidate.label))?.href;
    const generatorUrl = __kandoFilmyFlyAbsolute(generatorHref, landingUrl);
    if (!generatorUrl) return [];

    const generatorResponse = await fetch(generatorUrl, {
      headers: {...commonHeaders, Referer: landingUrl},
      signal: args?.signal,
      redirect: "follow",
    });
    if (!generatorResponse.ok) return [];
    const generatorPageUrl = generatorResponse.url || generatorUrl;
    const $ = cheerio.load(await generatorResponse.text());
    const raw = [];

    for (const node of $("a[href]").toArray()) {
      const label = __kandoFilmyFlyClean($(node).text());
      let mediaUrl = __kandoFilmyFlyAbsolute($(node).attr("href"), generatorPageUrl);
      if (!label || !mediaUrl || /telegram|tutorial|login|account|\b(?:idm|ida|vpn)\b/i.test(label)) continue;

      const pixeldrain = __kandoFilmyFlyPixeldrainDirect(mediaUrl);
      if (pixeldrain) {
        mediaUrl = pixeldrain;
        if (await __kandoFilmyFlyTerminalPixeldrain(mediaUrl, {
          headers: commonHeaders,
          signal: args?.signal,
          referer: generatorPageUrl,
        })) continue;
      } else if (/pixel\.hubcloud\./i.test(mediaUrl)) {
        try {
          const followed = await __kandoFilmyFlyFollow(mediaUrl, {
            headers: commonHeaders,
            signal: args?.signal,
            referer: generatorPageUrl,
          });
          mediaUrl = new URL(followed.url).searchParams.get("link") || "";
        } catch {
          mediaUrl = "";
        }
      } else if (/(?:hubcloud|\/\?id=)/i.test(mediaUrl)) {
        try {
          const first = await fetch(mediaUrl, {
            method: "HEAD",
            headers: {...commonHeaders, Referer: generatorPageUrl},
            signal: args?.signal,
            redirect: "manual",
          });
          let resolvedUrl =
            first.headers?.get?.("location") ||
            (first.url && first.url !== mediaUrl ? first.url : mediaUrl);
          await first.body?.cancel?.().catch?.(() => {});
          let directLink = new URL(resolvedUrl).searchParams.get("link") || "";
          if (!directLink && !/googleusercontent/i.test(resolvedUrl)) {
            const second = await fetch(resolvedUrl, {
              method: "HEAD",
              headers: {...commonHeaders, Referer: generatorPageUrl},
              signal: args?.signal,
              redirect: "manual",
            });
            resolvedUrl =
              second.headers?.get?.("location") ||
              (second.url && second.url !== resolvedUrl
                ? second.url
                : resolvedUrl);
            await second.body?.cancel?.().catch?.(() => {});
            directLink =
              new URL(resolvedUrl).searchParams.get("link") || "";
          }
          mediaUrl = directLink ||
            (/googleusercontent/i.test(resolvedUrl) ? resolvedUrl : "");
        } catch {
          mediaUrl = "";
        }
      } else if (!/(?:fsl-buckets|cloudflarestorage|googleusercontent|\.mkv(?:[?#]|$)|\.mp4(?:[?#]|$))/i.test(mediaUrl)) {
        continue;
      }

      if (!/^https?:\/\//i.test(mediaUrl)) continue;
      raw.push({
        server: label,
        link: mediaUrl,
        type: /\.mp4(?:[?#]|$)/i.test(mediaUrl) ? "mp4" : "mkv",
        headers: {...commonHeaders, Referer: generatorPageUrl},
        parentServerLabel: stream.sourceLabel || stream.server || "HubCloud",
      });
    }

    const seen = new Set();
    return raw.filter((candidate) => {
      if (seen.has(candidate.link)) return false;
      seen.add(candidate.link);
      return true;
    });
  } catch (error) {
    if (args?.signal?.aborted) throw error;
    return [];
  }
};

exports.getStream = async (args) => {
  const [original, gofileStreams] = await Promise.all([
    __kandoFilmyFlyRawControls(args),
    __kandoFilmyFlyGofileControls(args),
  ]);
  const resolvedGroups = await Promise.all(original.map(async (stream) => {
    const label = __kandoFilmyFlyClean(stream.sourceLabel || stream.server);
    const link = String(stream.link || "");
    if (
      /telegram/i.test(label) ||
      /^https?:\/\/(?:t\.me|telegram\.me)\//i.test(link)
    ) return [];
    if (
      stream.playbackMode === "provider-web" ||
      stream.transport === "embed" ||
      stream.type === "embed"
    ) return [stream];
    if (/pixeldrain/i.test(label) || /\/u\/[^/?#]+/i.test(link)) {
      const pixeldrain = await __kandoFilmyFlyResolvePixeldrain(stream, args);
      return pixeldrain ? [pixeldrain] : [];
    }
    if (/hubcloud/i.test(label) || /hubcloud\./i.test(link)) {
      return __kandoFilmyFlyResolveHubCloud(stream, args);
    }
    if (/slowcloud|mediafire/i.test(label) || /(?:bmf\.filesdl|mediafire)\./i.test(link)) {
      const mediaFire = await __kandoFilmyFlyResolveMediaFire(stream, args);
      return mediaFire ? [mediaFire] : [];
    }
    return [stream];
  }));
  const resolved = resolvedGroups.flat();
  resolved.push(...gofileStreams);
  return __kandoNormalizeStreamV2(
    resolved.map((stream) => ({...stream, server: stream.sourceLabel || stream.server})),
    args?.providerContext?.commonHeaders || {},
  );
};
