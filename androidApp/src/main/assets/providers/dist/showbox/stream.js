"use strict";var __defProp=Object.defineProperty,__getOwnPropDesc=Object.getOwnPropertyDescriptor,__getOwnPropNames=Object.getOwnPropertyNames,__hasOwnProp=Object.prototype.hasOwnProperty,__name=(target,value)=>__defProp(target,"name",{value:value,configurable:!0}),__export=(target,all)=>{for(var name in all)__defProp(target,name,{get:all[name],enumerable:!0})},__copyProps=(to,from,except,desc)=>{if(from&&"object"==typeof from||"function"==typeof from)for(let key of __getOwnPropNames(from))__hasOwnProp.call(to,key)||key===except||__defProp(to,key,{get:()=>from[key],enumerable:!(desc=__getOwnPropDesc(from,key))||desc.enumerable});return to},__toCommonJS=mod=>__copyProps(__defProp({},"__esModule",{value:!0}),mod),__async=(__this,__arguments,generator)=>new Promise((resolve,reject)=>{var fulfilled=value=>{try{step(generator.next(value))}catch(e){reject(e)}},rejected=value=>{try{step(generator.throw(value))}catch(e){reject(e)}},step=x=>x.done?resolve(x.value):Promise.resolve(x.value).then(fulfilled,rejected);step((generator=generator.apply(__this,__arguments)).next())}),stream_exports={};__export(stream_exports,{getStream:()=>getStream});var getStream=__name(function(_0){return __async(this,arguments,function*({link:id,signal:signal,providerContext:providerContext}){try{const{axios:axios,cheerio:cheerio}=providerContext,stream=[],[,epId]=id.split("&"),url=`https://feb.8man.workers.dev/?fid=${epId}`,data=(yield axios.get(url,{signal:signal})).data,$=cheerio.load(data.html);return $(".file_quality").each((i,el)=>{const server=$(el).find("p.name").text()+" - "+$(el).find("p.size").text()+" - "+$(el).find("p.speed").text(),link=$(el).attr("data-url");link&&stream.push({server:server,type:"mkv",link:link})}),console.log(stream),stream}catch(err){return[]}})},"getStream");exports.getStream=getStream;
"use strict";
const __kandoProviderId = "showbox";
const __kandoLabelProvenance = "provider-dom";
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
    return [{
      ...stream,
      sourceId: `${__kandoProviderId}:${__kandoIdPart(identity)}:${occurrence}`,
      selectorKind: "server",
      sourceLabel,
      serverLabel: sourceLabel,
      labelProvenance: __kandoLabelProvenance,
      playbackMode: transport === "embed" ? "provider-web" : "native",
      transport,
      headers: {...commonHeaders, ...(stream.headers || {})},
      ...(typeof stream.seekable === "boolean" ? {seekable: stream.seekable} : {}),
    }];
  });
};
exports.normalizeStreamV2 = __kandoNormalizeStreamV2;
exports.getStream = async (args) => __kandoNormalizeStreamV2(
  await __kandoLegacyGetStream(args),
  args?.providerContext?.commonHeaders || {},
);
