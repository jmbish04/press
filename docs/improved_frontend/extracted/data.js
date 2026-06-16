/* global window */
/* PRESS — mock archive data. Attached to window for all babel scripts. */

// Publications with brand colours used to tint faux page-renders.
const SOURCES = {
  verge:      { name: "The Verge",        accent: "#5200ff", bg: "#0f0f12", short: "VERGE" },
  ars:        { name: "Ars Technica",     accent: "#ff4e00", bg: "#fcfbf7", short: "ARS" },
  wired:      { name: "Wired",            accent: "#000000", bg: "#ffffff", short: "WIRED" },
  tcrunch:    { name: "TechCrunch",       accent: "#0a8a3f", bg: "#ffffff", short: "TC" },
  mit:        { name: "MIT Tech Review",  accent: "#d6373b", bg: "#faf8f5", short: "MIT TR" },
  strat:      { name: "Stratechery",      accent: "#4b7bbd", bg: "#fffdf8", short: "STRAT" },
  atlantic:   { name: "The Atlantic",     accent: "#cc2027", bg: "#ffffff", short: "ATLANTIC" },
  bloomberg:  { name: "Bloomberg",        accent: "#000000", bg: "#fafafa", short: "BBG" },
  hbr:        { name: "Harvard Business", accent: "#b31b1b", bg: "#fbf7f2", short: "HBR" },
  quanta:     { name: "Quanta",           accent: "#1b1f7a", bg: "#ffffff", short: "QUANTA" },
  nautilus:   { name: "Nautilus",         accent: "#1b6f8c", bg: "#f4f1ea", short: "NAUT" },
  a16z:       { name: "a16z",             accent: "#ff5c35", bg: "#16140f", short: "A16Z" },
  rest:       { name: "Rest of World",    accent: "#e8c200", bg: "#0e0e0e", short: "ROW" },
  pragmatic:  { name: "Pragmatic Eng.",   accent: "#e8553f", bg: "#fffaf5", short: "PRAGMA" },
  nyt:        { name: "NYT",              accent: "#000000", bg: "#ffffff", short: "NYT" },
};

// Categories become the newsstand rows. Hue drives the colour dot.
const CATEGORIES = [
  { id: "ai",       name: "AI & Machine Learning",   hue: 265, dur: 64 },
  { id: "hardware", name: "Consumer Tech & Hardware", hue: 200, dur: 72 },
  { id: "career",   name: "Career & Interviewing",    hue: 150, dur: 58 },
  { id: "startups", name: "Startups & Business",       hue: 30,  dur: 78 },
  { id: "finance",  name: "Personal Finance",          hue: 95,  dur: 68 },
  { id: "science",  name: "Science & Space",           hue: 320, dur: 74 },
];

// Tags carry a hue (from their primary category) + origin (ai/human) + confidence.
const TAGS = {
  llm:           { label: "LLMs",              hue: 265 },
  rag:           { label: "RAG",               hue: 265 },
  "open-source": { label: "open-source",       hue: 265 },
  agents:        { label: "agents",            hue: 265 },
  inference:     { label: "inference",         hue: 265 },
  "apple-silicon":{ label: "Apple Silicon",    hue: 200 },
  gpu:           { label: "GPUs",              hue: 200 },
  laptops:       { label: "laptops",           hue: 200 },
  "build-a-pc":  { label: "build-a-PC",        hue: 200 },
  reviews:       { label: "reviews",           hue: 200 },
  interviewing:  { label: "interviewing",      hue: 150 },
  negotiation:   { label: "negotiation",       hue: 150 },
  resume:        { label: "resume",            hue: 150 },
  "remote-work": { label: "remote work",       hue: 150 },
  leadership:    { label: "leadership",        hue: 150 },
  vc:            { label: "venture capital",   hue: 30 },
  "go-to-market":{ label: "go-to-market",      hue: 30 },
  saas:          { label: "SaaS",              hue: 30 },
  "index-funds": { label: "index funds",       hue: 95 },
  fire:          { label: "FIRE",              hue: 95 },
  taxes:         { label: "taxes",             hue: 95 },
  housing:       { label: "housing",           hue: 95 },
  space:         { label: "space",             hue: 320 },
  physics:       { label: "physics",           hue: 320 },
  biotech:       { label: "biotech",           hue: 320 },
  climate:       { label: "climate",           hue: 320 },
};

