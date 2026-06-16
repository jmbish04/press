/* global React, ReactDOM, PRESS */
const { useState, useRef, useEffect, useMemo, useCallback } = React;
const { SOURCES, FACE_FONT, TAGS: SEED_TAGS, ARTICLES, ROOT_TAGS } = PRESS;

/* ---------- Icons (inline, Lucide-style) ---------- */
const P = {
  stand: "M3 9h18M3 9l1.5-4.5h15L21 9M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  search: "M21 21l-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  globe: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  tag: "M20.6 13.4 12 4.8a2 2 0 0 0-1.4-.6H5a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l8.6 8.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8zM7.5 7.5h.01",
  plus: "M12 5v14M5 12h14",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z",
  trash: "M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  chevR: "M9 6l6 6-6 6",
  chevD: "M6 9l6 6 6-6",
  pause: "M6 4h4v16H6zM14 4h4v16h-4z",
  play: "M6 4l14 8-14 8z",
  hand: "M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8a8 8 0 0 0 8 8h0a8 8 0 0 0 8-8v-3a2 2 0 0 0-4 0",
  layers: "M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5h13a2 2 0 0 1 1.8 1.1l1.7 5.4V19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7.5l1.7-5.4A2 2 0 0 1 5.5 5z",
  book: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z",
  studio: "M12 3l2.4 5.6 5.6.4-4.3 3.6 1.4 5.4L12 20.6 6.9 18.4l1.4-5.4L4 9.4l5.6-.4z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  sidebar: "M3 4.5h18a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5H3A1.5 1.5 0 0 1 1.5 18V6A1.5 1.5 0 0 1 3 4.5zM9 4.5v15",
};
function Icon({ name, size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={P[name]} />
    </svg>
  );
}

/* ---------- helpers ---------- */
function toCamelCase(raw) {
  // split on separators AND existing camelCase boundaries so "aiAgents" stays "aiAgents"
  const spaced = String(raw).replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const words = spaced.replace(/[^a-zA-Z0-9 ]+/g, " ").trim().split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return "";
  return words.map((w, i) =>
    i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  ).join("");
}
/** Derive a child colour: same hue family, stepped lightness by depth + sibling index. */
function childColor(parentHue, depth, idx) {
  const L = Math.min(0.84, 0.6 + depth * 0.07 + (idx % 2) * 0.02);
  const h = parentHue + (idx * 7 - 7);
  return `oklch(${L.toFixed(2)} 0.15 ${h})`;
}
function familySwatches(hue, depth) {
  return Array.from({ length: 6 }, (_, i) => childColor(hue, depth, i));
}
function tagById(tags, id) { return tags.find((t) => t.id === id); }
function depthOf(tags, t) { let d = 0, cur = t; while (cur && cur.parentId) { d++; cur = tagById(tags, cur.parentId); } return d; }

/* =====================================================================
   NEWSSTAND
   ===================================================================== */
