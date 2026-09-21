const LANGUAGE_FILTERS = [
  ["English", "eng"],
  ["Spanish", "spa"],
  ["French", "fre"],
  ["Indonesian", "ind"],
  ["Portuguese (Brazil)", "por"],
  ["Russian", "rus"],
  ["Thai", "tha"],
  ["German", "ger"],
  ["Italian", "ita"],
  ["Vietnamese", "vie"],
];

exports.catalog = [
  {title: "Latest 24 hours", filter: "updates:eng"},
  {title: "Hottest", filter: "ranking:hottest:eng"},
  {title: "Trending", filter: "ranking:trending:eng"},
  {title: "Completed", filter: "ranking:completed:eng"},
  {title: "All titles", filter: "all:eng"},
];

// KANDO's existing provider shell exposes `genres` as its secondary filter
// list. Manga Plus has content-language filters rather than genre endpoints,
// so keep the provider's real language choices here until the manga shell has
// a dedicated language control.
exports.genres = LANGUAGE_FILTERS.map(([title, code]) => ({
  title,
  filter: `all:${code}`,
}));

exports.languages = LANGUAGE_FILTERS.map(([title, code]) => ({title, code}));
