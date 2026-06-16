/* global React, Icon, Button, window, TAGS, CATEGORIES, SOURCES, catHue */
const { useState: useStateMM, useRef: useRefMM, useEffect: useEffectMM, useMemo: useMemoMM } = React;

/* ---------- per-article mindmap generator (as if built during processing) ---------- */
const BRANCH_TEMPLATES = {
  ai:       [["Core thesis", ["What's actually new", "Why now"]], ["Mechanics", ["How it works", "Key constraints"]], ["Implications", ["For builders", "For incumbents"]], ["Open questions", ["Unknowns", "What to watch"]]],
  hardware: [["The verdict", ["Who it's for", "Trade-offs"]], ["Specs that matter", ["Performance", "Thermals & noise"]], ["Value", ["Price tier", "Alternatives"]], ["Buy or wait", ["Now", "Next cycle"]]],
  career:   [["The framework", ["Step by step", "Common mistakes"]], ["What to say", ["Strong phrasing", "What to avoid"]], ["Preparation", ["Before", "On the day"]], ["Follow-through", ["After", "Long game"]]],
  startups: [["The claim", ["Thesis", "Evidence"]], ["Market shape", ["Demand", "Supply"]], ["Strategy", ["Moats", "Risks"]], ["So what", ["For founders", "For investors"]]],
  finance:  [["The principle", ["Why it holds", "Caveats"]], ["The numbers", ["Returns", "Risks"]], ["Tactics", ["Do this", "Avoid this"]], ["Time horizon", ["Short term", "Long term"]]],
  science:  [["The finding", ["What changed", "Why it matters"]], ["The method", ["Approach", "Limits"]], ["Context", ["Prior work", "Debate"]], ["Next", ["Implications", "Unknowns"]]],
};

function mindmapFor(article) {
  const tpl = BRANCH_TEMPLATES[article.cat] || BRANCH_TEMPLATES.ai;
  const tagLabels = article.tags.map(([id]) => TAGS[id]?.label).filter(Boolean);
  return {
    label: article.title,
    hue: catHue(article.cat),
    children: tpl.map(([branch, leaves], i) => ({
      label: branch,
      children: [
        ...leaves.map(l => ({ label: l })),
        ...(i === 0 && tagLabels.length ? [{ label: "Tagged: " + tagLabels.slice(0, 3).join(", ") }] : []),
      ],
    })),
  };
}

/* assign stable ids + collect into render structures with a horizontal-tree layout */
function buildLayout(root, collapsed) {
  if (!root) return { nodes: [], edges: [], width: 0, height: 0 };
  const COL = 230, ROW = 50;
  let leaf = 0, maxDepth = 0;
  const nodes = [], edges = [];
  function walk(n, depth, path, parent) {
    const id = path;
    maxDepth = Math.max(maxDepth, depth);
    const isCollapsed = collapsed.has(id);
    const kids = n.children && n.children.length && !isCollapsed
      ? n.children.map((c, i) => walk(c, depth + 1, path + "." + i, id)) : [];
    let y;
    if (kids.length) y = (kids[0].y + kids[kids.length - 1].y) / 2;
    else { y = leaf * ROW; leaf++; }
    const node = { id, label: n.label, depth, x: depth * COL, y, hasChildren: !!(n.children && n.children.length), collapsed: isCollapsed, parent };
    nodes.push(node);
    kids.forEach(k => edges.push({ from: node, to: k }));
    return node;
  }
  walk(root, 0, "0", null);
  return { nodes, edges, width: (maxDepth + 1) * COL, height: Math.max(leaf, 1) * ROW + 20 };
}

