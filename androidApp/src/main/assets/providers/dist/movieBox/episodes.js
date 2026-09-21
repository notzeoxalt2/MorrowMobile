"use strict";

const MOVIEBOX_PROXY = "https://worker.zendax.me/api/moviebox";
const EPISODE_BATCH_SIZE = 20;
const MAX_EPISODES_PER_SEASON = 1000;

const isExpiredSignedUrl = (value, nowSeconds = Date.now() / 1000) => {
  try {
    const expiresAt = Number(new URL(value).searchParams.get("t"));
    return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= nowSeconds;
  } catch {
    return true;
  }
};

const refreshedProviderPath = (value) => {
  try {
    const parsed = new URL(String(value || ""), "https://moviebox.ph");
    parsed.searchParams.set("_kando_refresh", String(Date.now()));
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return String(value || "");
  }
};

const upstreamProviderPath = (value) => {
  const parsed = new URL(String(value || ""), "https://moviebox.ph");
  parsed.searchParams.delete("_kandoSeNum");
  parsed.searchParams.delete("_kando_refresh");
  return `${parsed.pathname}${parsed.search}`;
};

const requestResourceList = async (url, refresh = false) => {
  const providerPath = upstreamProviderPath(
    refresh ? refreshedProviderPath(url) : url,
  );
  const proxyUrl =
    `${MOVIEBOX_PROXY}?url=${encodeURIComponent(providerPath)}` +
    (refresh ? `&_=${Date.now()}` : "");
  const response = await fetch(proxyUrl, {
    headers: {"Cache-Control": "no-cache, no-store", Pragma: "no-cache"},
  });
  if (!response.ok) throw new Error(`MovieBox proxy returned HTTP ${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.data?.list) ? data.data.list : [];
};

const exactResourcePath = (basePath, item) => {
  const parsed = new URL(String(basePath || ""), "https://moviebox.ph");
  const season = Math.max(0, Number(item?.se || 0));
  const episode = Math.max(0, Number(item?.ep || 0));
  parsed.searchParams.delete("_kandoSeNum");
  parsed.searchParams.delete("_kando_refresh");
  parsed.searchParams.set("page", "1");
  parsed.searchParams.set("perPage", "20");
  parsed.searchParams.set("all", "0");
  parsed.searchParams.set("startPosition", String(episode));
  parsed.searchParams.set("endPosition", String(episode));
  parsed.searchParams.set("pagerMode", "0");
  parsed.searchParams.set("resolution", "1080");
  parsed.searchParams.set("se", String(season));
  parsed.searchParams.set("epFrom", String(episode));
  parsed.searchParams.set("epTo", String(episode));
  return `${parsed.pathname}${parsed.search}`;
};

const toEpisodeLinks = (items, basePath) => {
  const episodeLinks = [];
  for (const item of Array.isArray(items) ? items : []) {
    const title = item?.ep
      ? `S-${item.se} E-${item.ep}`
      : String(item?.title || "").trim();
    const resourceLink = String(item?.resourceLink || "").trim();
    if (!title) continue;
    const resourcePath = exactResourcePath(basePath, item);
    if (!resourceLink && !resourcePath) continue;
    episodeLinks.push({
      title,
      // Keep a stable provider resource identity even when the short-lived
      // signed CDN URL has expired. Stream extraction refreshes this exact
      // episode on demand instead of making the episode list disappear.
      link: JSON.stringify({
        url: isExpiredSignedUrl(resourceLink) ? "" : resourceLink,
        title,
        resourcePath,
      }),
    });
  }
  return episodeLinks;
};

const resourcePathForRange = (basePath, season, from, to) => {
  const parsed = new URL(String(basePath || ""), "https://moviebox.ph");
  parsed.searchParams.delete("_kandoSeNum");
  parsed.searchParams.delete("_kando_refresh");
  parsed.searchParams.set("page", "1");
  parsed.searchParams.set("perPage", String(EPISODE_BATCH_SIZE));
  parsed.searchParams.set("all", "0");
  parsed.searchParams.set("startPosition", String(from));
  parsed.searchParams.set("endPosition", String(to));
  parsed.searchParams.set("pagerMode", "0");
  parsed.searchParams.set("resolution", "1080");
  parsed.searchParams.set("se", String(season));
  parsed.searchParams.set("epFrom", String(from));
  parsed.searchParams.set("epTo", String(to));
  return `${parsed.pathname}${parsed.search}`;
};

const requestCompleteResourceList = async (url) => {
  const parsed = new URL(String(url || ""), "https://moviebox.ph");
  const seasonCount = Math.max(
    0,
    Number(parsed.searchParams.get("_kandoSeNum") || 0),
  );
  if (seasonCount === 0) {
    const moviePath = resourcePathForRange(url, 0, 0, 0);
    return {
      items: await requestResourceList(moviePath),
      basePath: moviePath,
    };
  }

  const collected = [];
  for (let season = 1; season <= seasonCount; season += 1) {
    for (
      let from = 1;
      from <= MAX_EPISODES_PER_SEASON;
      from += EPISODE_BATCH_SIZE
    ) {
      const to = from + EPISODE_BATCH_SIZE - 1;
      const rangePath = resourcePathForRange(url, season, from, to);
      let batch;
      try {
        batch = await requestResourceList(rangePath);
      } catch {
        // A future/announced season may have no resources yet. One unavailable
        // season must not hide the seasons and episodes that do exist.
        break;
      }
      collected.push(...batch);
      if (batch.length < EPISODE_BATCH_SIZE) break;
    }
  }
  return {items: collected, basePath: url};
};

const getEpisodes = async ({url}) => {
  try {
    const {items, basePath} = await requestCompleteResourceList(url);
    const seen = new Set();
    return toEpisodeLinks(items, basePath).filter((episode) => {
      if (seen.has(episode.link)) return false;
      seen.add(episode.link);
      return true;
    });
  } catch {
    return [];
  }
};

exports.isExpiredSignedUrl = isExpiredSignedUrl;
exports.refreshedProviderPath = refreshedProviderPath;
exports.upstreamProviderPath = upstreamProviderPath;
exports.exactResourcePath = exactResourcePath;
exports.resourcePathForRange = resourcePathForRange;
exports.getEpisodes = getEpisodes;
