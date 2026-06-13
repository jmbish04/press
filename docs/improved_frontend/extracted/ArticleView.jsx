/* global React, Icon, Button, Tag, PageRender, window, SOURCES, TAGS, useClickOutside, catHue */
const { useState: useStateV, useRef: useRefV, useEffect: useEffectV, useMemo: useMemoV } = React;

/* ---------------- Tag editor (combobox multiselect + create new) ---------------- */
function TagEditor({ tags, onChange, hue }) {
  const [open, setOpen] = useStateV(false);
  const [query, setQuery] = useStateV("");
  const ref = useRefV(null);
  useClickOutside(ref, () => setOpen(false));

  const have = new Set(tags.map(t => t[0]));
  const all = Object.keys(TAGS);
  const matches = all.filter(id => TAGS[id].label.toLowerCase().includes(query.toLowerCase()) && !have.has(id));
  const exact = all.some(id => TAGS[id].label.toLowerCase() === query.trim().toLowerCase());
  const canCreate = query.trim().length > 1 && !exact;

  function add(id) { onChange([...tags, [id, "human"]]); setQuery(""); }
  function create() {
    const id = query.trim().toLowerCase().replace(/\s+/g, "-");
    if (!TAGS[id]) TAGS[id] = { label: query.trim(), hue: hue };
    add(id);
  }
  function remove(id) { onChange(tags.filter(t => t[0] !== id)); }

  return (
    <div className="av-block">
      <div className="av-block-h"><span>Tags</span><span className="muted" style={{ textTransform: "none", letterSpacing: 0, fontFamily: "var(--font-sans)" }}>{tags.length}</span></div>
      <div className="tag-cloud">
        {tags.map(([id, origin, conf]) => (
          <Tag key={id} id={id} origin={origin} conf={conf} removable onRemove={remove} />
        ))}
      </div>
      <div className="combo" ref={ref}>
        <button className="combo-trigger" onClick={() => setOpen(o => !o)}>
          <Icon name="plus" size={14} /> Add or create a tag
        </button>
        {open && (
          <div className="combo-pop">
            <input className="combo-search" autoFocus placeholder="Search or create…" value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canCreate && matches.length === 0) create(); }} />
            {matches.map(id => (
              <div key={id} className="combo-opt" onClick={() => add(id)}>
                <span className="dot" style={{ background: `oklch(0.7 0.16 ${TAGS[id].hue})` }}></span>
                {TAGS[id].label}
              </div>
            ))}
            {matches.length === 0 && !canCreate && <div className="combo-opt muted" style={{ cursor: "default" }}>No matches</div>}
            {canCreate && (
              <div className="combo-create" onClick={create}>
                <Icon name="plus" size={14} /> Create “{query.trim()}”
              </div>
            )}
          </div>
        )}
      </div>
      <div className="muted" style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 12, marginTop: 2 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 16, height: 0, borderTop: "1.5px dashed var(--muted-foreground)" }}></span>AI-applied</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 16, height: 0, borderTop: "1.5px solid var(--muted-foreground)" }}></span>Manual</span>
      </div>
    </div>
  );
}

