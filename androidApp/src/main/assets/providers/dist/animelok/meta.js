const BASE = "https://animelok.net";

function absoluteUrl(value) {
  if (!String(value || "").trim()) return "";
  try { return new URL(value, BASE).href; }
  catch { return ""; }
}

function artworkUrl(value) {
  const resolved = absoluteUrl(value);
  if (!resolved) return "";
  try {
    const url = new URL(resolved);
    if (url.hostname.toLowerCase() !== "wsrv.nl") return resolved;
    return absoluteUrl(url.searchParams.get("url")) || resolved;
  } catch { return resolved; }
}

function seasonArtworkUrl(value) {
  const resolved = artworkUrl(value);
  if (!resolved) return "";
  // AnimeLok publishes the same canonical cover at multiple sizes. Its season
  // payload uses a 100x200 thumbnail that is too soft for a filled desktop
  // tile; request the provider's real 300x400 variant without changing identity.
  return resolved.replace(/\/thumbnail\/100x200\//i, "/thumbnail/300x400/");
}

function slugOf(value) {
  try { return new URL(value, BASE).pathname.split("/").filter(Boolean).pop() || ""; }
  catch { return String(value || "").split("?")[0].split("/").filter(Boolean).pop() || ""; }
}

function renderedAnime(html, cheerio, requestedSlug) {
  const $ = cheerio.load(html);
  const title = cleanText($("main h1").first().text());
  if (!title) return null;

  const titleImage = $("main img").filter((_, element) =>
    cleanText($(element).attr("alt")).toLowerCase() === title.toLowerCase(),
  ).first();
  const image = artworkUrl(
    titleImage.attr("data-src")
    || titleImage.attr("data-lazy-src")
    || titleImage.attr("src")
    || "",
  );
  const paragraphs = $("main p").map((_, element) => cleanText($(element).text())).get();
  const description = paragraphs.find((value) =>
    value.length >= 80 && !/^animelok is the best site/i.test(value),
  ) || "";

  // Next streams the season panel in a sibling suspense fragment, so it is
  // not guaranteed to be nested inside <main> in the server HTML.
  const seasonHeading = $("h2").filter((_, element) =>
    /seasons? of this anime/i.test($(element).text()),
  ).first();
  const seasonRoot = seasonHeading.closest("section");
  const seasons = [];
  seasonRoot.find('a[href*="/anime/"]').each((_, element) => {
    const anchor = $(element);
    const slug = slugOf(anchor.attr("href"));
    if (!slug || seasons.some((season) => season.slug === slug)) return;
    const label = cleanText(anchor.find("h3").first().text());
    const seasonTitle = cleanText(anchor.find("p").first().text());
    const seasonImage = anchor.find("img").first();
    const cover = artworkUrl(
      seasonImage.attr("data-src")
      || seasonImage.attr("data-lazy-src")
      || seasonImage.attr("src")
      || "",
    );
    const selected = String(anchor.attr("class") || "")
      .split(/\s+/)
      .includes("text-[var(--color-primary)]");
    seasons.push({
      slug,
      title: label || seasonTitle || title,
      name: seasonTitle || title,
      coverImage: cover ? {extraLarge: cover, large: cover} : undefined,
      selected,
      anilistId: Number(slug.match(/-(\d+)$/)?.[1] || 0) || undefined,
    });
  });

  const selectedSeason = seasons.find((season) => season.selected)
    || seasons.find((season) => cleanText(season.name).toLowerCase() === title.toLowerCase());
  const canonicalSlug = selectedSeason?.slug || requestedSlug;
  const anilistId = Number(canonicalSlug.match(/-(\d+)$/)?.[1] || 0) || undefined;
  return {
    slug: canonicalSlug,
    title,
    description,
    coverImage: image ? {extraLarge: image, large: image} : undefined,
    seasons,
    anilistId,
  };
}

function decodeFlightAnime(html, cheerio, expectedSlug = "") {
  const $ = cheerio.load(html);
  const normalizedExpected = String(expectedSlug || "").toLowerCase().replace(/^\/+|\/+$/g, "");
  const expectedId = Number(normalizedExpected.match(/-(\d+)$/)?.[1] || 0);
  const expectedBase = normalizedExpected.replace(/-\d+$/, "");
  const candidates = [];

  const scoreCandidate = (candidate) => {
    const slug = String(candidate?.slug || "").toLowerCase().replace(/^\/+|\/+$/g, "");
    if (!slug) return 0;
    if (!normalizedExpected) return 1;
    if (slug === normalizedExpected) return 10000;
    const candidateId = Number(slug.match(/-(\d+)$/)?.[1] || candidate?.anilistId || candidate?.id || 0);
    if (expectedId && candidateId === expectedId) return 8000;
    if (slug.replace(/-\d+$/, "") === expectedBase) return 5000;
    return 0;
  };

  const collectAnime = (node, depth = 0, seen = new Set()) => {
    if (!node || depth > 9 || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (node.slug && (node.coverImage || node.totalEpisodes || node.seasons)) {
      candidates.push(node);
    }
    if (node.anime?.slug) candidates.push(node.anime);
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      collectAnime(child, depth + 1, seen);
    }
  };

  $("script").each((_, element) => {
    const text = $(element).html() || "";
    const marker = "self.__next_f.push(";
    const start = text.indexOf(marker);
    const end = text.lastIndexOf(")");
    if (start < 0 || end <= start) return;
    try {
      const tuple = JSON.parse(text.slice(start + marker.length, end));
      const payload = typeof tuple?.[1] === "string" ? tuple[1] : "";
      for (const line of payload.split("\n")) {
        const colon = line.indexOf(":");
        if (colon < 0 || line[colon + 1] !== "{") continue;
        try {
          const value = JSON.parse(line.slice(colon + 1));
          collectAnime(value);
        } catch {}
      }
    } catch {}
  });
  const ranked = candidates
    .map((candidate) => ({candidate, score: scoreCandidate(candidate)}))
    .sort((left, right) => right.score - left.score);
  // With a requested route, returning an unrelated first object is more
  // damaging than returning no object: it donates another anime's seasons and
  // streams. Only accept an exact slug, AniList ID, or exact slug base match.
  return ranked[0]?.score > 0 ? ranked[0].candidate : null;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

exports.getMeta = async ({ link, providerContext }) => {
  let response = await providerContext.axios.get(link, { timeout: 15000 });
  let html = typeof response.data === "string" ? response.data : String(response.data || "");
  let $ = providerContext.cheerio.load(html);
  const requestedSlug = slugOf(link) || "anime";
  const refresh = String($('meta[http-equiv="refresh"]').attr("content") || "").match(/(?:^|;)\s*url=(.+)$/i)?.[1];
  if (refresh) {
    const canonicalLink = absoluteUrl(refresh.trim().replace(/^['"]|['"]$/g, ""));
    if (canonicalLink && canonicalLink !== absoluteUrl(link)) {
      try {
        response = await providerContext.axios.get(canonicalLink, { timeout: 15000 });
        html = typeof response.data === "string" ? response.data : String(response.data || "");
        $ = providerContext.cheerio.load(html);
      } catch {}
    }
  }
  const slug = slugOf(link) || requestedSlug;
  const fallbackTitle = slug
    .replace(/-\d+$/, "")
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  const rendered = renderedAnime(html, providerContext.cheerio, slug);
  let anime = decodeFlightAnime(html, providerContext.cheerio, slug);
  if (!anime || /^[a-f0-9]{10,}$/i.test(cleanText(anime.title || ""))) {
    anime = rendered || anime;
  } else if (rendered) {
    anime = {
      ...anime,
      title: cleanText(anime.title) || rendered.title,
      description: anime.description || rendered.description,
      coverImage: anime.coverImage || rendered.coverImage,
      seasons: Array.isArray(anime.seasons) && anime.seasons.length ? anime.seasons : rendered.seasons,
      anilistId: anime.anilistId || rendered.anilistId,
    };
  }
  if (!anime?.coverImage || !Array.isArray(anime?.seasons)) {
    try {
      const watch = await providerContext.axios.get(`${BASE}/watch/${slug}`, { timeout: 15000 });
      anime = decodeFlightAnime(String(watch.data || ""), providerContext.cheerio, slug) || anime;
    } catch {}
  }
  if (!anime?.coverImage) {
    const anilistId = Number(slug.match(/-(\d+)$/)?.[1] || 0);
    if (anilistId) {
      try {
        const graph = await providerContext.axios.post("https://graphql.anilist.co", {query:`query($id:Int){Media(id:$id,type:ANIME){title{english romaji userPreferred}description episodes averageScore genres coverImage{extraLarge large color}}}`,variables:{id:anilistId}}, {timeout:15000,headers:{"Content-Type":"application/json"}});
        const media = graph.data?.data?.Media;
        if (media) anime = {...anime, slug, title:media.title?.english||media.title?.userPreferred||media.title?.romaji, description:media.description, totalEpisodes:media.episodes, rating:media.averageScore, genres:media.genres, coverImage:media.coverImage};
      } catch {}
    }
  }
  const cover = anime?.coverImage || {};
  const image =
    cover.extraLarge ||
    cover.hianime ||
    cover.large ||
    $("meta[property='og:image']").attr("content") ||
    $("main img").first().attr("src") ||
    "";
  const seasons = Array.isArray(anime?.seasons) ? anime.seasons : [];
  const linkList = seasons
    .filter((season) => season?.slug)
    .filter((season, index, all) => all.findIndex((item) => item.slug === season.slug) === index)
    .map((season) => {
      const rawTitle = cleanText(season.title || "");
      const rawName = cleanText(season.name || "");
      const titleIsMarker = /^(?:season|part|cour)\s*\d+/i.test(rawTitle);
      const canonicalTitle = (titleIsMarker && rawName ? rawName : rawTitle || rawName) || "Season";
      return {
        title: canonicalTitle,
        ...(titleIsMarker ? {seasonLabel: rawTitle} : {}),
        image: seasonArtworkUrl(
          season.coverImage?.extraLarge || season.coverImage?.large || season.image || "",
        ),
        episodesLink: `${BASE}/watch/${season.slug}`,
        selected: season.selected === true || season.slug === anime?.slug,
        anilistId: Number(season.anilistId || String(season.slug).match(/-(\d+)$/)?.[1] || 0) || undefined,
        navigationKind: "season",
      };
    });
  if (!linkList.some((season) => season.episodesLink.endsWith(`/${anime?.slug || slug}`))) {
    linkList.unshift({
      title: cleanText(anime?.title || fallbackTitle),
      seasonLabel: "Episodes",
      episodesLink: `${BASE}/watch/${anime?.slug || slug}`,
      selected: true,
      anilistId: Number(anime?.anilistId || String(anime?.slug || slug).match(/-(\d+)$/)?.[1] || 0) || undefined,
      navigationKind: "season",
    });
  }

  const title = cleanText(anime?.title || fallbackTitle);
  const synopsis = cleanText(
    anime?.description ||
      $("meta[property='og:description']").attr("content") ||
      $("p").filter((_, element) => $(element).text().length > 150).first().text(),
  );

  return {
    title,
    image,
    synopsis,
    imdbId: "",
    type: Number(anime?.totalEpisodes || 0) === 1 ? "movie" : "series",
    tags: Array.isArray(anime?.genres) ? anime.genres.map((genre) => genre?.name || genre).filter(Boolean) : [],
    cast: [],
    rating: String(anime?.rating || ""),
    linkList,
    anilistId: Number(anime?.anilistId || String(anime?.slug || slug).match(/-(\d+)$/)?.[1] || 0) || undefined,
  };
};