function Mindmap({ tree, accentHue }) {
  const [collapsed, setCollapsed] = useStateMM(new Set());
  const [zoom, setZoom] = useStateMM(1);
  const hue = accentHue != null ? accentHue : (tree.hue != null ? tree.hue : 35);
  const { nodes, edges, width, height } = useMemoMM(() => buildLayout(tree, collapsed), [tree, collapsed]);

  function toggle(id) {
    setCollapsed(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="mm-wrap">
      <div className="mm-controls">
        <button className="icon-btn" onClick={() => setZoom(z => Math.min(1.6, z + 0.15))} title="Zoom in"><Icon name="plus" size={15} /></button>
        <button className="icon-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.15))} title="Zoom out"><Icon name="hash" size={15} style={{ opacity: 0 }} /><span style={{ position: "absolute", fontSize: 18, lineHeight: 1 }}>−</span></button>
        <button className="icon-btn" onClick={() => { setZoom(1); setCollapsed(new Set()); }} title="Reset"><Icon name="refresh" size={14} /></button>
      </div>
      <div className="mm-canvas">
        <div className="mm-stage" style={{ width, height, transform: `scale(${zoom})` }}>
          <svg className="mm-edges" width={width} height={height}>
            {edges.map((e, i) => {
              const x1 = e.from.x + 188, y1 = e.from.y + 17, x2 = e.to.x, y2 = e.to.y + 17;
              const mx = (x1 + x2) / 2;
              return <path key={i} d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`} fill="none"
                stroke={`oklch(0.6 0.1 ${hue} / ${e.to.depth === 1 ? 0.5 : 0.3})`} strokeWidth={e.to.depth === 1 ? 2 : 1.5} />;
            })}
          </svg>
          {nodes.map(n => (
            <div key={n.id} className={`mm-node d${Math.min(n.depth, 2)}`} style={{ left: n.x, top: n.y, "--mm-h": hue }}
              onClick={() => n.hasChildren && toggle(n.id)}>
              <span className="mm-label">{n.label}</span>
              {n.hasChildren && <span className="mm-toggle">{n.collapsed ? <Icon name="plus" size={11} /> : <Icon name="x" size={10} style={{ transform: "rotate(45deg)" }} />}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- build-progress modal (mindmap or PWA) ---------- */
const BUILD_STEPS = {
  mindmap: ["Reading sources", "Extracting key concepts", "Clustering into branches", "Rendering the mind map", "Saving to R2 · indexing D1"],
  pwa: ["Planning components & routes", "Generating shadcn React UI", "Deploying to a dynamic worker", "Saving build to R2", "Indexing in D1"],
};

function GenerateModal({ kind, scopeLabel, presetPrompt, onClose, onDone }) {
  const [prompt, setPrompt] = useStateMM(presetPrompt || "");
  const [phase, setPhase] = useStateMM("compose"); // compose | building | done
  const [step, setStep] = useStateMM(0);
  const steps = BUILD_STEPS[kind];
  const timerRef = useRefMM(null);

  useEffectMM(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function start() {
    if (kind === "pwa" && !prompt.trim()) return;
    setPhase("building"); setStep(0);
    let i = 0;
    timerRef.current = setInterval(() => {
      i++;
      if (i >= steps.length) {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase("done");
        setStep(steps.length);
      }
      else setStep(i);
    }, 700);
  }

  const title = kind === "mindmap" ? "Generate mind map" : "Build a PWA";
  const sub = kind === "mindmap"
    ? `A visual map of the key ideas across ${scopeLabel}.`
    : `A standalone shadcn React app, deployed to a dynamic worker and saved for later.`;

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="gen-modal" onClick={e => e.stopPropagation()}>
        <div className="gen-head">
          <div className="gen-ico" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}>
            <Icon name={kind === "mindmap" ? "share" : "sparkles"} size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ font: "600 16px/1.1 var(--font-heading)" }}>{title}</div>
            <div className="hint" style={{ marginTop: 4 }}>{sub}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon name="x" size={16} /></button>
        </div>

        {phase === "compose" && (
          <div className="gen-body">
            <div className="gen-scope"><Icon name="layers" size={13} /> Source · <strong style={{ color: "var(--foreground)" }}>{scopeLabel}</strong></div>
            <div className="field" style={{ marginTop: 16 }}>
              <label>{kind === "mindmap" ? "Focus (optional)" : "Describe the app"}</label>
              <span className="hint">{kind === "mindmap" ? "Leave blank for a balanced map, or steer it — e.g. “focus on the negotiation tactics.”" : "The agent turns this into a working PWA. You can keep iterating in chat after."}</span>
              <textarea className="input" style={{ minHeight: 84, marginTop: 4 }} autoFocus value={prompt} onChange={e => setPrompt(e.target.value)}
                placeholder={kind === "mindmap" ? "e.g. emphasise the practical steps" : "e.g. an interactive interview-prep coach with flashcards and a mock-interview timer"} />
            </div>
            {kind === "pwa" && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8 }}>
                {["Flashcard study app", "Interactive checklist", "Comparison dashboard", "Step-by-step guide"].map(s => (
                  <button key={s} className="chip" style={{ height: 28, fontSize: 12 }} onClick={() => setPrompt(s + " based on " + scopeLabel)}>{s}</button>
                ))}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
              <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
              <Button variant="brand" size="sm" onClick={start} disabled={kind === "pwa" && !prompt.trim()}>
                <Icon name="sparkles" size={14} />{kind === "mindmap" ? "Generate" : "Build it"}
              </Button>
            </div>
          </div>
        )}

        {phase !== "compose" && (
          <div className="gen-body">
            <div className="gen-steps">
              {steps.map((s, i) => (
                <div key={i} className={`gen-step ${i < step ? "done" : i === step ? "active" : ""}`}>
                  <span className="gen-step-ico">
                    {i < step ? <Icon name="check" size={13} /> : i === step ? <Icon name="refresh" size={13} style={{ animation: "spin 1s linear infinite" }} /> : <span className="dot" style={{ background: "var(--muted-foreground)" }}></span>}
                  </span>
                  {s}
                </div>
              ))}
            </div>
            {phase === "done" && (
              <div className="gen-done">
                <div className="gen-ico" style={{ background: "oklch(0.72 0.16 150 / 16%)", color: "var(--ok)", margin: "0 auto" }}><Icon name="check" size={20} /></div>
                <div style={{ font: "600 15px/1.2 var(--font-heading)", marginTop: 12 }}>{kind === "mindmap" ? "Mind map ready" : "PWA deployed"}</div>
                <div className="hint" style={{ marginTop: 6 }}>Saved to R2 and indexed in D1 — find it anytime in Studio.</div>
                <Button variant="brand" size="sm" style={{ marginTop: 16 }} onClick={() => onDone(makeArtifact(kind, scopeLabel, prompt))}>
                  Open in Studio <Icon name="arrowRight" size={14} />
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

let _aid = 5000;
function makeArtifact(kind, scopeLabel, prompt) {
  _aid++;
  if (kind === "mindmap") {
    return { id: "art-" + _aid, type: "mindmap", title: "Mind map · " + scopeLabel, source: scopeLabel, date: "just now",
      tree: notebookTree(scopeLabel, prompt) };
  }
  const app = /interview|career|negotiat/i.test(prompt + scopeLabel) ? "interview-coach"
    : /pc|build|gpu|hardware|laptop/i.test(prompt + scopeLabel) ? "pc-builder" : "generated";
  return { id: "art-" + _aid, type: "pwa", title: pwaTitle(prompt), source: scopeLabel, date: "just now", app, prompt };
}
function pwaTitle(p) {
  const t = (p || "").replace(/ based on .*/i, "").trim();
  return t ? (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 40) : "Generated app";
}
function notebookTree(scopeLabel, prompt) {
  return {
    label: prompt ? prompt.slice(0, 40) : scopeLabel, hue: 35,
    children: [
      { label: "Common threads", children: [{ label: "Shared assumptions" }, { label: "Points of agreement" }] },
      { label: "Tensions", children: [{ label: "Where sources differ" }, { label: "Open debates" }] },
      { label: "Takeaways", children: [{ label: "What to do" }, { label: "What to watch" }] },
      { label: "Sources", children: [{ label: scopeLabel }] },
    ],
  };
}

Object.assign(window, { Mindmap, mindmapFor, GenerateModal, makeArtifact, notebookTree });