let _id = 1000;
function art(o) {
  _id++;
  return Object.assign({
    id: _id,
    readMins: 4 + (_id % 9),
    date: o.date || "May 2026",
    hasAudio: false,
    status: "archived",
  }, o);
}

const ARTICLES = [
  // AI
  art({ cat: "ai", src: "strat", title: "The Agentic Web and the End of the App Store", excerpt: "When models can operate software on your behalf, distribution stops being a screen you tap and becomes an intent you express.", tags: [["agents","ai",0.94],["llm","ai",0.88],["saas","human"]], date: "Jun 2026", hasAudio: true }),
  art({ cat: "ai", src: "verge", title: "Inside the race to make on-device models actually useful", excerpt: "Quantization, speculative decoding, and a lot of thermal headroom: how phones learned to run 7B parameters.", tags: [["inference","ai",0.91],["apple-silicon","ai",0.72]] }),
  art({ cat: "ai", src: "mit", title: "RAG is not dead, it just grew up", excerpt: "Retrieval pipelines are quietly becoming the substrate of every serious AI product. A field guide.", tags: [["rag","ai",0.96],["llm","ai",0.9]], hasAudio: true }),
  art({ cat: "ai", src: "a16z", title: "Open weights, closed moats", excerpt: "Why the open-source model wave doesn't threaten the labs the way the headlines suggest.", tags: [["open-source","ai",0.93],["llm","ai",0.85],["vc","human"]] }),
  art({ cat: "ai", src: "pragmatic", title: "What 'agents' actually means to engineers shipping in 2026", excerpt: "Cutting through the term-overload: loops, tools, evals, and the unglamorous plumbing in between.", tags: [["agents","ai",0.89],["inference","ai",0.6]] }),
  art({ cat: "ai", src: "quanta", title: "The mathematics of why attention works", excerpt: "A surprisingly clean account of what transformers are really computing.", tags: [["llm","ai",0.82],["physics","ai",0.55]] }),

  // Hardware
  art({ cat: "hardware", src: "verge", title: "The 2026 laptop buyer's guide for people who hate buying laptops", excerpt: "Twelve machines, ranked by the only metrics that matter: battery, keyboard, and whether the webcam is a crime.", tags: [["laptops","ai",0.95],["reviews","human"]], hasAudio: true }),
  art({ cat: "hardware", src: "ars", title: "Building a quiet, powerful home AI workstation for under $2,500", excerpt: "A parts list and the thermal compromises behind running local inference without a jet engine on your desk.", tags: [["build-a-pc","ai",0.97],["gpu","ai",0.9],["inference","human"]] }),
  art({ cat: "hardware", src: "ars", title: "Apple Silicon's memory bandwidth is its real superpower", excerpt: "Unified memory changed the calculus for creative and ML workloads. Benchmarks inside.", tags: [["apple-silicon","ai",0.94],["gpu","ai",0.66]] }),
  art({ cat: "hardware", src: "verge", title: "The best mechanical keyboards, tested for 400 hours", excerpt: "Switches, sound, and the diminishing returns of spending more than $150.", tags: [["reviews","ai",0.88]] }),
  art({ cat: "hardware", src: "wired", title: "GPUs are the new oil, and the supply chain knows it", excerpt: "From fab to data center, mapping the chokepoints that decide who gets to train.", tags: [["gpu","ai",0.92],["inference","human"]] }),

  // Career
  art({ cat: "career", src: "hbr", title: "How to answer 'tell me about yourself' without rambling", excerpt: "A three-part structure that turns the most-dreaded opener into your strongest 90 seconds.", tags: [["interviewing","ai",0.97],["resume","human"]], hasAudio: true }),
  art({ cat: "career", src: "hbr", title: "The salary negotiation script that actually works", excerpt: "What to say after they name a number, and the silence that does the heavy lifting.", tags: [["negotiation","ai",0.96],["interviewing","ai",0.78]] }),
  art({ cat: "career", src: "pragmatic", title: "Acing the system design interview as a senior engineer", excerpt: "A repeatable framework for the whiteboard, plus the signals interviewers are really grading.", tags: [["interviewing","ai",0.93]], hasAudio: true }),
  art({ cat: "career", src: "atlantic", title: "The quiet return to the office, and how to negotiate around it", excerpt: "Hybrid policy is a negotiation, not a memo. Leverage you didn't know you had.", tags: [["remote-work","ai",0.9],["negotiation","ai",0.61]] }),
  art({ cat: "career", src: "hbr", title: "Becoming a manager without losing the thread of the work", excerpt: "The first 90 days of leadership, and the habits that quietly compound.", tags: [["leadership","ai",0.94],["remote-work","human"]] }),

  // Startups
  art({ cat: "startups", src: "strat", title: "Aggregation theory, ten years on", excerpt: "What the framework got right, what it missed, and how AI rewrites the demand side.", tags: [["go-to-market","ai",0.85],["saas","ai",0.8]], hasAudio: true }),
  art({ cat: "startups", src: "a16z", title: "The new playbook for AI-native SaaS pricing", excerpt: "Seats are dead, usage is messy: pricing models that survive contact with a model's marginal cost.", tags: [["saas","ai",0.94],["go-to-market","ai",0.82]] }),
  art({ cat: "startups", src: "tcrunch", title: "Seed rounds are getting smaller and stranger", excerpt: "Why the $1.5M pre-seed is back, and what it means for first-time founders.", tags: [["vc","ai",0.95]] }),
  art({ cat: "startups", src: "bloomberg", title: "The unbundling of the all-in-one productivity suite", excerpt: "A wave of focused tools is peeling users away from the giants. Can it last?", tags: [["saas","ai",0.88],["go-to-market","human"]] }),
  art({ cat: "startups", src: "rest", title: "How Southeast Asian super-apps actually make money", excerpt: "Beyond ride-hailing: the financial-services flywheel behind the region's biggest platforms.", tags: [["go-to-market","ai",0.8],["saas","ai",0.55]] }),

  // Finance
  art({ cat: "finance", src: "bloomberg", title: "The boring case for index funds in a hype-driven market", excerpt: "Why the most exciting thing you can do with your portfolio is almost nothing.", tags: [["index-funds","ai",0.96],["fire","human"]], hasAudio: true }),
  art({ cat: "finance", src: "atlantic", title: "FIRE in your 40s: the math nobody puts on Instagram", excerpt: "Sequence-of-returns risk, healthcare, and the unglamorous spreadsheets behind early retirement.", tags: [["fire","ai",0.95],["index-funds","ai",0.7]] }),
  art({ cat: "finance", src: "nyt", title: "A plain-English guide to the new tax brackets", excerpt: "What changed, what didn't, and the three moves worth making before December.", tags: [["taxes","ai",0.97]] }),
  art({ cat: "finance", src: "bloomberg", title: "Is it finally a buyer's housing market?", excerpt: "Inventory, rates, and the regional picture that national headlines keep flattening.", tags: [["housing","ai",0.93],["taxes","human"]] }),

  // Science
  art({ cat: "science", src: "quanta", title: "The telescope that is rewriting the early universe", excerpt: "Galaxies too big, too soon: what the latest deep-field images are forcing cosmologists to reconsider.", tags: [["space","ai",0.95],["physics","ai",0.8]], hasAudio: true }),
  art({ cat: "science", src: "nautilus", title: "The cell's recycling system might hold the key to aging", excerpt: "Autophagy, fasting, and the careful science behind a very hyped idea.", tags: [["biotech","ai",0.92]] }),
  art({ cat: "science", src: "mit", title: "Direct air capture is getting cheaper, slowly", excerpt: "The cost curve that has to bend for carbon removal to matter, and where it stands now.", tags: [["climate","ai",0.94],["biotech","human"]] }),
  art({ cat: "science", src: "quanta", title: "A new proof settles a 40-year-old question about prime gaps", excerpt: "The elegant argument behind a result mathematicians had nearly given up on.", tags: [["physics","ai",0.86]] }),
];