/* ---------------- Audio generation ---------------- */
function AudioBlock({ article }) {
  const [state, setState] = useStateV(article.hasAudio ? "ready" : "idle"); // idle | generating | ready
  const [progress, setProgress] = useStateV(0);
  const [playing, setPlaying] = useStateV(false);
  const timer = useRefV(null);

  function generate() {
    setState("generating");
    let p = 0;
    timer.current = setInterval(() => {
      p += 8 + Math.random() * 10;
      if (p >= 100) { clearInterval(timer.current); setState("ready"); setProgress(0); }
      else setProgress(p);
    }, 220);
  }
  useEffectV(() => () => clearInterval(timer.current), []);
  const total = `${article.readMins}:${String((article.id * 7) % 60).padStart(2, "0")}`;

  if (state === "idle")
    return (
      <div className="av-block">
        <div className="av-block-h">Listen</div>
        <div className="audio">
          <div className="audio-gen">
            <div style={{ width: 38, height: 38, borderRadius: 999, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Icon name="volume" size={17} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "500 13px/1.2 var(--font-sans)" }}>Generate narration</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>Workers AI text-to-speech · ~{article.readMins} min</div>
            </div>
            <Button variant="brand" size="sm" onClick={generate}><Icon name="sparkles" size={13} />Generate</Button>
          </div>
        </div>
      </div>
    );

  if (state === "generating")
    return (
      <div className="av-block">
        <div className="av-block-h">Listen</div>
        <div className="audio">
          <div className="audio-gen">
            <Icon name="refresh" size={16} style={{ animation: "spin 1s linear infinite", color: "var(--brand)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ font: "500 13px/1.2 var(--font-sans)" }}>Synthesising audio…</div>
              <div className="audio-bar" style={{ marginTop: 8 }}><i style={{ width: progress + "%" }}></i></div>
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="av-block">
      <div className="av-block-h">Listen</div>
      <div className="audio">
        <div className="audio-row">
          <button className="audio-play" onClick={() => setPlaying(p => !p)}><Icon name={playing ? "pause" : "play"} size={16} /></button>
          <div className="audio-prog">
            <div className="audio-bar"><i style={{ width: playing ? "34%" : "0%", transition: "width .4s" }}></i></div>
            <div className="audio-time"><span>{playing ? "1:12" : "0:00"}</span><span>{total}</span></div>
          </div>
          <Button variant="ghost" size="icon-sm"><Icon name="download" size={15} /></Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Document surfaces ---------------- */
function ReaderView({ a }) {
  const s = SOURCES[a.src];
  return (
    <div className="reader">
      <div className="kicker">{s.name}</div>
      <h1>{a.title}</h1>
      <div className="byline">
        <span>By a staff writer</span><span style={{ opacity: .4 }}>·</span>
        <span>{a.date}</span><span style={{ opacity: .4 }}>·</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="clock" size={13} />{a.readMins} min read</span>
      </div>
      <p className="lede">{a.excerpt}</p>
      <p>The story opens where most of these do: with a quiet observation that the ground has already shifted while everyone was looking somewhere else. What follows is an attempt to take that shift seriously, and to ask what it means for the people who have to live and work inside it.</p>
      <div className="figure">
        <div className="img" style={{ "--fig-a": s.accent, "--fig-b": "#1a1a1a" }}></div>
        <figcaption>Figure 1 — captured from the original page during rendering.</figcaption>
      </div>
      <h2>Why this matters now</h2>
      <p>There is a temptation to treat every development as either a revolution or a nothing-burger. The more useful posture, the piece argues, is to look for the second-order effects — the changes to incentives and defaults that outlast the news cycle.</p>
      <blockquote>“The interesting question is never whether a thing is possible. It is what becomes cheap, and what that cheapness rearranges.”</blockquote>
      <p>From there the argument widens, pulling in adjacent examples and a few counterpoints, before landing on a claim that is modest in tone but large in implication. Whether you agree with the conclusion or not, the framing is the part worth saving — which is, after all, why it lives in your archive.</p>
      <h2>What to do with it</h2>
      <p>Read it once for the shape of the argument, then come back for the section that applies to you. The assistant in the corner can pull the exact passages if you'd rather not re-read the whole thing.</p>
    </div>
  );
}

function ScreenshotView({ a }) {
  return (
    <div className="doc-surface">
      <div style={{ width: "100%", maxWidth: 860 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="image" size={13} /> Full-page render · captured {a.date} · 1280×‎ tall
        </div>
        <div className="shot-frame">
          <PageRender srcId={a.src} title={a.title} headSize={26} lines={14} />
        </div>
      </div>
    </div>
  );
}

function PdfView({ a }) {
  return (
    <div className="doc-surface">
      <div style={{ width: "100%", maxWidth: 760 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="doc" size={13} /> press-archive-{a.id}.pdf · 1 of 4 pages
        </div>
        <div className="pdf-frame">
          <div style={{ padding: "48px 56px", color: "#111", fontFamily: "Georgia, serif" }}>
            <div style={{ fontSize: 10, color: "#999", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 18 }}>{SOURCES[a.src].name} · archived {a.date}</div>
            <div style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginBottom: 16 }}>{a.title}</div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "#333" }}>
              {a.excerpt} {Array.from({ length: 6 }).map((_, i) => <span key={i}>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation. </span>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarkdownView({ a }) {
  const s = SOURCES[a.src];
  const md = `<span class="h"># ${a.title}</span>

> ${a.excerpt}

<span class="muted">**Source:** <span class="u">${s.name}</span> · **Archived:** ${a.date} · **Reading time:** ${a.readMins} min</span>

<span class="h">## Summary</span>

The piece opens with a quiet observation that the ground has already shifted. What follows is an attempt to take that shift seriously.

<span class="h">## Key points</span>

- The core claim is stated plainly in the lede.
- A supporting argument anchors the middle section.
- The practical implication lands at the end.

<span class="h">## Notable quote</span>

> "The interesting question is never whether a thing is possible. It is what becomes cheap, and what that cheapness rearranges."`;
  return (
    <div className="doc-surface">
      <div style={{ width: "100%", maxWidth: 820 }}>
        <div className="muted" style={{ fontSize: 12, marginBottom: 12, display: "flex", alignItems: "center", gap: 8, justifyContent: "space-between" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><Icon name="code" size={13} /> extracted.md</span>
          <Button variant="ghost" size="sm"><Icon name="copy" size={13} />Copy</Button>
        </div>
        <div className="md-frame" dangerouslySetInnerHTML={{ __html: md }} />
      </div>
    </div>
  );
}

/* ---------------- Article view shell ---------------- */
const TABS = [
  { id: "reader", label: "Reader", icon: "type" },
  { id: "shot", label: "Screenshot", icon: "image" },
  { id: "pdf", label: "PDF", icon: "doc" },
  { id: "md", label: "Markdown", icon: "code" },
];

function ArticleView({ article, onBack }) {
  const [tab, setTab] = useStateV("reader");
  const [tags, setTags] = useStateV(article.tags.map(t => [...t]));
  const s = SOURCES[article.src];
  const hue = catHue(article.cat);

  return (
    <div className="av-wrap">
      <div className="av-main">
        <div className="av-tabs">
          <button className="av-tab" onClick={onBack} style={{ color: "var(--muted-foreground)" }}>
            <Icon name="chevron" size={15} style={{ transform: "rotate(90deg)" }} />Back
          </button>
          <div style={{ width: 1, background: "var(--border)", margin: "4px 8px" }}></div>
          {TABS.map(t => (
            <button key={t.id} className={`av-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              <Icon name={t.icon} size={14} />{t.label}
            </button>
          ))}
        </div>
        {tab === "reader" && <ReaderView a={article} />}
        {tab === "shot" && <ScreenshotView a={article} />}
        {tab === "pdf" && <PdfView a={article} />}
        {tab === "md" && <MarkdownView a={article} />}
      </div>

      <aside className="av-side">
        <div className="av-block">
          <div className="av-block-h">Source</div>
          <div className="av-src-card">
            <div className="av-src-logo" style={{ background: s.accent }}>{s.short.slice(0, 1)}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 13px/1.2 var(--font-sans)" }}>{s.name}</div>
              <div className="muted mono" style={{ fontSize: 10.5, marginTop: 3 }}>archived {article.date}</div>
            </div>
          </div>
          <Button variant="outline" size="sm" style={{ width: "100%" }}><Icon name="ext" size={14} />Open original</Button>
        </div>

        <AudioBlock article={article} />

        <TagEditor tags={tags} onChange={setTags} hue={hue} />

        <div className="av-block">
          <div className="av-block-h">Details</div>
          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 14px", fontSize: 12.5 }}>
            <span className="muted">ID</span><span className="mono">#{article.id}</span>
            <span className="muted">Status</span><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="dot" style={{ background: "var(--ok)" }}></span>Archived</span>
            <span className="muted">Reading</span><span>{article.readMins} min</span>
            <span className="muted">Embedded</span><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="check" size={12} style={{ color: "var(--ok)" }} />Vectorize</span>
          </div>
        </div>
      </aside>
    </div>
  );
}

Object.assign(window, { ArticleView, TagEditor, AudioBlock });
