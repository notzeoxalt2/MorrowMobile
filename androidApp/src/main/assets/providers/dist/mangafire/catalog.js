exports.catalog = [
  {title: "Trending", filter: "trending:day"},
  {title: "Latest Updates", filter: "latest:hot:all"},
];

// MangaFire's home page exposes these exact latest-update filters. They are
// kept as provider facts so the dedicated manga home can present Hot/New and
// Type controls without guessing at unsupported categories.
exports.latestFilters = {
  tabs: [
    {title: "Hot", filter: "latest:hot:all"},
    {title: "New", filter: "latest:new:all"},
  ],
  types: [
    {title: "All", value: "all"},
    {title: "Manga", value: "manga"},
    {title: "Manhwa", value: "manhwa"},
    {title: "Manhua", value: "manhua"},
  ],
};

exports.genres = [
  {title: "Manga", filter: "latest:hot:manga"},
  {title: "Manhwa", filter: "latest:hot:manhwa"},
  {title: "Manhua", filter: "latest:hot:manhua"},
];
