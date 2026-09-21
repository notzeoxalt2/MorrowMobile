"use strict";var __defProp=Object.defineProperty,__getOwnPropDesc=Object.getOwnPropertyDescriptor,__getOwnPropNames=Object.getOwnPropertyNames,__hasOwnProp=Object.prototype.hasOwnProperty,__name=(target,value)=>__defProp(target,"name",{value:value,configurable:!0}),__export=(target,all)=>{for(var name in all)__defProp(target,name,{get:all[name],enumerable:!0})},__copyProps=(to,from,except,desc)=>{if(from&&"object"==typeof from||"function"==typeof from)for(let key of __getOwnPropNames(from))__hasOwnProp.call(to,key)||key===except||__defProp(to,key,{get:()=>from[key],enumerable:!(desc=__getOwnPropDesc(from,key))||desc.enumerable});return to},__toCommonJS=mod=>__copyProps(__defProp({},"__esModule",{value:!0}),mod),__async=(__this,__arguments,generator)=>new Promise((resolve,reject)=>{var fulfilled=value=>{try{step(generator.next(value))}catch(e){reject(e)}},rejected=value=>{try{step(generator.throw(value))}catch(e){reject(e)}},step=x=>x.done?resolve(x.value):Promise.resolve(x.value).then(fulfilled,rejected);step((generator=generator.apply(__this,__arguments)).next())}),stream_exports={};__export(stream_exports,{getStream:()=>getStream});var getStream=__name(function(_0){return __async(this,arguments,function*({link:url}){var _a;try{const stream=[],fileExtension=(null==(_a=new URL(url).pathname.split(".").pop())?void 0:_a.toLowerCase())||"",streamType=["mp4","mkv","avi","mov","webm"].includes(fileExtension)?fileExtension:"progressive";return stream.push({server:"111477.xyz",link:url,type:streamType,headers:{"User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",Referer:"https://a.111477.xyz/"}}),stream}catch(err){return console.error("111477 stream error:",err),[]}})},"getStream");exports.getStream=getStream;

"use strict";
const __kandoProviderId = "a111477";
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
const __kandoIsPlayableLink = (value) => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === "magnet:") return Boolean(parsed.pathname);
    return ["http:", "https:"].includes(parsed.protocol)
      && Boolean(parsed.hostname)
      && !["undefined", "null"].includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
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
    if (!checkedLabel || checkedLabel === "unknown" || checkedLabel === "unknown server" || !__kandoIsPlayableLink(link)) return [];
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
