const BASE = "https://animelok.net";

function dataOf(response) {
  if (typeof response.data === "string") return JSON.parse(response.data);
  return response.data || {};
}

function explicitFiller(value) {
  return value === true || value === 1 || /^(?:true|filler)$/i.test(String(value || "").trim());
}

exports.getEpisodes = async ({ url, providerContext }) => {
  let slug = String(url).split("?")[0].split("/").filter(Boolean).pop();
  if (!slug) throw new Error("AnimeLok series slug is missing");
  let anilistId = Number(slug.match(/-(\d+)$/)?.[1] || 0);
  const requestPage = async (page) => {
    const response = await providerContext.axios.get(
      `${BASE}/api/anime/${encodeURIComponent(slug)}/episodes-range?page=${page}&lang=ALL&pageSize=2000`,
      { timeout: 15000 },
    );
    return dataOf(response);
  };

  let first = await requestPage(0);
  if (!first?.episodes?.length && !/-\d+$/.test(slug)) {
    try {
      const watch = await providerContext.axios.get(`${BASE}/watch/${encodeURIComponent(slug)}`, {timeout:10000});
      const canonical = String(watch.data || "").match(/slug\\?"\s*:\s*\\?"([^"\\]+)/)?.[1];
      if (canonical) {
        slug = canonical;
        anilistId = Number(slug.match(/-(\d+)$/)?.[1] || 0);
        first = await requestPage(0);
      }
    } catch {}
  }
  const totalPages = Math.max(1, Number(first.totalPages || 1));
  const remaining = totalPages > 1
    ? await Promise.all(Array.from({ length: totalPages - 1 }, (_, index) => requestPage(index + 1)))
    : [];
  const episodes = [first, ...remaining]
    .flatMap((page) => Array.isArray(page.episodes) ? page.episodes : [])
    .filter((episode) => Number(episode?.number) > 0)
    .sort((a, b) => Number(a.number) - Number(b.number));

  if (!episodes.length) throw new Error("AnimeLok did not return any episodes");
  return episodes.map((episode) => ({
    title: `Episode ${episode.number}${episode.name ? ` · ${episode.name}` : ""}${explicitFiller(episode.isFiller) ? " · Filler" : ""}`,
    link: `${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/${episode.number}?anilistId=${anilistId}`,
    image: episode.img || episode.image || episode.thumbnail || "",
    description: episode.description || "",
    number: Number(episode.number),
    isFiller: explicitFiller(episode.isFiller),
  }));
};