function SourceCard({ a }) {
  const s = SOURCES[a.src];
  const cls = ["acard"];
  return (
    <div className="acard" style={{ "--src-accent": s.accent, "--src-ink": s.ink, "--src-bg": s.bg, "--src-face": FACE_FONT[s.face] }}>
      <div className="masthead">
        <span className={"mh-name " + s.face}>{s.name}</span>
      </div>
      <div className="thumb">
        <div className="render">
          <div className="r-kicker" />
          <div className="r-head">{a.title}</div>
          <div className="r-hero" />
          {[1, 2, 3, 4].map((i) => <div key={i} className="r-line" style={{ width: (94 - (i % 3) * 14) + "%" }} />)}
          <div className="r-fade" />
        </div>
      </div>
      <div className="ameta">
        <div className="atitle">{a.title}</div>
        <div className="asub">
          <Icon name="globe" size={11} />{a.host}
          <span className="dotsep">·</span>{a.ago}
        </div>
        <div className="atags">
          {a.tagIds.slice(0, 3).map((id) => {
            const t = SEED_TAGS.find((x) => x.id === id);
            if (!t) return null;
            return (
              <span key={id} className="chip" style={{ height: 18, fontSize: 10, padding: "0 7px" }}>
                <span className="dot" style={{ background: t.color }} />{t.name}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Rail with JS auto-scroll that yields to user wheel / touch / drag. */
function Rail({ articles, globalPaused }) {
  const ref = useRef(null);
  const stateRef = useRef({ raf: 0, idleUntil: 0, dragging: false, startX: 0, startScroll: 0, moved: false, pos: 0 });
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // duplicate for seamless wrap
  const loop = articles.length >= 4 ? [...articles, ...articles] : articles;
  const seamless = articles.length >= 4;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const st = stateRef.current;
    const SPEED = 0.45; // px per frame
    st.pos = el.scrollLeft; // authoritative float position (scrollLeft read-back is integer-rounded)

    function tick() {
      const now = performance.now();
      const paused = globalPaused || st.dragging || now < st.idleUntil || el.matches(":hover");
      if (!paused && el.scrollWidth > el.clientWidth) {
        st.pos += SPEED;
        if (seamless && st.pos >= el.scrollWidth / 2) st.pos -= el.scrollWidth / 2;
        el.scrollLeft = st.pos;
      } else {
        st.pos = el.scrollLeft; // stay in sync while paused / hovered / user-scrolling
      }
      st.raf = requestAnimationFrame(tick);
    }
    st.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(st.raf);
  }, [globalPaused, seamless, reduce]);

  // user interrupt handlers — bump idle window so auto-scroll yields, then re-sync float pos
  const yield_ = () => { const st = stateRef.current; st.idleUntil = performance.now() + 2600; if (ref.current) st.pos = ref.current.scrollLeft; };
  const onWheel = () => yield_();
  const onTouchStart = () => yield_();
  const onTouchMove = () => yield_();

  // pointer drag-to-scroll (desktop)
  const onPointerDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = ref.current, st = stateRef.current;
    st.dragging = true; st.moved = false;
    st.startX = e.clientX; st.startScroll = el.scrollLeft;
    el.classList.add("dragging");
    el.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e) => {
    const st = stateRef.current; if (!st.dragging) return;
    const el = ref.current; const dx = e.clientX - st.startX;
    if (Math.abs(dx) > 4) st.moved = true;
    el.scrollLeft = st.startScroll - dx;
  };
  const onPointerUp = (e) => {
    const st = stateRef.current; const el = ref.current;
    st.dragging = false; el.classList.remove("dragging");
    st.idleUntil = performance.now() + 2600; st.pos = el.scrollLeft;
    el.releasePointerCapture?.(e.pointerId);
  };
  const onClickCapture = (e) => { if (stateRef.current.moved) { e.preventDefault(); e.stopPropagation(); } };

  return (
    <div className="rail" ref={ref}
      onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove}
      onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onClickCapture={onClickCapture}>
      {loop.map((a, i) => <SourceCard key={a.id + "-" + i} a={a} />)}
    </div>
  );
}

function CategoryRow({ tag, articles, paused }) {
  if (!articles.length) return null;
  return (
    <section className="cat-row">
      <div className="cat-row-head">
        <span className="cat-dot" style={{ background: tag.color, "--cat": tag.color }} />
        <span className="cat-name">{tag.name}</span>
        <span className="cat-count">{articles.length}</span>
        <span className="cat-hint"><Icon name="hand" size={12} /> drag or scroll to take over</span>
      </div>
      <Rail articles={articles} globalPaused={paused} />
    </section>
  );
}

function Newsstand() {
  const [view, setView] = useState("stand");
  const [paused, setPaused] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return null;
    return ARTICLES.filter((a) =>
      (a.title + " " + SOURCES[a.src].name + " " + a.host).toLowerCase().includes(ql));
  }, [q]);

  return (
    <div>
      <div className="page-head stand-head">
        <div>
          <div className="page-title">The Newsstand</div>
          <div className="page-sub">{ARTICLES.length} captured articles across {ROOT_TAGS.length} desks · every source keeps its own masthead</div>
        </div>
        <div className="seg">
          <button className={view === "stand" ? "active" : ""} onClick={() => setView("stand")}><Icon name="stand" size={14} /> Stand</button>
          <button className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}><Icon name="grid" size={14} /> Grid</button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap">
          <Icon name="search" size={15} />
          <input className="input" placeholder="Search titles, sources…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {view === "stand" && !filtered && (
          <button className="btn outline sm" onClick={() => setPaused((p) => !p)}>
            <Icon name={paused ? "play" : "pause"} size={14} /> {paused ? "Play rows" : "Pause rows"}
          </button>
        )}
      </div>

      {filtered ? (
        <>
          <div className="muted" style={{ margin: "16px 0 2px" }}>{filtered.length} result{filtered.length === 1 ? "" : "s"} for "{q.trim()}"</div>
          <div className="grid-view">{filtered.map((a) => <SourceCard key={a.id} a={a} />)}</div>
        </>
      ) : view === "grid" ? (
        <div className="grid-view">{ARTICLES.map((a) => <SourceCard key={a.id} a={a} />)}</div>
      ) : (
        ROOT_TAGS.map((tag) => (
          <CategoryRow key={tag.id} tag={tag} paused={paused}
            articles={ARTICLES.filter((a) => a.cat === tag.id)} />
        ))
      )}
    </div>
  );
}