// Processing queue (pipeline). Stages: fetch → render → extract → embed → index
const PROC_STAGES = ["fetch", "render", "extract", "embed", "index"];
const PROC_JOBS = [
  { id: "j-8841", url: "https://www.theverge.com/2026/6/5/agentic-web-distribution", src: "verge", stage: 5, state: "done", t: "12s ago", title: "The Agentic Web and the End of the App Store" },
  { id: "j-8840", url: "https://stratechery.com/2026/ai-native-saas-pricing", src: "strat", stage: 4, state: "active", t: "now", title: "The new playbook for AI-native SaaS pricing" },
  { id: "j-8839", url: "https://arstechnica.com/gadgets/2026/home-ai-workstation-build", src: "ars", stage: 3, state: "active", t: "now", title: "Building a quiet, powerful home AI workstation" },
  { id: "j-8838", url: "https://hbr.org/2026/06/salary-negotiation-script", src: "hbr", stage: 5, state: "done", t: "1m ago", title: "The salary negotiation script that actually works" },
  { id: "j-8837", url: "https://www.bloomberg.com/news/2026-06-04/buyers-housing-market", src: "bloomberg", stage: 2, state: "active", t: "now", title: "Is it finally a buyer's housing market?" },
  { id: "j-8836", url: "https://paywalled.example.com/the-quiet-return-to-office", src: "atlantic", stage: 2, state: "err", t: "3m ago", title: "(extraction failed)", error: "RENDER_TIMEOUT — page did not reach networkidle within 30s. Likely a paywall interstitial or infinite-scroll loader blocking the snapshot." },
  { id: "j-8835", url: "https://quantamagazine.org/2026/prime-gaps-proof", src: "quanta", stage: 5, state: "done", t: "5m ago", title: "A new proof settles a 40-year-old question" },
  { id: "j-8834", url: "https://broken.link/article-404", src: "nyt", stage: 1, state: "err", t: "6m ago", title: "(fetch failed)", error: "HTTP_404 — origin returned Not Found. URL may have expired or been mistyped from the share-sheet paste." },
  { id: "j-8833", url: "https://www.wired.com/story/gpu-supply-chain-2026", src: "wired", stage: 5, state: "done", t: "8m ago", title: "GPUs are the new oil" },
  { id: "j-8832", url: "https://a16z.com/open-weights-closed-moats", src: "a16z", stage: 4, state: "active", t: "now", title: "Open weights, closed moats" },
  { id: "j-8831", url: "https://www.technologyreview.com/2026/rag-grew-up", src: "mit", stage: 5, state: "done", t: "11m ago", title: "RAG is not dead, it just grew up" },
  { id: "j-8830", url: "https://nautil.us/the-cells-recycling-system", src: "nautilus", stage: 3, state: "err", t: "14m ago", title: "(embedding failed)", error: "EMBED_429 — Vectorize rate limit hit during batch upsert. Job re-queued with backoff; will retry automatically in ~60s." },
];

