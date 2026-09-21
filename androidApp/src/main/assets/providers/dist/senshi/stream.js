const BASE = "https://senshi.live";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/138.0.0.0 Safari/537.36";

function decode(value) {
  const raw = String(value || "").replace(/^senshi-episode:/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function httpUrl(value, base = BASE) {
  if (!String(value || "").trim()) return "";
  try {
    const url = new URL(String(value || ""), base);
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function stablePart(value) {
  return String(value || "source").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "source";
}

function categoryOf(status) {
  const value = String(status || "").trim();
  if (/hard\s*sub|sub/i.test(value)) return {category: "sub", label: "SUB", descriptor: "sub"};
  if (/dub/i.test(value)) return {category: "dub", label: "DUB", descriptor: "dub"};
  return {category: "multi", label: value || "MULTI", descriptor: "multi"};
}

function expiryOf(value) {
  try {
    const url = new URL(value);
    const candidates = [url.searchParams.get("expires"), url.searchParams.get("expiry"), url.searchParams.get("exp"), ...url.pathname.split("/")];
    const now = Date.now();
    return candidates.map(Number).map((number) => number > 10_000_000_000 ? number : number * 1000)
      .find((number) => Number.isFinite(number) && number > now - 60_000 && number < now + 366 * 24 * 60 * 60 * 1000);
  } catch { return undefined; }
}

function marker(startValue, endValue) {
  const start = Number(startValue);
  const end = Number(endValue);
  return Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end - start <= 600
    ? {start, end}
    : null;
}

function languageOf(value) {
  const text = String(value || "").toLowerCase();
  const aliases = [
    ["en", /\b(?:eng|english)\b/], ["ja", /\b(?:jpn|japanese)\b/],
    ["hi", /\b(?:hin|hindi)\b/], ["ta", /\b(?:tam|tamil)\b/],
    ["te", /\b(?:tel|telugu)\b/], ["bn", /\b(?:ben|bengali)\b/],
    ["ml", /\b(?:mal|malayalam)\b/], ["ko", /\b(?:kor|korean)\b/],
    ["es", /\b(?:spa|spanish)\b/], ["pt", /\b(?:por|portuguese)\b/],
    ["fr", /\b(?:fre|fra|french)\b/], ["de", /\b(?:ger|deu|german)\b/],
    ["ar", /\b(?:ara|arabic)\b/], ["zh", /\b(?:chi|zho|chinese)\b/],
  ];
  return aliases.find(([, pattern]) => pattern.test(text))?.[0] || "";
}

async function subtitlesFor(baseUrl, descriptor, signal, providerContext, referer) {
  if (!baseUrl || !["sub", "dub"].includes(descriptor)) return [];
  const descriptorUrl = httpUrl(`${baseUrl.replace(/\/$/, "")}/${descriptor}_artplayer.json`);
  if (!descriptorUrl) return [];
  try {
    const response = await providerContext.axios.get(descriptorUrl, {
      signal,
      timeout: 4000,
      forceDoh: true,
      headers: {Accept: "application/json", Referer: referer, Origin: BASE, "User-Agent": USER_AGENT},
    });
    const rows = Array.isArray(response?.data) ? response.data : [];
    const tracks = rows.map((item) => {
      const uri = httpUrl(item?.url || item?.src, `${baseUrl.replace(/\/$/, "")}/`);
      const title = String(item?.html || item?.label || item?.title || item?.language || "").trim();
      const language = languageOf(`${title} ${uri}`);
      if (!uri || !title || !language) return null;
      const pathname = (() => { try { return new URL(uri).pathname.toLowerCase(); } catch { return ""; } })();
      const type = pathname.endsWith(".ass") ? "text/x-ass"
        : pathname.endsWith(".ssa") ? "text/x-ssa"
          : pathname.endsWith(".srt") ? "application/x-subrip"
            : pathname.endsWith(".vtt") ? "text/vtt" : "";
      return type ? {title, language, type, uri} : null;
    }).filter(Boolean);
    return tracks.filter((track, index, all) => all.findIndex((other) => other.uri === track.uri) === index);
  } catch { return []; }
}

function nativeHeaders(watchPage) {
  return {
    Accept: "*/*",
    Referer: watchPage,
    Origin: BASE,
    "User-Agent": USER_AGENT,
  };
}

exports.getStream = async ({link, signal, providerContext}) => {
  if (!String(link || "").startsWith("senshi-episode:")) {
    throw new Error("Refresh this Senshi episode to load its canonical stream identity");
  }
  const episode = decode(link);
  const animeId = Number(episode?.animeId || 0);
  const number = Number(episode?.number || 0);
  const publicId = String(episode?.publicId || "").trim();
  if (!animeId || !number || !publicId) throw new Error("Senshi episode identity is missing");
  const watchPage = `${BASE}/watch/${encodeURIComponent(publicId)}/${number}`;

  const response = await providerContext.axios.get(`${BASE}/episode-embeds/${animeId}/${number}`, {
    signal,
    timeout: 12000,
    forceDoh: true,
    headers: {Accept: "application/json", Referer: watchPage},
  });
  const rows = Array.isArray(response?.data) ? response.data : [];
  const intro = marker(episode.introStart, episode.introEnd);
  const outro = marker(episode.outroStart, episode.outroEnd);
  const streams = [];

  for (const row of rows) {
    const status = String(row?.status || "").trim();
    if (!status) continue;
    const category = categoryOf(status);
    const server1 = httpUrl(row?.url);
    const server2 = httpUrl(row?.server2);
    const maskedBase = httpUrl(row?.masked_base_url) || (server1 ? server1.replace(/\/playlist\.m3u8(?:\?.*)?$/i, "") : "");
    const subtitles = await subtitlesFor(maskedBase, category.descriptor, signal, providerContext, watchPage);
    const common = {
      selectorKind: "server",
      labelProvenance: "provider-api",
      providerLanguageCode: status,
      languageCategory: category.category,
      languageLabel: category.label,
      health: "unchecked",
      ...(intro ? {introStart: intro.start, introEnd: intro.end} : {}),
      ...(outro ? {outroStart: outro.start, outroEnd: outro.end} : {}),
    };

    if (server1) {
      streams.push({
        ...common,
        server: "SERVER 1",
        serverLabel: "SERVER 1",
        sourceLabel: "SERVER 1",
        sourceId: `senshi:${animeId}:e${number}:${stablePart(status)}:server1`,
        playbackMode: "native",
        transport: "hls",
        type: "m3u8",
        link: server1,
        headers: nativeHeaders(watchPage),
        expiresAt: expiryOf(server1),
        seekable: true,
        subtitles,
      });
    }
    if (server2) {
      streams.push({
        ...common,
        server: "SERVER 2",
        serverLabel: "SERVER 2",
        sourceLabel: "SERVER 2",
        sourceId: `senshi:${animeId}:e${number}:${stablePart(status)}:server2`,
        playbackMode: "native",
        transport: "progressive",
        type: "mp4",
        link: server2,
        headers: nativeHeaders(watchPage),
        expiresAt: expiryOf(server2),
        seekable: true,
        subtitles,
      });
    }
  }

  const unique = streams.filter((stream, index, all) => all.findIndex((other) => other.sourceId === stream.sourceId) === index);
  if (!unique.length) throw new Error("Senshi returned no native media URI for this episode");
  return unique;
};
