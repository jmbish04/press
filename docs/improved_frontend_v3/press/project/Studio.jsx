/* global React, Icon, Button, Mindmap, window, ARTICLES */
const { useState: useStateST, useMemo: useMemoST } = React;

/* ============================ mock shadcn PWAs (phone screens) ============================ */
function PwaChrome({ title, children, tabs, tab, setTab }) {
  return (
    <div className="pwa-app">
      <div className="pwa-statusbar"><span>9:41</span><span style={{ display: "flex", gap: 5, alignItems: "center" }}><Icon name="zap" size={11} /><Icon name="volume" size={11} /></span></div>
      <div className="pwa-appbar">{title}</div>
      <div className="pwa-screen">{children}</div>
      {tabs && (
        <div className="pwa-tabbar">
          {tabs.map(t => <button key={t.id} className={`pwa-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}><Icon name={t.icon} size={18} />{t.label}</button>)}
        </div>
      )}
    </div>
  );
}

function InterviewCoachApp() {
  const [tab, setTab] = useStateST("cards");
  const [flipped, setFlipped] = useStateST(false);
  const [idx, setIdx] = useStateST(0);
  const cards = [
    { q: "Tell me about yourself.", a: "Use a 3-part arc: present role → relevant past → why this team. Keep it to 90 seconds." },
    { q: "What's your greatest weakness?", a: "Name a real one, then the concrete system you've built to manage it. Avoid humble-brags." },
    { q: "Why do you want this role?", a: "Tie their roadmap to a specific skill you bring. Show you've read beyond the job post." },
  ];
  const c = cards[idx];
  return (
    <PwaChrome title="Interview Coach" tab={tab} setTab={setTab}
      tabs={[{ id: "cards", label: "Cards", icon: "book" }, { id: "mock", label: "Mock", icon: "clock" }, { id: "stats", label: "Progress", icon: "activity" }]}>
      {tab === "cards" && (
        <>
          <div className="pwa-muted" style={{ display: "flex", justifyContent: "space-between" }}><span>Flashcard {idx + 1} of {cards.length}</span><span>interviewing</span></div>
          <div className="pwa-card-flip" onClick={() => setFlipped(f => !f)}>
            <div className="pwa-flip-label">{flipped ? "ANSWER" : "QUESTION"}</div>
            <div className="pwa-flip-text">{flipped ? c.a : c.q}</div>
            <div className="pwa-muted" style={{ marginTop: "auto" }}>Tap to flip</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="pwa-btn ghost" onClick={() => { setIdx(i => (i - 1 + cards.length) % cards.length); setFlipped(false); }}>Prev</button>
            <button className="pwa-btn" onClick={() => { setIdx(i => (i + 1) % cards.length); setFlipped(false); }}>Next card</button>
          </div>
        </>
      )}
      {tab === "mock" && (
        <div style={{ textAlign: "center", paddingTop: 20 }}>
          <div className="pwa-timer">04:32</div>
          <div className="pwa-muted" style={{ marginBottom: 18 }}>Mock interview · question 2 of 6</div>
          <div className="pwa-prompt-box">“Describe a time you handled conflicting priorities.”</div>
          <button className="pwa-btn" style={{ marginTop: 16 }}><Icon name="mic" size={15} />Record answer</button>
        </div>
      )}
      {tab === "stats" && (
        <>
          <div className="pwa-stat-row"><div className="pwa-stat"><div className="v">18</div><div className="l">cards reviewed</div></div><div className="pwa-stat"><div className="v">3</div><div className="l">mock sessions</div></div></div>
          {["Behavioral", "System design", "Negotiation"].map((s, i) => (
            <div key={s} className="pwa-progress-row"><span>{s}</span><div className="pwa-bar"><i style={{ width: [80, 55, 35][i] + "%" }}></i></div></div>
          ))}
        </>
      )}
    </PwaChrome>
  );
}

function PcBuilderApp() {
  const [budget, setBudget] = useStateST(2500);
  const parts = [
    { p: "CPU", n: "Ryzen 9 7900 · 12-core", price: 380 },
    { p: "GPU", n: "RTX 4070 Ti · 16GB", price: 820 },
    { p: "RAM", n: "64GB DDR5-6000", price: 190 },
    { p: "Storage", n: "2TB NVMe Gen4", price: 150 },
    { p: "Cooler", n: "Noctua NH-D15 (quiet)", price: 110 },
  ];
  const total = parts.reduce((s, x) => s + x.price, 0);
  return (
    <PwaChrome title="PC Builder">
      <div className="pwa-muted">Target · local AI inference</div>
      <div className="pwa-budget">
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}><span className="pwa-muted">Budget</span><span style={{ fontWeight: 700 }}>${budget.toLocaleString()}</span></div>
        <input type="range" min="1200" max="4000" step="100" value={budget} onChange={e => setBudget(+e.target.value)} style={{ width: "100%", accentColor: "var(--brand)" }} />
      </div>
      {parts.map(x => (
        <div key={x.p} className="pwa-part"><div><div className="pwa-muted" style={{ fontSize: 10 }}>{x.p}</div><div style={{ fontSize: 12.5, fontWeight: 500 }}>{x.n}</div></div><div style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>${x.price}</div></div>
      ))}
      <div className="pwa-total"><span>Recommended total</span><span style={{ color: total <= budget ? "var(--ok)" : "var(--err)" }}>${total.toLocaleString()}</span></div>
      <button className="pwa-btn"><Icon name="check" size={15} />Save build</button>
    </PwaChrome>
  );
}

function GeneratedApp({ prompt }) {
  return (
    <PwaChrome title={(prompt || "App").slice(0, 22)}>
      <div className="pwa-muted">Generated from your notebook</div>
      <div className="pwa-stat-row">
        <div className="pwa-stat"><div className="v">12</div><div className="l">insights</div></div>
        <div className="pwa-stat"><div className="v">4</div><div className="l">sources</div></div>
      </div>
      {["Key idea one from your sources", "A second synthesised point", "Something to act on", "An open question to revisit"].map((t, i) => (
        <div key={i} className="pwa-list-item"><span className="pwa-bullet" style={{ background: `oklch(0.7 0.16 ${[265, 200, 150, 30][i]})` }}></span>{t}</div>
      ))}
      <button className="pwa-btn"><Icon name="arrowRight" size={15} />Explore</button>
    </PwaChrome>
  );
}

function PwaRender({ a }) {
  if (a.app === "interview-coach") return <InterviewCoachApp />;
  if (a.app === "pc-builder") return <PcBuilderApp />;
  return <GeneratedApp prompt={a.prompt} />;
}

/* ============================ gallery card previews ============================ */
function MiniMindmap({ tree }) {
  const hue = tree.hue != null ? tree.hue : 35;
  const branches = (tree.children || []).slice(0, 4);
  return (
    <div className="mini-mm">
      <svg viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
        {branches.map((b, i) => {
          const y = 18 + i * 28;
          return <g key={i}>
            <path d={`M70,60 C100,60 100,${y} 130,${y}`} fill="none" stroke={`oklch(0.6 0.1 ${hue} / 0.5)`} strokeWidth="1.5" />
            <rect x="130" y={y - 8} width="60" height="16" rx="4" fill={`oklch(0.3 0.04 ${hue})`} stroke={`oklch(0.6 0.12 ${hue} / 0.4)`} />
          </g>;
        })}
        <rect x="14" y="48" width="58" height="24" rx="6" fill={`oklch(0.64 0.19 ${hue})`} />
      </svg>
    </div>
  );
}

/* ============================ studio shell ============================ */
function Studio({ artifacts, setArtifacts, onGenerate, openId, clearOpen }) {
  const [filter, setFilter] = useStateST("all"); // all | mindmap | pwa
  const [viewing, setViewing] = useStateST(null);

  React.useEffect(() => {
    if (openId) { const a = artifacts.find(x => x.id === openId); if (a) setViewing(a); clearOpen && clearOpen(); }
  }, [openId]);

  const shown = artifacts.filter(a => filter === "all" || a.type === filter);
  const counts = { all: artifacts.length, mindmap: artifacts.filter(a => a.type === "mindmap").length, pwa: artifacts.filter(a => a.type === "pwa").length };

  return (
    <div className="page">
      <div className="stand-head" style={{ marginBottom: 12 }}>
        <div>
          <div className="stand-title" style={{ fontSize: 26 }}>Studio</div>
          <div className="stand-sub">Visual artifacts the agent built — mind maps and shadcn PWAs, deployed to dynamic workers, saved to R2 and indexed in D1.</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="outline" size="sm" onClick={() => onGenerate("mindmap", "the whole archive")}><Icon name="share" size={14} />New mind map</Button>
          <Button variant="brand" size="sm" onClick={() => onGenerate("pwa", "the whole archive")}><Icon name="sparkles" size={14} />Build a PWA</Button>
        </div>
      </div>

      <div className="filterbar" style={{ marginBottom: 4 }}>
        {[["all", "All"], ["mindmap", "Mind maps"], ["pwa", "PWAs"]].map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? "on" : ""}`} onClick={() => setFilter(id)}>{label} <span style={{ opacity: .6, fontFamily: "var(--font-mono)", fontSize: 11 }}>{counts[id]}</span></button>
        ))}
      </div>

      <div className="studio-grid">
        {shown.map(a => (
          <div key={a.id} className="studio-card" onClick={() => setViewing(a)}>
            <div className="studio-preview">
              {a.type === "mindmap" ? <MiniMindmap tree={a.tree} /> : (
                <div className="studio-pwa-thumb"><div className="pwa-frame mini"><PwaRender a={a} /></div></div>
              )}
              <span className="studio-type">{a.type === "mindmap" ? <><Icon name="share" size={11} />Mind map</> : <><Icon name="phone" size={11} />PWA</>}</span>
            </div>
            <div className="studio-meta">
              <div className="studio-title">{a.title}</div>
              <div className="studio-sub"><Icon name="layers" size={11} />{a.source}<span style={{ opacity: .4 }}>·</span>{a.date}</div>
              <div className="studio-store"><span className="store-pill"><Icon name="download" size={10} />R2</span><span className="store-pill"><Icon name="activity" size={10} />D1 indexed</span></div>
            </div>
          </div>
        ))}
        {shown.length === 0 && <div className="muted" style={{ gridColumn: "1/-1", textAlign: "center", padding: "50px 0" }}><Icon name="studio" size={26} style={{ opacity: .4 }} /><div style={{ marginTop: 10 }}>No artifacts yet — generate one above.</div></div>}
      </div>

      {viewing && <ArtifactViewer a={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ArtifactViewer({ a, onClose }) {
  return (
    <div className="art-viewer">
      <div className="art-vhead">
        <button className="icon-btn" onClick={onClose}><Icon name="chevron" size={16} style={{ transform: "rotate(90deg)" }} /></button>
        <span className="art-vtype" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>{a.type === "mindmap" ? <><Icon name="share" size={12} />Mind map</> : <><Icon name="phone" size={12} />PWA</>}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ font: "600 15px/1.1 var(--font-heading)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
          <div className="hint" style={{ marginTop: 2 }}>{a.source} · {a.date}</div>
        </div>
        <div style={{ flex: 1 }}></div>
        <span className="store-pill"><Icon name="download" size={10} />R2</span>
        <span className="store-pill"><Icon name="activity" size={10} />D1</span>
        {a.type === "pwa" && <Button variant="outline" size="sm"><Icon name="ext" size={13} />Open worker</Button>}
      </div>
      <div className="art-vbody">
        {a.type === "mindmap" ? (
          <div style={{ width: "100%", height: "100%" }}><Mindmap tree={a.tree} /></div>
        ) : (
          <div className="art-pwa-stage">
            <div className="pwa-frame"><PwaRender a={a} /></div>
            <div className="art-iterate">
              <div style={{ font: "600 13px/1.2 var(--font-sans)", marginBottom: 6 }}>Keep iterating</div>
              <div className="hint" style={{ marginBottom: 12 }}>Describe a change and the agent rebuilds the app, versioning each deploy in R2.</div>
              <div className="asst-input" style={{ background: "var(--card)" }}>
                <textarea rows={1} placeholder="e.g. add a dark/light toggle and a streak counter…" style={{ flex: 1, background: "none", border: "none", outline: "none", color: "var(--foreground)", resize: "none", font: "400 13px/1.4 var(--font-sans)" }}></textarea>
                <button className="asst-send"><Icon name="send" size={14} /></button>
              </div>
              <div style={{ marginTop: 14, font: "500 11px/1 var(--font-mono)", textTransform: "uppercase", letterSpacing: ".06em", color: "var(--muted-foreground)" }}>Version history</div>
              {["v3 · added flashcards", "v2 · timer + progress", "v1 · initial build"].map((v, i) => (
                <div key={i} className="art-version"><span className="dot" style={{ background: i === 0 ? "var(--brand)" : "var(--muted-foreground)" }}></span>{v}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { Studio, ArtifactViewer, PwaRender });
