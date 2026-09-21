const BASE = "https://senshi.live";

function decode(value) {
  const raw = String(value || "").replace(/^senshi-season:/, "").replace(/-/g, "+").replace(/_/g, "/");
  const bytes = Uint8Array.from(atob(raw + "=".repeat((4 - raw.length % 4) % 4)), (char) => char.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function encode(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function finiteTime(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

exports.getEpisodes = async ({url, providerContext}) => {
  if (!String(url || "").startsWith("senshi-season:")) {
    throw new Error("Refresh this Senshi title to load its canonical episode identity");
  }
  const season = decode(url);
  const animeId = Number(season?.id || 0);
  const publicId = String(season?.publicId || "").trim();
  if (!animeId || !publicId) throw new Error("Senshi season identity is missing");

  const response = await providerContext.axios.get(`${BASE}/episodes/${animeId}`, {
    timeout: 12000,
    forceDoh: true,
    headers: {Accept: "application/json", Referer: `${BASE}/watch/${encodeURIComponent(publicId)}/1`},
  });
  const rows = Array.isArray(response?.data) ? response.data : [];
  const seen = new Set();
  const episodes = rows.filter((episode) => Number(episode?.mal_id || 0) === animeId).map((episode) => {
    const number = Number(episode?.ep_id || 0);
    if (!Number.isFinite(number) || number <= 0 || seen.has(number)) return null;
    seen.add(number);
    const title = String(episode?.ep_title || "").trim();
    const payload = {
      animeId,
      publicId,
      episodeInfoId: Number(episode?.id || 0) || undefined,
      number,
      title,
      introStart: finiteTime(episode?.intro_start),
      introEnd: finiteTime(episode?.intro_end),
      outroStart: finiteTime(episode?.outro_start),
      outroEnd: finiteTime(episode?.outro_end),
      filler: episode?.ep_filler === true,
      recap: episode?.ep_recap === true,
    };
    return {
      title: `Episode ${number}${title ? ` · ${title}` : ""}`,
      link: `senshi-episode:${encode(payload)}`,
      description: "",
      number,
      isFiller: episode?.ep_filler === true,
    };
  }).filter(Boolean).sort((left, right) => left.number - right.number);

  if (!episodes.length) throw new Error("Senshi returned no canonical episodes for this title");
  return episodes;
};