// Saved views — include facets (each with any/all match) + exclude facets (none-of).
function mkView(o) {
  return Object.assign({
    include: { tags: { match: "any", items: [] }, keywords: { match: "any", items: [] }, domains: { match: "any", items: [] } },
    exclude: { tags: [], keywords: [] },
    deleted: false,
  }, o);
}
const SAVED_VIEWS = [
  mkView({ id: "v-int", name: "Interview prep", hue: 150,
    include: { tags: { match: "any", items: ["interviewing", "negotiation", "resume"] }, keywords: { match: "any", items: ["offer", "STAR method"] }, domains: { match: "any", items: ["hbr.org"] } },
    exclude: { tags: ["remote-work"], keywords: ["layoffs"] } }),
  mkView({ id: "v-pc", name: "PC build research", hue: 200,
    include: { tags: { match: "any", items: ["build-a-pc", "gpu", "laptops"] }, keywords: { match: "any", items: ["thermals", "benchmark"] }, domains: { match: "any", items: ["arstechnica.com", "theverge.com"] } },
    exclude: { tags: [], keywords: ["rumor"] } }),
  mkView({ id: "v-money", name: "Money basics", hue: 95,
    include: { tags: { match: "any", items: ["index-funds", "fire", "taxes"] }, keywords: { match: "any", items: [] }, domains: { match: "any", items: ["bloomberg.com"] } },
    exclude: { tags: [], keywords: ["crypto"] } }),
  mkView({ id: "v-trends", name: "Consumer tech trends", hue: 30, deleted: true,
    include: { tags: { match: "all", items: ["reviews", "apple-silicon"] }, keywords: { match: "any", items: ["shopping list"] }, domains: { match: "any", items: [] } },
    exclude: { tags: [], keywords: [] } }),
];

