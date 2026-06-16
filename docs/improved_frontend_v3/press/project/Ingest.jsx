/* global React, Icon, Button, window, SOURCES */
const { useState: useStateI, useMemo: useMemoI } = React;

const URL_RE = /https?:\/\/[^\s<>"')]+/gi;

function parseHost(u) {
  try { const x = new URL(u); return { host: x.hostname.replace(/^www\./, ""), path: x.pathname + x.search }; }
  catch { return { host: u, path: "" }; }
}

function Ingest({ go }) {
  const [text, setText] = useStateI("");
  const [focus, setFocus] = useStateI(false);
  const [phase, setPhase] = useStateI("idle"); // idle | submitting | done
  const [results, setResults] = useStateI([]);
  const timeoutsRef = React.useRef([]);

  React.useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
    };
  }, []);

  const urls = useMemoI(() => {
    const m = (text.match(URL_RE) || []).map(s => s.replace(/[.,]+$/, ""));
    return [...new Set(m)];
  }, [text]);

  function submit() {
    if (!urls.length) return;
    setPhase("submitting");
    // simulate the 202 accepted → per-url results trickling in
    const r = urls.map((u, i) => ({ url: u, status: "pending" }));
    setResults(r);
    urls.forEach((u, i) => {
      const tid = setTimeout(() => {
        setResults(prev => prev.map((x, j) => j === i ? {
          ...x,
          status: /paywall|broken|404/.test(u) ? "failed" : (Math.random() < 0.12 ? "skipped" : "archived"),
          title: SAMPLE_TITLES[i % SAMPLE_TITLES.length],
        } : x));
        if (i === urls.length - 1) setPhase("done");
      }, 500 + i * 420);
      timeoutsRef.current.push(tid);
    });
  }

  function reset() { setText(""); setResults([]); setPhase("idle"); }

  const sample = "https://www.theverge.com/2026/agentic-web\nhttps://hbr.org/2026/06/salary-negotiation-script\nhttps://arstechnica.com/gadgets/home-ai-workstation\nhttps://stratechery.com/2026/ai-native-saas-pricing";

  return (
    <div className="page page-narrow">
      <div className="ingest-hero">
        <div className="ingest-eyebrow">Add to archive</div>
        <h1 className="ingest-h">Paste links. We render, read, tag, and remember.</h1>
        <p className="muted" style={{ fontSize: 15, lineHeight: 1.6, maxWidth: 600 }}>
          Drop a single URL or a whole share-sheet dump from Chrome on iOS — line breaks, spaces, junk text, doesn't matter.
          Each page is captured by a headless browser, summarised and tagged with Workers AI, and embedded into Vectorize for search.
        </p>

        {phase !== "done" && (
          <div className={`dropzone ${focus ? "focus" : ""}`} style={{ marginTop: 26 }}>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
              placeholder={"Paste URLs here…\n\n" + sample}
              spellCheck={false}
            />
            <div className="detect-row">
              <Icon name="link" size={15} style={{ color: urls.length ? "var(--brand)" : "var(--muted-foreground)" }} />
              <span className="mono" style={{ fontSize: 12.5, color: urls.length ? "var(--foreground)" : "var(--muted-foreground)" }}>
                {urls.length} {urls.length === 1 ? "link" : "links"} detected
              </span>
              <div style={{ flex: 1 }}></div>
              {text && <Button variant="ghost" size="sm" onClick={() => setText("")}>Clear</Button>}
              <Button variant="ghost" size="sm" onClick={() => setText(sample)}>Use sample</Button>
              <Button variant="brand" size="sm" disabled={!urls.length || phase === "submitting"} onClick={submit}>
                {phase === "submitting" ? "Submitting…" : <>Archive {urls.length || ""} <Icon name="arrowRight" size={14} /></>}
              </Button>
            </div>
          </div>
        )}

        {/* detected url chips (pre-submit) */}
        {phase === "idle" && urls.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 16 }}>
            {urls.slice(0, 12).map((u, i) => {
              const { host, path } = parseHost(u);
              return (
                <span key={i} className="url-pill">
                  <Icon name="globe" size={12} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                  <span className="host">{host}</span>
                  <span className="path">{path.length > 24 ? path.slice(0, 24) + "…" : path}</span>
                </span>
              );
            })}
            {urls.length > 12 && <span className="url-pill"><span className="path">+{urls.length - 12} more</span></span>}
          </div>
        )}

        {/* results */}
        {results.length > 0 && (
          <div style={{ marginTop: 26, display: "flex", flexDirection: "column", gap: 9 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ font: "600 13px/1 var(--font-mono)", textTransform: "uppercase", letterSpacing: ".08em", color: "var(--muted-foreground)" }}>
                Batch · {results.filter(r => r.status === "archived").length}/{results.length} archived
              </div>
              {phase === "done" && <Button variant="outline" size="sm" onClick={reset}><Icon name="plus" size={14} />Add more</Button>}
            </div>
            {results.map((r, i) => <ResultRow key={i} r={r} />)}
            {phase === "done" && (
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <Button variant="brand" onClick={() => go("stand")}><Icon name="stand" size={15} />View on the newsstand</Button>
                <Button variant="outline" onClick={() => go("processing")}><Icon name="activity" size={15} />Watch processing</Button>
              </div>
            )}
          </div>
        )}

        {/* how it works */}
        {phase === "idle" && !urls.length && (
          <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 14 }}>
            {[
              { icon: "globe", h: "Capture", d: "Headless browser renders the page and snapshots it." },
              { icon: "sparkles", h: "Understand", d: "Workers AI extracts text, summary, and tags." },
              { icon: "layers", h: "Embed", d: "Content is chunked and vectorised into Vectorize." },
              { icon: "search", h: "Recall", d: "Search, filter, and chat across everything in D1." },
            ].map((s, i) => (
              <div key={i} className="card" style={{ padding: 16 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", marginBottom: 12 }}>
                  <Icon name={s.icon} size={16} />
                </div>
                <div style={{ font: "600 14px/1.2 var(--font-sans)", marginBottom: 6 }}>{s.h}</div>
                <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>{s.d}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ResultRow({ r }) {
  const { host } = parseHost(r.url);
  const map = {
    pending:  { ico: "refresh", color: "var(--muted-foreground)", bg: "var(--muted)", label: "Processing…", spin: true },
    archived: { ico: "check", color: "var(--ok)", bg: "oklch(0.72 0.16 150 / 16%)", label: "Archived" },
    skipped:  { ico: "copy", color: "var(--warn)", bg: "oklch(0.8 0.14 85 / 16%)", label: "Already archived" },
    failed:   { ico: "alert", color: "var(--err)", bg: "oklch(0.66 0.2 22 / 16%)", label: "Failed" },
  };
  const m = map[r.status];
  return (
    <div className="ingest-result">
      <div className="ico" style={{ background: m.bg, color: m.color }}>
        <Icon name={m.ico} size={15} style={m.spin ? { animation: "spin 1s linear infinite" } : null} />
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ font: "500 13px/1.3 var(--font-sans)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {r.title || host}
        </div>
        <div className="mono muted" style={{ fontSize: 11, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{host}</div>
      </div>
      <span className="badge" style={{ color: m.color, background: m.bg }}>{m.label}</span>
    </div>
  );
}

const SAMPLE_TITLES = [
  "The Agentic Web and the End of the App Store",
  "The salary negotiation script that actually works",
  "Building a quiet, powerful home AI workstation",
  "The new playbook for AI-native SaaS pricing",
];

Object.assign(window, { Ingest });
