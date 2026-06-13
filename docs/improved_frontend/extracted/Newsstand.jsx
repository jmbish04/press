/* global React, Icon, Button, Tag, PageRender, window, ARTICLES, CATEGORIES, SOURCES, TAGS, catHue */
const { useState: useStateN, useMemo: useMemoN } = React;

function ArticleCard({ a, onOpen }) {
  const s = SOURCES[a.src];
  return (
    <div className="acard" onClick={() => onOpen(a)}>
      <div className="thumb">
        <PageRender srcId={a.src} title={a.title} headSize={11} lines={4} />
        <span className="src-tab">{s.name}</span>
      </div>
      <div className="ameta">
        <div className="atitle">{a.title}</div>
        <div className="asub">
          <Icon name="clock" size={11} />{a.readMins} min
          {a.hasAudio && <><span style={{ opacity: .4 }}>·</span><Icon name="volume" size={11} /></>}
        </div>
      </div>
    </div>
  );
}

function CategoryRow({ cat, articles, onOpen, paused }) {
  if (!articles.length) return null;
  // duplicate the list so the marquee loops seamlessly (translateX -50%)
  const loop = articles.length >= 4 ? [...articles, ...articles] : articles;
  const animate = articles.length >= 4;
  return (
    <section className="cat-row">
      <div className="cat-row-head">
        <span className="cat-dot" style={{ "--cat-h": cat.hue }}></span>
        <span className="cat-name">{cat.name}</span>
        <span className="cat-count">{articles.length}</span>
        <button className="cat-more">Browse all <Icon name="chevronR" size={13} /></button>
      </div>
      <div className="rail-scroll" data-paused={paused}>
        <div className="rail-track" style={{ "--dur": cat.dur + "s", animation: animate ? undefined : "none", width: animate ? undefined : "100%" }}>
          {loop.map((a, i) => <ArticleCard key={a.id + "-" + i} a={a} onOpen={onOpen} />)}
        </div>
      </div>
    </section>
  );
}

function Newsstand({ onOpen, initialTags }) {
  const [q, setQ] = useStateN("");
  const [activeTags, setActiveTags] = useStateN(initialTags && initialTags.length ? initialTags : []);
  const [view, setView] = useStateN("stand"); // stand | grid
  const [paused, setPaused] = useStateN(false);

  // popular tags for the filter bar
  const tagCounts = useMemoN(() => {
    const m = {};
    ARTICLES.forEach(a => a.tags.forEach(([id]) => { m[id] = (m[id] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([id]) => id);
  }, []);

  const filtered = useMemoN(() => {
    const ql = q.trim().toLowerCase();
    return ARTICLES.filter(a => {
      if (activeTags.length && !activeTags.every(t => a.tags.some(([id]) => id === t))) return false;
      if (ql) {
        const hay = (a.title + " " + a.excerpt + " " + SOURCES[a.src].name + " " + a.tags.map(([id]) => TAGS[id]?.label).join(" ")).toLowerCase();
        if (!hay.includes(ql)) return false;
      }
      return true;
    });
  }, [q, activeTags]);

  const searching = q.trim() || activeTags.length;

  function toggleTag(t) {
    setActiveTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  return (
    <div className="page">
      <div className="stand-head">
        <div>
          <div className="stand-title">The Newsstand</div>
          <div className="stand-sub">{ARTICLES.length} captured articles across {CATEGORIES.length} desks · updated just now</div>
        </div>
        <div className="seg">
          <button className={view === "stand" ? "active" : ""} onClick={() => setView("stand")}><Icon name="stand" size={14} />Stand</button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><Icon name="grid" size={14} />Grid</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="grow search-wrap">
          <Icon name="search" size={15} />
          <input className="input" placeholder="Search titles, sources, summaries…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {view === "stand" && (
          <Button variant="outline" size="sm" onClick={() => setPaused(p => !p)}>
            <Icon name={paused ? "play" : "pause"} size={14} />{paused ? "Play rows" : "Pause rows"}
          </Button>
        )}
      </div>

      <div className="filterbar">
        <Icon name="filter" size={14} style={{ color: "var(--muted-foreground)" }} />
        {tagCounts.map(t => (
          <button key={t} className={`chip tagchip ${activeTags.includes(t) ? "on" : ""}`} style={{ "--tag-h": TAGS[t]?.hue }} onClick={() => toggleTag(t)}>
            <span className="dot" style={{ background: `oklch(0.7 0.16 ${TAGS[t]?.hue})` }}></span>
            {TAGS[t]?.label}
          </button>
        ))}
        {activeTags.length > 0 && <button className="chip" onClick={() => setActiveTags([])}><Icon name="x" size={12} />Clear</button>}
      </div>

      {/* RESULTS */}
      {searching ? (
        <>
          <div className="muted" style={{ margin: "18px 0 4px", fontSize: 13 }}>
            {filtered.length} {filtered.length === 1 ? "result" : "results"}{q.trim() && <> for “{q.trim()}”</>}
          </div>
          {filtered.length === 0 ? (
            <div style={{ padding: "60px 0", textAlign: "center" }} className="muted">
              <Icon name="search" size={26} style={{ opacity: .4 }} />
              <div style={{ marginTop: 12 }}>Nothing in the archive matches that yet.</div>
            </div>
          ) : (
            <div className="grid-view">
              {filtered.map(a => <ArticleCard key={a.id} a={a} onOpen={onOpen} />)}
            </div>
          )}
        </>
      ) : view === "grid" ? (
        <div className="grid-view">
          {ARTICLES.map(a => <ArticleCard key={a.id} a={a} onOpen={onOpen} />)}
        </div>
      ) : (
        CATEGORIES.map(cat => (
          <CategoryRow key={cat.id} cat={cat} paused={paused}
            articles={ARTICLES.filter(a => a.cat === cat.id)} onOpen={onOpen} />
        ))
      )}
    </div>
  );
}

Object.assign(window, { Newsstand, ArticleCard });