// Notification center mock feed.
const NOTIFICATIONS = [
  { id: "n1", type: "digest", title: "142 articles archived today", body: "+18 in the last hour across all 6 desks.", t: "just now", when: "today", read: false },
  { id: "n2", type: "success", title: "Archived · The Agentic Web and the End of the App Store", body: "Rendered, tagged, embedded and indexed in 7.2s.", t: "2m ago", when: "today", read: false, articleId: 1001 },
  { id: "n3", type: "error", title: "Render failed · paywalled.example.com", body: "RENDER_TIMEOUT after 30s — likely a paywall interstitial. Retry available.", t: "3m ago", when: "today", read: false, job: "j-8836" },
  { id: "n4", type: "review", title: "3 low-confidence tags need review", body: "AI applied tags below your 70% threshold on “Open weights, closed moats.”", t: "9m ago", when: "today", read: false, articleId: 1004 },
  { id: "n5", type: "batch", title: "Batch accepted · 12 links", body: "A share-sheet dump from Chrome on iOS is being processed.", t: "14m ago", when: "today", read: true },
  { id: "n6", type: "retry", title: "Recovered · The cell's recycling system", body: "Re-queued after a Vectorize rate limit (EMBED_429), now indexed.", t: "22m ago", when: "today", read: true, articleId: 1027 },
  { id: "n7", type: "error", title: "Fetch failed · broken.link", body: "HTTP 404 — the URL may have expired or been mistyped from the paste.", t: "1h ago", when: "earlier", read: true, job: "j-8834" },
  { id: "n8", type: "success", title: "Archived · The 2026 laptop buyer's guide", body: "Captured and indexed. Narration is also ready to play.", t: "3h ago", when: "earlier", read: true, articleId: 1007 },
  { id: "n9", type: "digest", title: "Weekly recap · 318 archived, 7 failed", body: "Your archive grew 11% this week. Career & Interviewing was the busiest desk.", t: "2d ago", when: "earlier", read: true },
];

