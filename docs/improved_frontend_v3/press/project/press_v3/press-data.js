/* global window */
/* PRESS v3 — mock data for the design mockup. Attached to window for babel scripts. */
(function () {
/* ---------------------------------------------------------------------------
   SOURCE STYLE PROFILES
   Each publication has a deterministic identity used everywhere it appears:
     accent  — the masthead bar colour (brand ink)
     ink     — text colour ON the accent bar (auto-picked for contrast)
     face    — typographic personality of the masthead wordmark
               ("serif" | "grotesque" | "condensed" | "mono" | "slab")
     short   — compact code used on the left of the bar
     bg      — paper colour for the synthetic page render fallback
--------------------------------------------------------------------------- */
const SOURCES = {
  verge:     { name: "The Verge",          accent: "#5200ff", ink: "#fff", face: "grotesque", short: "VERGE",   bg: "#0f0f12" },
  wired:     { name: "Wired",              accent: "#000000", ink: "#fff", face: "condensed", short: "WIRED",   bg: "#ffffff" },
  ars:       { name: "Ars Technica",       accent: "#ff4e00", ink: "#fff", face: "mono",      short: "ARS",     bg: "#fcfbf7" },
  tcrunch:   { name: "TechCrunch",         accent: "#0a8a3f", ink: "#fff", face: "grotesque", short: "TC",      bg: "#ffffff" },
  nyt:       { name: "The New York Times", accent: "#000000", ink: "#fff", face: "serif",     short: "NYT",     bg: "#ffffff" },
  atlantic:  { name: "The Atlantic",       accent: "#c8102e", ink: "#fff", face: "serif",     short: "ATL",     bg: "#ffffff" },
  strat:     { name: "Stratechery",        accent: "#4b7bbd", ink: "#fff", face: "serif",     short: "STRAT",   bg: "#fffdf8" },
  bloomberg: { name: "Bloomberg",          accent: "#1a1a1a", ink: "#fff", face: "slab",      short: "BBG",     bg: "#fafafa" },
  mit:       { name: "MIT Tech Review",    accent: "#d6373b", ink: "#fff", face: "condensed", short: "MIT TR",  bg: "#faf8f5" },
  quanta:    { name: "Quanta",             accent: "#1b1f7a", ink: "#fff", face: "serif",     short: "QUANTA",  bg: "#ffffff" },
  a16z:      { name: "a16z",               accent: "#ff5c35", ink: "#fff", face: "mono",      short: "A16Z",    bg: "#16140f" },
  pragmatic: { name: "The Pragmatic Eng.", accent: "#e8553f", ink: "#fff", face: "slab",      short: "PRAGMA",  bg: "#fffaf5" },
};

/* Masthead face → font stack. Loaded in index.html. */
const FACE_FONT = {
  serif:     '"Newsreader", Georgia, serif',
  grotesque: '"Archivo", "Geist", sans-serif',
  condensed: '"Archivo Narrow", "Arial Narrow", sans-serif',
  mono:      '"Geist Mono", ui-monospace, monospace',
  slab:      '"Roboto Slab", Georgia, serif',
};

/* ---------------------------------------------------------------------------
   TAG TREE  (hierarchical)
   Each tag: id, name (camelCase — enforced by backend), description,
   color (hex), hue, parentId (null = root), isActive.
   Child colours are a different LIGHTNESS/HUE-step within the parent family.
--------------------------------------------------------------------------- */
const TAGS = [
  // AI family (blue-violet, hue 265)
  { id: 1,  name: "artificialIntelligence", desc: "Anything about AI systems, research, and products.", parentId: null, hue: 265, color: "#7c5cff", isActive: true },
  { id: 2,  name: "largeLanguageModels",    desc: "LLMs: training, inference, evals.",                   parentId: 1,    hue: 265, color: "#9a82ff", isActive: true },
  { id: 3,  name: "aiAgents",               desc: "Autonomous + tool-using agent systems.",              parentId: 1,    hue: 265, color: "#b0a0ff", isActive: true },
  { id: 4,  name: "retrievalAugmented",     desc: "RAG, embeddings, vector search.",                     parentId: 2,    hue: 265, color: "#c4b8ff", isActive: true },
  { id: 5,  name: "openSourceModels",       desc: "Open-weight model releases.",                         parentId: 2,    hue: 265, color: "#c4b8ff", isActive: false },

  // Hardware family (cyan, hue 200)
  { id: 6,  name: "consumerHardware",       desc: "Phones, laptops, wearables, silicon.",                parentId: null, hue: 200, color: "#1ea7d4", isActive: true },
  { id: 7,  name: "appleSilicon",           desc: "Apple's M-series + custom chips.",                    parentId: 6,    hue: 200, color: "#4dbce0", isActive: true },
  { id: 8,  name: "gpus",                   desc: "Graphics + accelerator hardware.",                    parentId: 6,    hue: 200, color: "#7acce8", isActive: true },

  // Business family (amber, hue 60)
  { id: 9,  name: "startupsAndBusiness",    desc: "Funding, strategy, go-to-market.",                    parentId: null, hue: 60,  color: "#d99a00", isActive: true },
  { id: 10, name: "ventureCapital",         desc: "VC funds, rounds, theses.",                           parentId: 9,    hue: 60,  color: "#e3b32e", isActive: true },
  { id: 11, name: "goToMarket",             desc: "Pricing, sales, distribution.",                       parentId: 9,    hue: 60,  color: "#edc95c", isActive: true },

  // Science family (magenta, hue 330)
  { id: 12, name: "scienceAndSpace",        desc: "Physics, space, climate, biotech.",                   parentId: null, hue: 330, color: "#d83b8e", isActive: true },
  { id: 13, name: "spaceExploration",       desc: "Launches, missions, astronomy.",                      parentId: 12,   hue: 330, color: "#e066a6", isActive: true },
];

/* Articles. cat = root tag id for the rail grouping. tagIds = applied tags. */
const TITLES = [
  "What to Expect From WWDC 2026: Gemini-Powered Siri and More",
  "Google Labs Releases Dreambeans App, Powered by Personal Intelligence",
  "Google follows Anthropic in signing a compute deal worth billions",
  "OpenAI Set to Unveil Major Move Tonight, GPT-5.5 Rumored",
  "Meet Memory OS: A 6-Layer Open-Source Architecture for Agents",
  "Google's Dreambeans is the weirdest-named AI tool in years",
  "The M5 Max benchmarks leak ahead of the October keynote",
  "Inside the vector database price war reshaping RAG",
  "How a16z is rewriting the seed-stage playbook for AI",
  "A new telescope just resolved the earliest galaxies yet",
  "The quiet rise of on-device inference and what it costs",
  "Why every SaaS company is suddenly a model company",
];

let _id = 100;
const ARTICLES = [];
const SRC_KEYS = Object.keys(SOURCES);
const ROOT_TAGS = TAGS.filter((t) => t.parentId === null);
ROOT_TAGS.forEach((root, ri) => {
  const childIds = TAGS.filter((t) => t.parentId === root.id || t.parentId && TAGS.find(x => x.id === t.parentId)?.parentId === root.id).map(t => t.id);
  const n = 6 + (ri % 3);
  for (let i = 0; i < n; i++) {
    const src = SRC_KEYS[(ri * 3 + i) % SRC_KEYS.length];
    const applied = [root.id, childIds[i % Math.max(1, childIds.length)]].filter(Boolean);
    ARTICLES.push({
      id: _id++,
      title: TITLES[(ri * 2 + i) % TITLES.length],
      src,
      cat: root.id,
      tagIds: applied,
      host: ({ verge: "theverge.com", wired: "wired.com", ars: "arstechnica.com", tcrunch: "techcrunch.com", nyt: "nytimes.com", atlantic: "theatlantic.com", strat: "stratechery.com", bloomberg: "bloomberg.com", mit: "technologyreview.com", quanta: "quantamagazine.org", a16z: "a16z.com", pragmatic: "pragmaticengineer.com" })[src],
      ago: ["3h ago", "5h ago", "13h ago", "1d ago", "2d ago"][(i + ri) % 5],
      readMins: 4 + ((i * 3 + ri) % 9),
    });
  }
});

window.PRESS = { SOURCES, FACE_FONT, TAGS, ARTICLES, ROOT_TAGS };
})();
