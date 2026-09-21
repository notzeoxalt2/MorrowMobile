"use strict";

const MOVIEBOX_PROXY = "https://worker.zendax.me/api/moviebox";

const proxyUrl = (path) => `${MOVIEBOX_PROXY}?url=${encodeURIComponent(path)}`;

const cleanTitle = (value) =>
  String(value || "")
    .replace(/\[[^\]]*(?:\]|$)/g, " ")
    .replace(/[_|]+/g, " ")
    .replace(/\b(?:2160p|1080p|720p|480p|cam|web[- ]?dl|web[- ]?rip|blu[- ]?ray|hdr|hevc|x26[45])\b.*$/i, " ")
    .replace(/\s+/g, " ")
    .trim();

const landscapeImage = (...values) => {
  const candidates = values.flat(Infinity).filter((value) => value && typeof value === "object");
  return candidates
    .map((value) => ({
      url: String(value.url || value.image || "").trim(),
      width: Number(value.width || 0),
      height: Number(value.height || 0),
    }))
    .filter((value) => {
      const ratio = value.width / Math.max(1, value.height);
      return value.url && value.width >= 1100 && value.height >= 480 && ratio >= 1.45 && ratio <= 3.35;
    })
    .sort((left, right) => right.width * right.height - left.width * left.height)[0];
};

const getMeta = async ({link}) => {
  try {
    const response = await fetch(proxyUrl(link), {
      headers: {"Cache-Control": "no-cache", Pragma: "no-cache"},
    });
    if (!response.ok) throw new Error(`MovieBox proxy returned HTTP ${response.status}`);
    const payload = await response.json();
    const data = payload?.data;
    if (!data || typeof data !== "object") throw new Error("MovieBox returned no metadata");

    // `postTitle` is user-facing feed copy on MovieBox and is frequently a
    // review/tagline ("WHY SO MUCH HATE?") or a release filename
    // ("The Odyssey[CAM]_1080P"). `title` is the canonical subject identity
    // used by the cover, streams and seasons, so it must win whenever present.
    const title = cleanTitle(data.title || data.postTitle);
    const releaseDate = String(data.releaseDate || "");
    const year = releaseDate.match(/(?:19|20)\d{2}/)?.[0] || "";
    const poster = String(data.cover?.url || "");
    const backdrop = landscapeImage(
      data.trailer?.cover,
      data.preVideoCover,
      data.stills,
    );
    const isSeries = Number(data.subjectType) === 2
      || Number(data.seNum) > 1
      || Number(data.season) > 0;
    const type = isSeries ? "series" : "movie";
    const links = [];
    const seasonCount = isSeries
      ? Math.max(1, Number(data.seNum || data.season || 1))
      : 0;
    const audioVariants = Array.isArray(data.dubs) && data.dubs.length
      ? data.dubs
      : [{
          subjectId: data.subjectId,
          lanName: "Original Audio",
        }];

    for (const dub of audioVariants) {
      const subjectId = String(dub?.subjectId || "").trim();
      const language = String(dub?.lanName || "").trim();
      if (!subjectId || !language) continue;
      const season = isSeries ? 1 : 0;
      const episodeFrom = isSeries ? 1 : 0;
      const episodeTo = isSeries ? 20 : 0;
      links.push({
        title: language,
        episodesLink:
          `/wefeed-mobile-bff/subject-api/resource?subjectId=${encodeURIComponent(subjectId)}` +
          `&page=1&perPage=20&all=0&startPosition=${episodeFrom}` +
          `&endPosition=${episodeTo}&pagerMode=0&resolution=1080` +
          `&se=${season}&epFrom=${episodeFrom}&epTo=${episodeTo}` +
          `&_kandoSeNum=${seasonCount}`,
      });
    }

    return {
      title,
      synopsis: String(data.description || ""),
      description: String(data.description || ""),
      image: poster,
      poster,
      portraitImage: poster,
      backdrop: backdrop?.url || "",
      backgroundCandidates: backdrop?.url ? [backdrop.url] : [],
      backgroundWidth: backdrop?.width,
      backgroundHeight: backdrop?.height,
      imdbId: "",
      tmdbId: undefined,
      type,
      year,
      releaseDate,
      releaseInfo: year,
      runtime: String(data.duration || ""),
      rating: String(data.imdbRatingValue || ""),
      imdbRating: String(data.imdbRatingValue || ""),
      tags: String(data.genre || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      webUrl: String(data.detailUrl || ""),
      linkList: links,
    };
  } catch {
    return {
      title: "",
      synopsis: "",
      image: "",
      imdbId: "",
      type: "movie",
      linkList: [],
    };
  }
};

exports.cleanTitle = cleanTitle;
exports.landscapeImage = landscapeImage;
exports.getMeta = getMeta;