// Workers AI — models auto-detected from the binding (read-only in the UI).
const WORKERS_AI = {
  summary:   { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B Instruct", task: "Tagging & summary" },
  embedding: { id: "@cf/baai/bge-m3", label: "BGE-M3", task: "Vectorize embeddings", dims: 1024 },
  vision:    { id: "@cf/meta/llama-3.2-11b-vision-instruct", label: "Llama 3.2 11B Vision", task: "Screenshot OCR" },
  audio:     { id: "@cf/deepgram/aura-2-en", label: "Deepgram Aura-2", task: "Narration (TTS)" },
};

// AI Gateway provider options (when routing is enabled).
const GATEWAY_PROVIDERS = [
  { id: "workers-ai", label: "Workers AI", note: "Cloudflare-native, no key" },
  { id: "openai", label: "OpenAI", note: "gpt-4o, gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", note: "Claude 3.5 / 3.7" },
  { id: "google", label: "Google AI Studio", note: "Gemini 2.0" },
  { id: "groq", label: "Groq", note: "fast inference" },
];

// Deepgram Aura-2 (en) voice catalog, grouped by timbre.
const AURA_VOICES = {
  feminine: [
    { name: "amalthea", age: "Young Adult", accent: "Filipino", lang: "en-PH", characteristics: ["Engaging", "Natural", "Cheerful"], use_cases: ["Casual chat"] },
    { name: "andromeda", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Casual", "Expressive", "Comfortable"], use_cases: ["Customer service", "IVR"] },
    { name: "asteria", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Clear", "Confident", "Knowledgeable", "Energetic"], use_cases: ["Advertising"] },
    { name: "athena", age: "Mature", accent: "American", lang: "en-US", characteristics: ["Calm", "Smooth", "Professional"], use_cases: ["Storytelling"] },
    { name: "aurora", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Cheerful", "Expressive", "Energetic"], use_cases: ["Interview"] },
    { name: "callista", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Clear", "Energetic", "Professional", "Smooth"], use_cases: ["IVR"] },
    { name: "cora", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Smooth", "Melodic", "Caring"], use_cases: ["Storytelling"] },
    { name: "cordelia", age: "Young Adult", accent: "American", lang: "en-US", characteristics: ["Approachable", "Warm", "Polite"], use_cases: ["Storytelling"] },
    { name: "delia", age: "Young Adult", accent: "American", lang: "en-US", characteristics: ["Casual", "Friendly", "Cheerful", "Breathy"], use_cases: ["Interview"] },
    { name: "electra", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Professional", "Engaging", "Knowledgeable"], use_cases: ["IVR", "Advertising", "Customer service"] },
    { name: "harmonia", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Empathetic", "Clear", "Calm", "Confident"], use_cases: ["Customer service"] },
    { name: "helena", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Caring", "Natural", "Positive", "Friendly", "Raspy"], use_cases: ["IVR", "Casual chat"] },
    { name: "hera", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Smooth", "Warm", "Professional"], use_cases: ["Informative"] },
    { name: "iris", age: "Young Adult", accent: "American", lang: "en-US", characteristics: ["Cheerful", "Positive", "Approachable"], use_cases: ["IVR", "Advertising", "Customer service"] },
    { name: "janus", age: "Adult", accent: "Southern American", lang: "en-US", characteristics: ["Southern", "Smooth", "Trustworthy"], use_cases: ["Storytelling"] },
    { name: "juno", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Natural", "Engaging", "Melodic", "Breathy"], use_cases: ["Interview"] },
    { name: "luna", age: "Young Adult", accent: "American", lang: "en-US", characteristics: ["Friendly", "Natural", "Engaging"], use_cases: ["IVR"] },
    { name: "minerva", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Positive", "Friendly", "Natural"], use_cases: ["Storytelling"] },
    { name: "ophelia", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Expressive", "Enthusiastic", "Cheerful"], use_cases: ["Interview"] },
    { name: "pandora", age: "Adult", accent: "British", lang: "en-GB", characteristics: ["Smooth", "Calm", "Melodic", "Breathy"], use_cases: ["IVR", "Informative"] },
    { name: "phoebe", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Energetic", "Warm", "Casual"], use_cases: ["Customer service"] },
    { name: "thalia", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Clear", "Confident", "Energetic", "Enthusiastic"], use_cases: ["Casual chat", "Customer service", "IVR"] },
    { name: "theia", age: "Adult", accent: "Australian", lang: "en-AU", characteristics: ["Expressive", "Polite", "Sincere"], use_cases: ["Informative"] },
    { name: "vesta", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Natural", "Expressive", "Patient", "Empathetic"], use_cases: ["Customer service", "Interview", "Storytelling"] },
  ],
  masculine: [
    { name: "apollo", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Confident", "Comfortable", "Casual"], use_cases: ["Casual chat"] },
    { name: "arcas", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Natural", "Smooth", "Clear", "Comfortable"], use_cases: ["Customer service", "Casual chat"] },
    { name: "aries", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Warm", "Energetic", "Caring"], use_cases: ["Casual chat"] },
    { name: "atlas", age: "Mature", accent: "American", lang: "en-US", characteristics: ["Enthusiastic", "Confident", "Approachable", "Friendly"], use_cases: ["Advertising"] },
    { name: "draco", age: "Adult", accent: "British", lang: "en-GB", characteristics: ["Warm", "Approachable", "Trustworthy", "Baritone"], use_cases: ["Storytelling"] },
    { name: "hermes", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Expressive", "Engaging", "Professional"], use_cases: ["Informative"] },
    { name: "hyperion", age: "Adult", accent: "Australian", lang: "en-AU", characteristics: ["Caring", "Warm", "Empathetic"], use_cases: ["Interview"] },
    { name: "jupiter", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Expressive", "Knowledgeable", "Baritone"], use_cases: ["Informative"] },
    { name: "mars", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Smooth", "Patient", "Trustworthy", "Baritone"], use_cases: ["Customer service"] },
    { name: "neptune", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Professional", "Patient", "Polite"], use_cases: ["Customer service"] },
    { name: "odysseus", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Calm", "Smooth", "Comfortable", "Professional"], use_cases: ["Advertising"] },
    { name: "orion", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Approachable", "Comfortable", "Calm", "Polite"], use_cases: ["Informative"] },
    { name: "orpheus", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Professional", "Clear", "Confident", "Trustworthy"], use_cases: ["Customer service", "Storytelling"] },
    { name: "pluto", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Smooth", "Calm", "Empathetic", "Baritone"], use_cases: ["Interview", "Storytelling"] },
    { name: "saturn", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Knowledgeable", "Confident", "Baritone"], use_cases: ["Customer service"] },
    { name: "zeus", age: "Adult", accent: "American", lang: "en-US", characteristics: ["Deep", "Trustworthy", "Smooth"], use_cases: ["IVR"] },
  ],
};

Object.assign(window, { SOURCES, CATEGORIES, TAGS, ARTICLES, PROC_STAGES, PROC_JOBS, SAVED_VIEWS, NOTIFICATIONS, WORKERS_AI, GATEWAY_PROVIDERS, AURA_VOICES });
