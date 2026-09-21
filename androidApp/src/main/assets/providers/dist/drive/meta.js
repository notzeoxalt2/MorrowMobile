"use strict";

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();

const firstText = ($, selectors) => {
  for (const selector of selectors) {
    const value = cleanText($(selector).first().text());
    if (value) return value;
  }
  return "";
};

const inferType = ($, title) => {
  const structuredInfo = cleanText(
    $(".left-wrapper, .page-body, .post-content")
      .first()
      .find("strong")
      .filter((_, element) => /(?:movie|series)\s*name|^\s*season\s*:/i.test(cleanText($(element).text())))
      .text(),
  );
  const categories = cleanText($(".post-categories").first().text());
  const identityText = `${title} ${structuredInfo} ${categories}`;

  if (/\bfull\s+movie\b|\bmovie\s*\/\s*film\s+info\b|\bmovie\s+name\s*:/i.test(identityText)) {
    return "movie";
  }
  if (/\bseries\s+name\s*:|\bseason\s*\d+\b|\ball\s+episodes?\b|\bs\d{1,2}\s*e\d{1,3}\b|\bweb\s+series\b/i.test(identityText)) {
    return "series";
  }
  return "movie";
};

const extractStoryline = ($) => {
  const legacy = firstText($, [
    '.left-wrapper h2:contains("Storyline") + *',
    '.left-wrapper h3:contains("Storyline") + *',
    '.left-wrapper h4:contains("Storyline") + *',
    '.left-wrapper h5:contains("Storyline") + *',
    ".ipc-html-content-inner-div",
  ]);
  if (legacy) return legacy;

  const heading = $("h2, h3, h4, h5")
    .filter((_, element) => /storyline/i.test(cleanText($(element).text())))
    .first();
  return cleanText(heading.nextAll("p, div").first().text());
};

const extractReleaseLinks = ($, type) => {
  const scope = $(".left-wrapper").length
    ? $(".left-wrapper").first()
    : $(".page-body").length
      ? $(".page-body").first()
      : $(".post-content").first();
  const links = [];
  const seen = new Set();

  scope.find("a[href]").each((_, element) => {
    const anchor = $(element);
    const anchorTitle = cleanText(anchor.text());
    const href = cleanText(anchor.attr("href"));
    if (!href || !/\b(?:480p?|720p?|1080p?|2160p?|4k)\b/i.test(anchorTitle) || /\bzip\b/i.test(anchorTitle)) {
      return;
    }

    const parentHeading = anchor.closest("h4, h5, h6");
    const releaseTitle = cleanText(
      parentHeading.prev("h1, h2, h3, h4, h5, h6, p, div").first().text(),
    ) || anchorTitle;
    const dedupeKey = `${href}\n${releaseTitle}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const quality = releaseTitle.match(/\b(480p|720p|1080p|2160p|4k)\b/i)?.[1] ||
      anchorTitle.match(/\b(480p|720p|1080p|2160p|4k)\b/i)?.[1] || "";
    links.push({
      title: releaseTitle,
      episodesLink: type === "series" ? href : "",
      directLinks: type === "movie"
        ? [{title: anchorTitle || "Movie", link: href, type: "movie"}]
        : [],
      quality,
    });
  });

  return links;
};

const getMeta = async ({link, providerContext}) => {
  try {
    const {axios, cheerio, getBaseUrl} = providerContext;
    const currentBaseUrl = await getBaseUrl("drive");
    const url = String(link || "").startsWith("http")
      ? String(link)
      : new URL(String(link || ""), `${currentBaseUrl}/`).href;
    const {data} = await axios.get(url);
    const $ = cheerio.load(data);

    const embeddedTitle = firstText($, [
      '.left-wrapper strong:contains("Movie Name") span',
      '.left-wrapper strong:contains("Series Name") span',
      '.left-wrapper strong:contains("Name") span',
      '.page-body strong:contains("Movie Name") span',
      '.page-body strong:contains("Series Name") span',
      ".post-title",
      "article h1",
      "main h1",
      "h1",
    ]);
    const documentTitle = cleanText($("meta[property='og:title']").attr("content")) ||
      cleanText($("title").text()).replace(/\s+[\u2013-]\s+MoviesDrive.*$/i, "");
    const slugTitle = decodeURIComponent(new URL(url).pathname.split("/").filter(Boolean).pop() || "")
      .replace(/[-_]+/g, " ");
    const title = cleanText(embeddedTitle || documentTitle || slugTitle).replace(/^Download\s+/i, "");
    const type = inferType($, title);
    const imdbHref = $("a[href*='imdb.com/title/']").first().attr("href") || "";
    const imdbId = String(imdbHref).match(/\b(tt\d+)\b/i)?.[1] || "";
    const synopsis = extractStoryline($);
    const image = cleanText(
      $("img.entered.lazyloaded, img.entered, img.litespeed-loaded, .page-body img.aligncenter, img.aligncenter")
        .first()
        .attr("src"),
    ) || cleanText($("meta[property='og:image']").attr("content"));
    const linkList = extractReleaseLinks($, type);

    return {title, synopsis, image, imdbId, type, linkList, webUrl: url};
  } catch (error) {
    console.error("MoviesDrive metadata error", error);
    return {title: "", synopsis: "", image: "", imdbId: "", type: "movie", linkList: []};
  }
};

exports.getMeta = getMeta;