/* =====================================================================
   TAGS ADMIN  — hierarchical CRUD, camelCase, colour inheritance
   ===================================================================== */
const ROOT_HUES = [
  { hue: 265, label: "violet" }, { hue: 200, label: "cyan" }, { hue: 150, label: "green" },
  { hue: 60, label: "amber" }, { hue: 25, label: "orange" }, { hue: 0, label: "red" },
  { hue: 330, label: "magenta" }, { hue: 290, label: "purple" },
];

function ParentSelect({ tags, value, excludeId, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  // can't parent to self or own descendant
  const isDescendant = (t) => { let c = t; while (c) { if (c.id === excludeId) return true; c = tagById(tags, c.parentId); } return false; };
  const options = tags.filter((t) => t.id !== excludeId && !isDescendant(t));
  const cur = value ? tagById(tags, value) : null;
  return (
    <div className="parent-select" ref={ref}>
      <button className="input" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", textAlign: "left" }} onClick={() => setOpen((o) => !o)}>
        {cur ? <><span className="tswatch" style={{ background: cur.color }} /> <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5 }}>{cur.name}</span></>
          : <span className="muted" style={{ fontSize: 13 }}>None — top-level tag</span>}
        <Icon name="chevD" size={14} style={{ marginLeft: "auto", color: "var(--muted-foreground)" }} />
      </button>
      {open && (
        <div className="parent-pop">
          <div className="parent-opt" onClick={() => { onChange(null); setOpen(false); }}>
            <span className="tswatch" style={{ background: "transparent", boxShadow: "inset 0 0 0 1px var(--border)" }} />None — top-level
          </div>
          {options.map((t) => (
            <div key={t.id} className="parent-opt" style={{ paddingLeft: 9 + depthOf(tags, t) * 14 }} onClick={() => { onChange(t.id); setOpen(false); }}>
              <span className="tswatch" style={{ background: t.color }} />{t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TagEditor({ tags, draft, onChange, onSave, onCancel, onDelete }) {
  const isNew = draft.id == null;
  const parent = draft.parentId ? tagById(tags, draft.parentId) : null;
  const depth = parent ? depthOf(tags, parent) + 1 : 0;
  const camel = toCamelCase(draft.rawName ?? draft.name ?? "");

  // colour options: if has parent → in-family hues; else root hue families
  const siblingIdx = parent ? tags.filter((t) => t.parentId === parent.id && t.id !== draft.id).length : 0;
  const familyHue = parent ? parent.hue : draft.hue;
  const inFamily = familySwatches(familyHue, depth || 1);

  // when parent changes, snap colour into the family
  useEffect(() => {
    if (parent) {
      const c = childColor(parent.hue, depth, siblingIdx);
      onChange({ ...draft, hue: parent.hue, color: draft._touchedColor ? draft.color : c });
    }
    // eslint-disable-next-line
  }, [draft.parentId]);

  return (
    <div className="editor">
      <h3>{isNew ? "New tag" : "Edit tag"}</h3>
      <div className="ed-sub">{isNew ? "Define a tag once; the AI and your reviewers reuse it everywhere." : "Changes apply across every article carrying this tag."}</div>

      <div className="field">
        <label>Name</label>
        <input className="input" placeholder="e.g. Large Language Models" value={draft.rawName ?? draft.name ?? ""}
          onChange={(e) => onChange({ ...draft, rawName: e.target.value })} />
        <div className="camel-preview">
          <span className="muted" style={{ whiteSpace: "nowrap" }}>stored as</span><span className="arrow">→</span>
          <span className="out">{camel || "—"}</span>
        </div>
        <span className="hint">Type it however you like. The system normalises every tag name to <strong>camelCase</strong>.</span>
      </div>

      <div className="field">
        <label>Description</label>
        <textarea className="input" rows={2} placeholder="What belongs under this tag? (guides the AI tagger)"
          value={draft.desc ?? ""} onChange={(e) => onChange({ ...draft, desc: e.target.value })} />
      </div>

      <div className="field">
        <label>Parent tag</label>
        <ParentSelect tags={tags} value={draft.parentId} excludeId={draft.id}
          onChange={(pid) => onChange({ ...draft, parentId: pid, _touchedColor: false })} />
        <span className="hint">{parent
          ? <>Inherits the <strong style={{ color: parent.color }}>{parent.name}</strong> colour family — children get a distinct hue/shade automatically.</>
          : "Top-level tags start a new colour family."}</span>
      </div>

      <div className="field">
        <label>Colour</label>
        {parent ? (
          <>
            <div className="swatch-row">
              {inFamily.map((c, i) => (
                <button key={i} className={draft.color === c ? "on" : ""} style={{ background: c }}
                  onClick={() => onChange({ ...draft, color: c, _touchedColor: true })} />
              ))}
            </div>
            <div className="hue-strip">
              <span className="lbl">family of {parent.name}</span>
            </div>
            <span className="hint">All options are different hues/shades of the parent's family.</span>
          </>
        ) : (
          <>
            <div className="swatch-row">
              {ROOT_HUES.map((h) => {
                const c = `oklch(0.62 0.18 ${h.hue})`;
                return <button key={h.hue} className={Math.abs((draft.hue ?? 265) - h.hue) < 6 ? "on" : ""} style={{ background: c }}
                  onClick={() => onChange({ ...draft, hue: h.hue, color: c, _touchedColor: true })} title={h.label} />;
              })}
            </div>
            <span className="hint">Pick a base family. Child tags will derive their colours from it.</span>
          </>
        )}
      </div>

      <div className="field" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div><label style={{ marginBottom: 2 }}>Active</label><span className="hint" style={{ marginTop: 0 }}>Inactive tags are hidden from new assignments.</span></div>
        <button className={"toggle " + (draft.isActive ? "on" : "")} onClick={() => onChange({ ...draft, isActive: !draft.isActive })} />
      </div>

      <div className="field" style={{ marginTop: 4, marginBottom: 6 }}>
        <label>Preview</label>
        <span className="preview-chip" style={{ background: `color-mix(in oklab, ${draft.color || "oklch(0.62 0.18 265)"} 22%, transparent)`, color: `color-mix(in oklab, ${draft.color || "oklch(0.62 0.18 265)"} 72%, white)` }}>
          <span className="dot" style={{ width: 7, height: 7, borderRadius: 999, background: draft.color }} />{camel || "tagName"}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn primary sm" onClick={() => onSave({ ...draft, name: camel })} disabled={!camel}><Icon name="check" size={14} /> {isNew ? "Create tag" : "Save changes"}</button>
        <button className="btn ghost sm" onClick={onCancel}>Cancel</button>
        {!isNew && <button className="btn danger sm" style={{ marginLeft: "auto" }} onClick={() => onDelete(draft.id)}><Icon name="trash" size={14} /> Mark inactive</button>}
      </div>
    </div>
  );
}

function TagsAdmin() {
  const [tags, setTags] = useState(SEED_TAGS);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [collapsed, setCollapsed] = useState({});
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const counts = useMemo(() => {
    const m = {};
    ARTICLES.forEach((a) => a.tagIds.forEach((id) => { m[id] = (m[id] || 0) + 1; }));
    return m;
  }, []);

  // build ordered tree rows
  const rows = useMemo(() => {
    const out = [];
    const walk = (parentId, depth) => {
      tags.filter((t) => t.parentId === parentId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((t) => {
          const hasKids = tags.some((x) => x.parentId === t.id);
          out.push({ t, depth, hasKids });
          if (hasKids && !collapsed[t.id]) walk(t.id, depth + 1);
        });
    };
    walk(null, 0);
    return out;
  }, [tags, collapsed]);

  const visible = rows.filter(({ t }) =>
    (showInactive || t.isActive) &&
    (!q.trim() || t.name.toLowerCase().includes(q.toLowerCase()) || (t.desc || "").toLowerCase().includes(q.toLowerCase())));

  const startNew = () => { setDraft({ id: null, rawName: "", name: "", desc: "", parentId: null, hue: 265, color: "oklch(0.62 0.18 265)", isActive: true }); setSelectedId(null); };
  const startEdit = (t) => { setDraft({ ...t, rawName: t.name }); setSelectedId(t.id); };

  const save = (d) => {
    if (d.id == null) {
      const id = Math.max(0, ...tags.map((t) => t.id)) + 1;
      setTags([...tags, { id, name: d.name, desc: d.desc, parentId: d.parentId, hue: d.hue, color: d.color, isActive: d.isActive }]);
      setSelectedId(id);
    } else {
      setTags(tags.map((t) => t.id === d.id ? { ...t, name: d.name, desc: d.desc, parentId: d.parentId, hue: d.hue, color: d.color, isActive: d.isActive } : t));
    }
    setDraft(null);
  };
  const markInactive = (id) => { setTags(tags.map((t) => t.id === id ? { ...t, isActive: false } : t)); setDraft(null); setSelectedId(null); };

  return (
    <div>
      <div className="page-head">
        <div className="page-title">Tags</div>
        <div className="page-sub">{tags.filter((t) => t.isActive).length} active tags in {tags.filter((t) => !t.parentId).length} families · names normalise to camelCase · child colours inherit the parent's family</div>
      </div>

      <div className="admin-grid">
        <div>
          <div className="tag-toolbar">
            <div className="search-wrap" style={{ flex: 1 }}>
              <Icon name="search" size={15} />
              <input className="input" placeholder="Search tags…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <button className="btn primary sm" onClick={startNew}><Icon name="plus" size={14} /> New tag</button>
          </div>

          <div className="tag-tree">
            {visible.map(({ t, depth, hasKids }) => (
              <div key={t.id} className={"tnode" + (t.isActive ? "" : " inactive") + (selectedId === t.id ? " selected" : "")} data-depth={depth} onClick={() => startEdit(t)}>
                <span className="twist" onClick={(e) => { e.stopPropagation(); if (hasKids) setCollapsed((c) => ({ ...c, [t.id]: !c[t.id] })); }}>
                  {hasKids ? <Icon name={collapsed[t.id] ? "chevR" : "chevD"} size={14} /> : null}
                </span>
                <span className="tswatch" style={{ background: t.color }} />
                <div style={{ minWidth: 0 }}>
                  <div className="tname"><span className="at">#</span>{t.name}{!t.isActive && <span className="tbadge" style={{ marginLeft: 8 }}>inactive</span>}</div>
                  {t.desc && <div className="tdesc">{t.desc}</div>}
                </div>
                <span className="tcount">{counts[t.id] || 0}</span>
                <div className="tactions" onClick={(e) => e.stopPropagation()}>
                  <button className="icon-btn" title="Edit" onClick={() => startEdit(t)}><Icon name="edit" size={14} /></button>
                  {t.isActive
                    ? <button className="icon-btn danger" title="Mark inactive" onClick={() => markInactive(t.id)}><Icon name="trash" size={14} /></button>
                    : <button className="icon-btn" title="Reactivate" onClick={() => setTags(tags.map((x) => x.id === t.id ? { ...x, isActive: true } : x))}><Icon name="check" size={14} /></button>}
                </div>
              </div>
            ))}
            {visible.length === 0 && <div className="tnode" style={{ justifyContent: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No tags match.</div>}
          </div>

          <label style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 14, cursor: "pointer", fontSize: 13 }}>
            <button className={"toggle " + (showInactive ? "on" : "")} onClick={(e) => { e.preventDefault(); setShowInactive((v) => !v); }} />
            Show inactive tags
          </label>
        </div>

        <div>
          {draft
            ? <TagEditor tags={tags} draft={draft} onChange={setDraft} onSave={save} onCancel={() => { setDraft(null); setSelectedId(null); }} onDelete={markInactive} />
            : (
              <div className="editor" style={{ textAlign: "center", padding: "40px 22px" }}>
                <div style={{ color: "var(--muted-foreground)", display: "grid", placeItems: "center", gap: 12 }}>
                  <Icon name="tag" size={26} style={{ opacity: .4 }} />
                  <div style={{ fontSize: 13 }}>Select a tag to edit, or create a new one.<br />Hierarchy, colour family, and camelCase are handled for you.</div>
                  <button className="btn primary sm" onClick={startNew}><Icon name="plus" size={14} /> New tag</button>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

/* =====================================================================
   APP  — sidebar + topbar shell (matches the production Press shell)
   ===================================================================== */
const SB_NAV = [
  { id: "ingest", label: "Add to archive", icon: "inbox" },
  { id: "stand", label: "Newsstand", icon: "stand", count: ARTICLES.length },
  { id: "notebook", label: "Notebook", icon: "book" },
  { id: "studio", label: "Studio", icon: "studio" },
  { id: "processing", label: "Processing", icon: "activity" },
];
const SB_VIEWS = [
  { name: "Interview prep", hue: 150 },
  { name: "AI watch", hue: 265 },
  { name: "Hardware desk", hue: 200 },
];

function App() {
  const [route, setRoute] = useState("stand");
  const onTags = route === "tags";
  const title = onTags ? "Settings & config" : "Newsstand";
  const titleIcon = onTags ? "settings" : "stand";

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sb-brand">
          <div className="sb-mark">P</div>
          <div><div className="sb-name">Press</div><div className="sb-sub">archive</div></div>
        </div>
        <button className="sb-quick"><Icon name="plus" size={15} /> Add links</button>

        <nav className="sb-nav">
          {SB_NAV.map((n) => (
            <button key={n.id} className={"sb-item" + (route === n.id ? " active" : "")}
              onClick={() => n.id === "stand" && setRoute("stand")}>
              <Icon name={n.icon} size={17} />
              <span className="lbl">{n.label}</span>
              {n.count != null && <span className="count">{n.count}</span>}
            </button>
          ))}
        </nav>

        <div className="sb-sec">Saved views</div>
        <nav className="sb-nav">
          {SB_VIEWS.map((v) => (
            <button key={v.name} className="sb-item">
              <span className="sb-dot" style={{ background: `oklch(0.7 0.16 ${v.hue})`, marginLeft: 5 }} />
              <span className="lbl">{v.name}</span>
            </button>
          ))}
          <button className="sb-item" style={{ color: "var(--muted-foreground)" }}>
            <Icon name="plus" size={15} /><span className="lbl">New view</span>
          </button>
        </nav>

        <div className="sb-foot">
          <button className={"sb-item" + (onTags ? " active" : "")} onClick={() => setRoute("tags")}>
            <Icon name="settings" size={17} /><span className="lbl">Settings &amp; config</span>
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="tb-toggle" title="Toggle sidebar"><Icon name="sidebar" size={17} /></button>
          <div className="tb-title"><span className="pageicon"><Icon name={titleIcon} size={16} /></span>{title}</div>
          <div className="tb-spacer" />
          <button className="tb-search"><Icon name="search" size={14} /> Search the archive… <span className="kbd">⌘K</span></button>
          <button className="tb-bell icon-btn"><Icon name="bell" size={17} /><span className="bell-dot">3</span></button>
        </header>
        <div className="content">
          {onTags ? <TagsAdmin /> : <Newsstand />}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
