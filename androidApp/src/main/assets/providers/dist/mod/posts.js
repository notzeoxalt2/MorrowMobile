async function parsePosts({url, signal, axios, cheerio}) {
  try {
    const response = await axios.get(url, {signal});
    const $ = cheerio.load(response.data);
    const catalog = [];

    $(".post-cards").find("article").each((_, element) => {
      const anchor = $(element).find("a").first();
      const imageElement = $(element).find("img").first();
      const title = anchor.attr("title");
      const link = anchor.attr("href");
      const image = imageElement.attr("data-src")
        || imageElement.attr("data-lazy-src")
        || imageElement.attr("data-original")
        || imageElement.attr("src");

      if (title && link && image) catalog.push({title, link, image});
    });

    return catalog;
  } catch (error) {
    console.error("modGetPosts error ", error);
    return [];
  }
}

exports.getPosts = async ({filter, page, signal, providerContext}) => {
  const {getBaseUrl, axios, cheerio} = providerContext;
  const baseUrl = await getBaseUrl("Moviesmod");
  return parsePosts({
    url: `${baseUrl}${filter}/page/${page}/`,
    signal,
    axios,
    cheerio,
  });
};

exports.getSearchPosts = async ({searchQuery, page, signal, providerContext}) => {
  const {getBaseUrl, axios, cheerio} = providerContext;
  const baseUrl = await getBaseUrl("Moviesmod");
  return parsePosts({
    url: `${baseUrl}/search/${searchQuery}/page/${page}/`,
    signal,
    axios,
    cheerio,
  });
};
