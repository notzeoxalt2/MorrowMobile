exports.catalog = [
  {title: "Trending Now", filter: "TRENDING_DESC"},
  {title: "Airing Soon", filter: "AIRING_SOON"},
  {title: "Popular This Season", filter: "POPULARITY_DESC"},
  {title: "Top Rated", filter: "SCORE_DESC"},
  {title: "Currently Airing", filter: "AIRING"},
  {title: "Anime Movies", filter: "MOVIES"},
  {title: "Recently Updated", filter: "UPDATED_DESC"},
];

exports.genres = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Psychological", "Romance", "Sci-Fi", "Slice of Life",
  "Sports", "Supernatural", "Thriller",
].map((genre) => ({title: genre, filter: `GENRE:${genre}`}));
