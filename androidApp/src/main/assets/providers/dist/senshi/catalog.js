exports.catalog = [
  {title: "Featured", filter: "sliders"},
  {title: "Latest Episodes", filter: "latest"},
  {title: "Trending Today", filter: "trending/day"},
  {title: "Trending This Week", filter: "trending/week"},
  {title: "Recently Added", filter: "recently-added"},
  {title: "Upcoming", filter: "upcoming"},
  {title: "Airing Schedule", filter: "schedule"},
];

exports.genres = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror",
  "Mystery", "Romance", "Sci-Fi", "Slice of Life", "Sports",
  "Supernatural", "Suspense",
].map((genre) => ({title: genre, filter: `GENRE:${genre}`}));
