exports.catalog = [
  {title: "Spotlight", filter: "home:Spotlight"},
  {title: "Top Airing", filter: "home:Top Airing!"},
  {title: "Most Popular", filter: "home:Most Popular"},
  {title: "Completed Series", filter: "home:Completed Series"},
  {title: "Latest Episodes", filter: "home:Latest Episode"},
  {title: "Latest Movies", filter: "home:Latest Movies"},
  {title: "Upcoming", filter: "home:Upcoming"},
];
exports.genres = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Isekai", "Romance", "School", "Sci-Fi", "Supernatural"]
  .map((name) => ({title:name, filter:`/genre/${name.toLowerCase().replace(/\s+/g, "-")}/`}));
