const BASE = "https://animesalt.link";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

function canonicalUrl(value) {
  if (!String(value || "").trim()) return "";
  try {
    const url = new URL(value, BASE);
    if (url.hostname === "animesalt.ac") url.hostname = "animesalt.link";
    return url.href;
  } catch { return String(value || ""); }
}

function parseJson(value) {
  try { return typeof value === "string" ? JSON.parse(value) : value || {}; }
  catch { return {}; }
}

function quality(value) {
  return String(value || "").match(/2160|1080|720|480|360/)?.[0];
}

function expiryOf(value) {
  try {
    const url = new URL(value);
    const raw = Number(url.searchParams.get("expires") || url.searchParams.get("exp") || url.searchParams.get("kx"));
    if (!Number.isFinite(raw) || raw <= 0) return undefined;
    return raw > 10_000_000_000 ? raw : raw * 1000;
  } catch { return undefined; }
}

function sourceId(...parts) {
  return ["animesalt", ...parts]
    .map((part) => String(part || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"))
    .filter(Boolean)
    .join(":");
}

function categoryFromLabel(value) {
  const label = String(value || "");
  if (/multi/i.test(label)) return "multi";
  if (/dub|hindi|tamil|telugu|english|malayalam|bengali/i.test(label)) return "dub";
  return "sub";
}

function unpackPlayerScript(html) {
  const match = String(html || "").match(/\}\('((?:\\.|[^'])*)',(\d+),(\d+),'((?:\\.|[^'])*)'\.split\('\|'\)/s);
  if (!match) return "";
  const unescapeJs = (raw) => raw.replace(/\\([\\/'"bfnrt])/g, (_, char) => ({b:"\b", f:"\f", n:"\n", r:"\r", t:"\t"}[char] ?? char));
  let payload = unescapeJs(match[1]);
  const radix = Number(match[2]);
  const count = Number(match[3]);
  const symbols = unescapeJs(match[4]).split("|");
  const encode = (value) => {
    const quotient = Math.floor(value / radix);
    const digit = value % radix;
    return (quotient ? encode(quotient) : "") + (digit > 35 ? String.fromCharCode(digit + 29) : digit.toString(36));
  };
  for (let index = count - 1; index >= 0; index -= 1) {
    if (!symbols[index]) continue;
    payload = payload.replace(new RegExp(`\\b${encode(index)}\\b`, "g"), symbols[index]);
  }
  return payload;
}

function nativePlayerConfig(html) {
  const unpacked = unpackPlayerScript(html);
  const match = unpacked.match(/FirePlayer\([^,]+,(\{.*\}),true,source\)/s);
  const config = match ? parseJson(match[1]) : {};
  const segment = (value) => {
    const parts = String(value || "").match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/);
    return parts ? [Number(parts[1]), Number(parts[2])] : [];
  };
  const [introStart, introEnd] = segment(config.fields?.intro);
  const [outroStart, outroEnd] = segment(config.fields?.outro);
  const subtitles = (Array.isArray(config.tracks) ? config.tracks : [])
    .filter((track) => track?.kind === "captions" && /^https?:/i.test(track.file || ""))
    .map((track) => ({
      title: track.label || track.language || "Subtitle",
      language: String(track.language || "en").slice(0, 2).toLowerCase(),
      type: "text/vtt",
      uri: track.file,
    }));
  return {introStart, introEnd, outroStart, outroEnd, subtitles};
}

async function manifestLanguages(url, playerUrl, signal, ctx) {
  try {
    const response = await ctx.axios.get(url, {
      signal,
      timeout: 3500,
      forceDoh: true,
      headers: {Referer: playerUrl, Origin: new URL(playerUrl).origin, "User-Agent": UA},
    });
    const manifest = String(response.data || "");
    if (!manifest.trim().startsWith("#EXTM3U")) return [];
    return [...manifest.matchAll(/#EXT-X-MEDIA:[^\r\n]*TYPE=AUDIO[^\r\n]*NAME="([^"]+)"/gi)]
      .map((match) => match[1].trim())
      .filter((name, index, all) => name && all.indexOf(name) === index);
  } catch { return []; }
}

async function nativePlayer(url, realName, category, signal, ctx) {
  const id = url.match(/\/video\/([^/?#]+)/)?.[1];
  if (!id) return [];
  const origin = new URL(url).origin;
  const [page, result] = await Promise.all([
    ctx.axios.get(url, {signal, timeout: 4500, forceDoh: true, headers:{Referer:`${BASE}/`, "User-Agent":UA}}).catch(() => ({data:""})),
    ctx.axios.post(
      `${origin}/player/index.php?data=${encodeURIComponent(id)}&do=getVideo`,
      `hash=${encodeURIComponent(id)}&r=${encodeURIComponent(BASE + "/")}`,
      {
        signal,
        timeout: 4500,
        forceDoh: true,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest",
          "User-Agent": UA,
          Referer: url,
          Origin: origin,
        },
      },
    ),
  ]);
  const data = parseJson(result.data);
  const sources = data.videoSource ? [{file:data.videoSource, label:"Auto"}] : (data.videoSources || []);
  const config = nativePlayerConfig(page.data);
  const rows = [];
  for (const source of sources.filter((item) => item.file || item.url)) {
    const link = source.file || source.url;
    const languages = await manifestLanguages(link, url, signal, ctx);
    const resolvedCategory = languages.length > 1 ? "multi" : category;
    rows.push({
      // Keep the server picker identical to AnimeSalt. The audio languages are
      // real media tracks and belong in the player, not in a renamed server.
      server: realName,
      sourceId: sourceId(category, realName, source.label || source.quality || "auto"),
      playbackMode: "native",
      health: "unchecked",
      languageCategory: resolvedCategory,
      link,
      expiresAt: expiryOf(link),
      type: String(link).includes(".m3u8") ? "m3u8" : "mp4",
      quality: quality(source.label || source.quality),
      headers: {Referer:url, Origin:origin, "User-Agent":UA, Accept:"*/*"},
      subtitles: config.subtitles,
      introStart: config.introStart,
      introEnd: config.introEnd,
      outroStart: config.outroStart,
      outroEnd: config.outroEnd,
    });
  }
  return rows;
}

function isConfirmedDeadEmbedStatus(value) {
  const status = Number(value);
  // Authentication/WAF failures (401/403), throttling (429), timeouts and
  // server errors can differ between the extractor and the real browser. A
  // missing/gone wrapper cannot work in either, so only filter those terminal
  // responses. Everything inconclusive remains available to the user.
  return status === 404 || status === 410;
}

async function keepProviderWebPlayer(player, pageLink, signal, ctx) {
  try {
    const response = await ctx.axios.get(player.url, {
      signal,
      timeout: 3500,
      forceDoh: true,
      maxRedirects: 5,
      responseType: "text",
      validateStatus: () => true,
      headers: {
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: pageLink,
        "User-Agent": UA,
      },
    });
    return !isConfirmedDeadEmbedStatus(response?.status);
  } catch (error) {
    // Axios-style adapters can reject before validateStatus is considered.
    // A status-bearing 404/410 is still conclusive; network failures, WAF
    // challenges, aborts and other transient errors are deliberately kept.
    const status = error?.response?.status ?? error?.status;
    return !isConfirmedDeadEmbedStatus(status);
  }
}

exports.getStream = async ({link, signal, providerContext}) => {
  const pageLink = canonicalUrl(link);
  const response = await providerContext.axios.get(pageLink, {
    signal,
    timeout:10000,
    forceDoh:true,
    headers:{Referer:`${BASE}/`, "User-Agent":UA},
  });
  const $ = providerContext.cheerio.load(String(response.data || ""));
  const names = $(".server-btn .server-info").map((_, element) => $(element).text().replace(/\s+/g, " ").trim()).get();
  const players = $("[id^='options-']").map((_, element) => {
    const index = Number(String($(element).attr("id") || "").match(/options-(\d+)/)?.[1] || 0);
    const iframe = $(element).find("iframe[src],iframe[data-src]").first();
    const value = iframe.attr("src") || iframe.attr("data-src") || "";
    let url = "";
    try { url = new URL(value, pageLink).href; } catch {}
    const realName = String(names[index] || "").trim();
    return {index, url, realName};
  }).get().filter((player) => player.url && player.realName);

  const tasks = [];
  const providerWebCandidates = [];
  for (const player of players) {
    if (/\/video\/[^/?#]+/i.test(player.url)) {
      tasks.push(nativePlayer(player.url, player.realName, "sub", signal, providerContext).catch(() => []));
    } else if (/multi-lang-plyr\/player\.php/i.test(player.url)) {
      // AnimeSalt exposes this as one genuine player with its own language
      // selector. Keep that player intact rather than manufacturing a server
      // for each short-link stored inside its configuration.
      providerWebCandidates.push({
        server: player.realName,
        sourceId: sourceId("multi", player.realName, player.index),
        playbackMode: "provider-web",
        embedUrl: player.url,
        health: "unchecked",
        languageCategory: "multi",
        link: player.url,
        type: "embed",
        headers: {Referer: pageLink, Origin: BASE, "User-Agent": UA},
      });
    } else {
      const category = categoryFromLabel(player.realName);
      providerWebCandidates.push({
        server: player.realName,
        sourceId: sourceId(category, player.realName, player.index),
        playbackMode: "provider-web",
        embedUrl: player.url,
        health: "unchecked",
        languageCategory: category,
        link: player.url,
        type: "embed",
        headers: {Referer: pageLink, Origin: BASE, "User-Agent": UA},
      });
    }
  }
  const [nativeSources, providerWebChecks] = await Promise.all([
    Promise.all(tasks),
    Promise.all(providerWebCandidates.map(async (stream) => (
      await keepProviderWebPlayer({url: stream.embedUrl}, pageLink, signal, providerContext)
        ? stream
        : null
    ))),
  ]);
  // Native media is immediately playable and should be the default. Genuine
  // provider-web alternatives follow it, except wrappers conclusively gone.
  const streams = [...nativeSources.flat(), ...providerWebChecks.filter(Boolean)];
  const unique = streams.filter((stream, index, all) => all.findIndex((other) => other.link === stream.link && other.server === stream.server && other.playbackMode === stream.playbackMode) === index);
  if (!unique.length) throw new Error("AnimeSalt returned no real player for this episode");
  return unique;
};
