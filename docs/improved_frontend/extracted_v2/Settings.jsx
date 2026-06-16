/* global React, Icon, Button, Tag, window, TAGS, ARTICLES, CATEGORIES, SOURCES, useClickOutside, catHue */
const { useState: useStateSet, useMemo: useMemoSet, useRef: useRefSet } = React;

const HUES = [265, 200, 150, 30, 95, 320, 0, 250, 175, 50];

/* ---------- shared controls ---------- */
function Toggle({ on, onChange }) {
  return <button type="button" className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)} aria-pressed={on}></button>;
}
function SwatchPick({ hue, onChange }) {
  return (
    <div className="swatch-pick">
      {HUES.map(h => (
        <button key={h} type="button" className={hue === h ? "on" : ""} style={{ background: `oklch(0.65 0.17 ${h})` }} onClick={() => onChange(h)}></button>
      ))}
    </div>
  );
}
function ChipInput({ value, onChange, placeholder, chipClass = "kw-chip" }) {
  const [v, setV] = useStateSet("");
  function add() { const t = v.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""); if (t && !value.includes(t)) onChange([...value, t]); setV(""); }
  return (
    <div className="chip-input">
      {value.map(item => (
        <span key={item} className={chipClass}>{item}<span className="x" onClick={() => onChange(value.filter(x => x !== item))}><Icon name="x" size={11} /></span></span>
      ))}
      <input value={v} placeholder={value.length ? "" : placeholder} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !v && value.length) onChange(value.slice(0, -1)); }}
        onBlur={add} />
    </div>
  );
}
function Field({ label, hint, children }) {
  return <div className="field"><label>{label}</label>{hint && <span className="hint">{hint}</span>}{children}</div>;
}
function PrefRow({ label, hint, children }) {
  return (
    <div className="set-section row-between">
      <div><div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>{label}</div>{hint && <div className="hint" style={{ marginTop: 4, maxWidth: 420 }}>{hint}</div>}</div>
      {children}
    </div>
  );
}

/* tag multiselect for the view editor */
function TagMulti({ selected, onChange }) {
  const [open, setOpen] = useStateSet(false);
  const [q, setQ] = useStateSet("");
  const ref = useRefSet(null);
  useClickOutside(ref, () => setOpen(false));
  const active = Object.keys(TAGS).filter(id => !TAGS[id]._archived);
  const matches = active.filter(id => TAGS[id].label.toLowerCase().includes(q.toLowerCase()) && !selected.includes(id));
  return (
    <div>
      <div className="tag-cloud" style={{ marginBottom: 8 }}>
        {selected.map(id => <Tag key={id} id={id} origin="human" removable onRemove={() => onChange(selected.filter(x => x !== id))} />)}
        {selected.length === 0 && <span className="hint">No tags yet</span>}
      </div>
      <div className="combo" ref={ref} style={{ maxWidth: 280 }}>
        <button type="button" className="combo-trigger" onClick={() => setOpen(o => !o)}><Icon name="plus" size={14} />Add tag</button>
        {open && (
          <div className="combo-pop">
            <input className="combo-search" autoFocus placeholder="Search tags…" value={q} onChange={e => setQ(e.target.value)} />
            {matches.map(id => (
              <div key={id} className="combo-opt" onClick={() => { onChange([...selected, id]); setQ(""); }}>
                <span className="dot" style={{ background: `oklch(0.7 0.16 ${TAGS[id].hue})` }}></span>{TAGS[id].label}
              </div>
            ))}
            {matches.length === 0 && <div className="combo-opt hint" style={{ cursor: "default" }}>No matches</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ TAGS ADMIN ============================ */
function TagsAdmin() {
  const counts = useMemoSet(() => {
    const m = {}; ARTICLES.forEach(a => a.tags.forEach(([id]) => m[id] = (m[id] || 0) + 1)); return m;
  }, []);
  const [tags, setTags] = useStateSet(() => Object.keys(TAGS).map(id => ({ id, label: TAGS[id].label, hue: TAGS[id].hue, count: counts[id] || 0, archived: false })));
  const [q, setQ] = useStateSet("");
  const [showArch, setShowArch] = useStateSet(false);
  const [mergeMode, setMergeMode] = useStateSet(false);
  const [sel, setSel] = useStateSet([]);
  const [creating, setCreating] = useStateSet(false);
  const [newLabel, setNewLabel] = useStateSet("");
  const [newHue, setNewHue] = useStateSet(265);
  const [editing, setEditing] = useStateSet(null);
  const [mergeTarget, setMergeTarget] = useStateSet(false);

  const visible = tags.filter(t => (showArch || !t.archived) && t.label.toLowerCase().includes(q.toLowerCase()));

  function commitCreate() {
    const label = newLabel.trim(); if (!label) { setCreating(false); return; }
    const id = label.toLowerCase().replace(/\s+/g, "-");
    if (!tags.some(t => t.id === id)) {
      TAGS[id] = { label, hue: newHue };
      setTags([{ id, label, hue: newHue, count: 0, archived: false }, ...tags]);
    }
    setNewLabel(""); setCreating(false);
  }
  function rename(id, label) { setTags(tags.map(t => t.id === id ? { ...t, label } : t)); if (TAGS[id]) TAGS[id].label = label; }
  function archive(id, on) { setTags(tags.map(t => t.id === id ? { ...t, archived: on } : t)); if (TAGS[id]) TAGS[id]._archived = on; }
  function doMerge(targetId) {
    const others = sel.filter(id => id !== targetId);
    const sum = others.reduce((n, id) => n + (tags.find(t => t.id === id)?.count || 0), 0);
    setTags(tags.map(t => {
      if (t.id === targetId) return { ...t, count: t.count + sum };
      if (others.includes(t.id)) { if (TAGS[t.id]) TAGS[t.id]._archived = true; return { ...t, archived: true }; }
      return t;
    }));
    setSel([]); setMergeMode(false); setMergeTarget(false);
  }

  return (
    <div>
      <div className="set-h">Tags</div>
      <p className="set-sub">{tags.filter(t => !t.archived).length} active tags, applied by AI during processing or by you in review. Merge duplicates, rename for consistency, or archive ones you no longer use — archiving is reversible.</p>

      <div className="set-toolbar">
        <div className="grow search-wrap" style={{ flex: 1, minWidth: 180 }}>
          <Icon name="search" size={15} /><input className="input" placeholder="Search tags…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        {!mergeMode && <Button variant="outline" size="sm" onClick={() => setMergeMode(true)}><Icon name="merge" size={14} />Merge</Button>}
        {mergeMode && (
          <div className="combo" style={{ position: "relative" }}>
            <Button variant="brand" size="sm" disabled={sel.length < 2} onClick={() => setMergeTarget(v => !v)}>
              <Icon name="merge" size={14} />Merge {sel.length} {sel.length === 1 ? "tag" : "tags"}
            </Button>
            {mergeTarget && sel.length >= 2 && (
              <div className="combo-pop" style={{ right: 0, left: "auto", width: 240 }}>
                <div className="hint" style={{ padding: "6px 9px" }}>Keep which tag?</div>
                {sel.map(id => (
                  <div key={id} className="combo-opt" onClick={() => doMerge(id)}>
                    <span className="dot" style={{ background: `oklch(0.7 0.16 ${tags.find(t => t.id === id)?.hue})` }}></span>
                    {tags.find(t => t.id === id)?.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {mergeMode && <Button variant="ghost" size="sm" onClick={() => { setMergeMode(false); setSel([]); }}>Cancel</Button>}
        {!mergeMode && <Button variant="brand" size="sm" onClick={() => setCreating(true)}><Icon name="plus" size={14} />New tag</Button>}
      </div>

      <div className="set-card">
        {creating && (
          <div className="set-section" style={{ background: "var(--surface)" }}>
            <Field label="New tag">
              <input className="input" autoFocus placeholder="Tag name…" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => e.key === "Enter" && commitCreate()} style={{ maxWidth: 320 }} />
            </Field>
            <Field label="Colour"><SwatchPick hue={newHue} onChange={setNewHue} /></Field>
            <div style={{ display: "flex", gap: 8 }}>
              <Button variant="brand" size="sm" onClick={commitCreate}>Create tag</Button>
              <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewLabel(""); }}>Cancel</Button>
            </div>
          </div>
        )}
        {visible.map(t => (
          <div key={t.id} className={`tag-row ${t.archived ? "arch" : ""}`}>
            {mergeMode && !t.archived && (
              <button className={`tag-checkbox ${sel.includes(t.id) ? "on" : ""}`} onClick={() => setSel(s => s.includes(t.id) ? s.filter(x => x !== t.id) : [...s, t.id])}>
                {sel.includes(t.id) && <Icon name="check" size={12} />}
              </button>
            )}
            <span className="swatch" style={{ background: `oklch(0.7 0.16 ${t.hue})` }}></span>
            {editing === t.id ? (
              <input className="input" style={{ height: 30, maxWidth: 220 }} autoFocus defaultValue={t.label}
                onBlur={e => { rename(t.id, e.target.value.trim() || t.label); setEditing(null); }}
                onKeyDown={e => { if (e.key === "Enter") { rename(t.id, e.target.value.trim() || t.label); setEditing(null); } }} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span className="tlabel">{t.label}{t.archived && <span className="badge badge-outline" style={{ marginLeft: 8, fontSize: 10 }}>archived</span>}</span>
                <span className="tmeta">#{t.id}</span>
              </div>
            )}
            <span className="tcount">{t.count}</span>
            <div className="tactions">
              {t.archived ? (
                <button className="icon-btn" title="Restore" onClick={() => archive(t.id, false)}><Icon name="undo" size={15} /></button>
              ) : (
                <>
                  <button className="icon-btn" title="Rename" onClick={() => setEditing(t.id)}><Icon name="edit" size={14} /></button>
                  <button className="icon-btn danger" title="Archive" onClick={() => archive(t.id, true)}><Icon name="archive" size={14} /></button>
                </>
              )}
            </div>
          </div>
        ))}
        {visible.length === 0 && <div className="tag-row hint" style={{ justifyContent: "center" }}>No tags match.</div>}
      </div>
      <label style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 14, cursor: "pointer", fontSize: 13 }}>
        <Toggle on={showArch} onChange={setShowArch} /> Show archived tags
      </label>
    </div>
  );
}

/* ============================ SAVED VIEWS ADMIN ============================ */
const BLANK_VIEW = () => ({
  id: "v-" + Date.now(), name: "", hue: 265,
  include: { tags: { match: "any", items: [] }, keywords: { match: "any", items: [] }, domains: { match: "any", items: [] } },
  exclude: { tags: [], keywords: [] },
  deleted: false,
});

function MatchSeg({ value, onChange }) {
  return (
    <div className="seg matchseg">
      <button className={value === "any" ? "active" : ""} onClick={() => onChange("any")}>Any</button>
      <button className={value === "all" ? "active" : ""} onClick={() => onChange("all")}>All</button>
    </div>
  );
}

function IncludeFacet({ icon, label, facet, onChange, children }) {
  return (
    <div className="facet-block">
      <div className="facet-head">
        <Icon name={icon} size={14} style={{ color: "var(--muted-foreground)" }} />
        <span className="facet-label">{label}</span>
        <span className="facet-logic">match</span>
        <MatchSeg value={facet.match} onChange={m => onChange({ ...facet, match: m })} />
      </div>
      {children}
    </div>
  );
}

function ViewsAdmin({ views, setViews, focusNew }) {
  const [editing, setEditing] = useStateSet(null);
  const [draft, setDraft] = useStateSet(null);

  function startNew() { setDraft(BLANK_VIEW()); setEditing("new"); }
  function clone(v) {
    return { ...v, hue: v.hue, name: v.name,
      include: { tags: { ...v.include.tags, items: [...v.include.tags.items] }, keywords: { ...v.include.keywords, items: [...v.include.keywords.items] }, domains: { ...v.include.domains, items: [...v.include.domains.items] } },
      exclude: { tags: [...v.exclude.tags], keywords: [...v.exclude.keywords] } };
  }
  function startEdit(v) { setDraft(clone(v)); setEditing(v.id); }
  function save() {
    if (!draft.name.trim()) return;
    setViews(prev => prev.some(v => v.id === draft.id) ? prev.map(v => v.id === draft.id ? draft : v) : [...prev, draft]);
    setEditing(null); setDraft(null);
  }
  function softDelete(id, on) { setViews(views.map(v => v.id === id ? { ...v, deleted: on } : v)); }

  React.useEffect(() => { if (focusNew) startNew(); }, []);

  const active = views.filter(v => !v.deleted);
  const archived = views.filter(v => v.deleted);
  const setInc = (key, val) => setDraft({ ...draft, include: { ...draft.include, [key]: val } });
  const setExc = (key, val) => setDraft({ ...draft, exclude: { ...draft.exclude, [key]: val } });

  if (editing && draft) {
    const isNew = !views.some(v => v.id === draft.id);
    const hasExc = draft.exclude.tags.length || draft.exclude.keywords.length;
    return (
      <div>
        <div className="set-h">{isNew ? "New saved view" : "Edit view"}</div>
        <p className="set-sub">A view is a live filter. Each include facet matches <strong>any</strong> or <strong>all</strong> of its entries; the exclude facets hide anything matching <strong>none-of</strong> rules.</p>
        <div className="set-card" style={{ padding: 20, marginTop: 20, overflow: "visible" }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <Field label="Name"><input className="input" autoFocus placeholder="e.g. Interview prep" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} style={{ width: 280 }} /></Field>
            <Field label="Colour"><SwatchPick hue={draft.hue} onChange={h => setDraft({ ...draft, hue: h })} /></Field>
          </div>

          <div className="facet-section-h"><span className="dot" style={{ background: "var(--ok)" }}></span> Include</div>
          <IncludeFacet icon="tag" label="Tags" facet={draft.include.tags} onChange={v => setInc("tags", v)}>
            <TagMulti selected={draft.include.tags.items} onChange={items => setInc("tags", { ...draft.include.tags, items })} />
          </IncludeFacet>
          <IncludeFacet icon="hash" label="Keywords" facet={draft.include.keywords} onChange={v => setInc("keywords", v)}>
            <ChipInput value={draft.include.keywords.items} onChange={items => setInc("keywords", { ...draft.include.keywords, items })} placeholder="add a keyword…" />
          </IncludeFacet>
          <IncludeFacet icon="globe" label="Source domains" facet={draft.include.domains} onChange={v => setInc("domains", v)}>
            <ChipInput value={draft.include.domains.items} onChange={items => setInc("domains", { ...draft.include.domains, items })} placeholder="e.g. cnn.com…" chipClass="dom-chip" />
          </IncludeFacet>

          <div className="facet-section-h"><span className="dot" style={{ background: "var(--err)" }}></span> Exclude <span className="hint" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>— hide articles matching none-of these</span></div>
          <div className="facet-block">
            <div className="facet-head"><Icon name="tag" size={14} style={{ color: "var(--muted-foreground)" }} /><span className="facet-label">None of these tags</span></div>
            <TagMulti selected={draft.exclude.tags} onChange={items => setExc("tags", items)} />
          </div>
          <div className="facet-block">
            <div className="facet-head"><Icon name="hash" size={14} style={{ color: "var(--muted-foreground)" }} /><span className="facet-label">None of these keywords</span></div>
            <ChipInput value={draft.exclude.keywords} onChange={items => setExc("keywords", items)} placeholder="add an excluded keyword…" />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <Button variant="brand" size="sm" onClick={save} disabled={!draft.name.trim()}><Icon name="check" size={14} />Save view</Button>
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setDraft(null); }}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  }

  function IncFacetRow({ label, facet, render }) {
    if (!facet.items.length) return null;
    return (
      <div className="vc-facet">
        <span className="fl">{label}</span>
        <span className="fv">
          <span className="match-pill">{facet.match}</span>
          {facet.items.map(render)}
        </span>
      </div>
    );
  }
  function ExcFacetRow({ label, items, render }) {
    if (!items.length) return null;
    return <div className="vc-facet"><span className="fl exc">excl. {label}</span><span className="fv">{items.map(render)}</span></div>;
  }

  return (
    <div>
      <div className="set-h">Saved views</div>
      <p className="set-sub">Reusable filters that appear in your sidebar. Each blends include rules (tags, keywords, domains — any or all) with exclusions. {active.length} active.</p>
      <div className="set-toolbar"><div style={{ flex: 1 }}></div><Button variant="brand" size="sm" onClick={startNew}><Icon name="plus" size={14} />New view</Button></div>

      {active.map(v => {
        const empty = !v.include.tags.items.length && !v.include.keywords.items.length && !v.include.domains.items.length && !v.exclude.tags.length && !v.exclude.keywords.length;
        return (
          <div key={v.id} className="view-card">
            <div className="vc-head">
              <span className="dot" style={{ background: `oklch(0.7 0.16 ${v.hue})`, width: 10, height: 10 }}></span>
              <span className="vc-name">{v.name}</span>
              <div style={{ flex: 1 }}></div>
              <button className="icon-btn" title="Edit" onClick={() => startEdit(v)}><Icon name="edit" size={14} /></button>
              <button className="icon-btn danger" title="Delete" onClick={() => softDelete(v.id, true)}><Icon name="trash" size={14} /></button>
            </div>
            <div className="vc-facets">
              <IncFacetRow label="Tags" facet={v.include.tags} render={id => <Tag key={id} id={id} origin="human" />} />
              <IncFacetRow label="Keywords" facet={v.include.keywords} render={k => <span key={k} className="kw-chip">{k}</span>} />
              <IncFacetRow label="Domains" facet={v.include.domains} render={d => <span key={d} className="dom-chip">{d}</span>} />
              <ExcFacetRow label="tags" items={v.exclude.tags} render={id => <Tag key={id} id={id} origin="human" />} />
              <ExcFacetRow label="keywords" items={v.exclude.keywords} render={k => <span key={k} className="kw-chip">{k}</span>} />
              {empty && <span className="hint">Empty view — matches everything.</span>}
            </div>
          </div>
        );
      })}

      {archived.length > 0 && (
        <>
          <div className="noti-group" style={{ marginTop: 20 }}>Deleted</div>
          {archived.map(v => (
            <div key={v.id} className="view-card arch">
              <div className="vc-head">
                <span className="dot" style={{ background: `oklch(0.7 0.16 ${v.hue})`, width: 10, height: 10 }}></span>
                <span className="vc-name">{v.name}</span>
                <div style={{ flex: 1 }}></div>
                <Button variant="ghost" size="sm" onClick={() => softDelete(v.id, false)}><Icon name="undo" size={13} />Restore</Button>
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ============================ PREFS (lighter sections) ============================ */
function IngestionPrefs() {
  const [thresh, setThresh] = useStateSet(70);
  const [dedupe, setDedupe] = useStateSet(true);
  const [canon, setCanon] = useStateSet(true);
  const [paywall, setPaywall] = useStateSet("snapshot");
  const [blocked, setBlocked] = useStateSet(["pinterest.com", "facebook.com"]);
  return (
    <div>
      <div className="set-h">Ingestion</div>
      <p className="set-sub">How links are captured and prepared before they reach your archive.</p>
      <div className="set-card" style={{ marginTop: 20 }}>
        <div className="set-section">
          <div className="row-between"><div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>AI tag confidence threshold</div><span className="mono" style={{ color: "var(--brand)", fontWeight: 600 }}>{thresh}%</span></div>
          <div className="hint" style={{ margin: "6px 0 12px" }}>Tags the model applies below this score are kept but flagged for review in your notifications.</div>
          <input type="range" min="40" max="95" step="5" value={thresh} onChange={e => setThresh(+e.target.value)} style={{ width: "100%", accentColor: "var(--brand)" }} />
        </div>
        <PrefRow label="Deduplicate by URL" hint="Skip links already in the archive (returns 'skipped')."><Toggle on={dedupe} onChange={setDedupe} /></PrefRow>
        <PrefRow label="Canonicalise & follow redirects" hint="Strip tracking params and resolve short links before fetching."><Toggle on={canon} onChange={setCanon} /></PrefRow>
        <PrefRow label="Paywall handling" hint="What to do when a page renders behind a paywall.">
          <select className="select" value={paywall} onChange={e => setPaywall(e.target.value)}>
            <option value="snapshot">Snapshot anyway</option>
            <option value="skip">Skip & mark failed</option>
            <option value="reader">Try reader extraction</option>
          </select>
        </PrefRow>
        <div className="set-section">
          <div style={{ font: "550 13.5px/1.3 var(--font-sans)", marginBottom: 4 }}>Blocked domains</div>
          <div className="hint" style={{ marginBottom: 10 }}>Links from these hosts are ignored on ingest.</div>
          <ChipInput value={blocked} onChange={setBlocked} placeholder="add a domain…" chipClass="dom-chip" />
        </div>
      </div>
    </div>
  );
}

/* voice sample picker — grouped by timbre, plays a sample via the browser TTS */
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function VoicePicker({ value, onChange }) {
  const [open, setOpen] = useStateSet(false);
  const [playing, setPlaying] = useStateSet(null);
  const ref = useRefSet(null);
  useClickOutside(ref, () => setOpen(false));
  const groups = [["feminine", "Feminine"], ["masculine", "Masculine"]];
  const all = [...AURA_VOICES.feminine.map(v => ({ ...v, group: "feminine" })), ...AURA_VOICES.masculine.map(v => ({ ...v, group: "masculine" }))];
  const sel = all.find(v => v.name === value) || all[2];

  function play(v, e) {
    if (e) e.stopPropagation();
    const synth = window.speechSynthesis;
    if (!synth) { setPlaying(v.name); setTimeout(() => setPlaying(null), 1600); return; }
    synth.cancel();
    if (playing === v.name) { setPlaying(null); return; }
    const u = new SpeechSynthesisUtterance(`Hi, I'm ${cap(v.name)}. This is how I'd read your saved articles aloud.`);
    u.lang = v.lang; u.pitch = v.group === "masculine" ? 0.8 : 1.18; u.rate = 1.0;
    const voices = synth.getVoices();
    const m = voices.find(x => x.lang && x.lang.toLowerCase().startsWith(v.lang.toLowerCase())) || voices.find(x => x.lang && x.lang.startsWith("en"));
    if (m) u.voice = m;
    u.onend = () => setPlaying(null);
    setPlaying(v.name); synth.speak(u);
  }
  React.useEffect(() => () => { if (window.speechSynthesis) window.speechSynthesis.cancel(); }, []);

  return (
    <div className="combo" ref={ref} style={{ maxWidth: 460 }}>
      <button className="voice-trigger" onClick={() => setOpen(o => !o)}>
        <button className={`voice-play ${playing === sel.name ? "on" : ""}`} onClick={e => play(sel, e)}><Icon name={playing === sel.name ? "pause" : "play"} size={13} /></button>
        <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
          <div style={{ font: "600 13.5px/1.1 var(--font-sans)" }}>{cap(sel.name)} <span className="hint" style={{ fontWeight: 400 }}>· {sel.accent}</span></div>
          <div className="hint" style={{ marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sel.characteristics.slice(0, 3).join(" · ")}</div>
        </div>
        <Icon name="chevron" size={15} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
      </button>
      {open && (
        <div className="voice-pop">
          {groups.map(([gid, glabel]) => (
            <div key={gid}>
              <div className="voice-group">{glabel} <span className="hint" style={{ fontWeight: 400 }}>· {AURA_VOICES[gid].length} voices</span></div>
              {AURA_VOICES[gid].map(v => {
                const vg = { ...v, group: gid };
                return (
                  <div key={v.name} className={`voice-row ${value === v.name ? "sel" : ""}`} onClick={() => { onChange(v.name); setOpen(false); }}>
                    <button className={`voice-play sm ${playing === v.name ? "on" : ""}`} onClick={e => play(vg, e)}><Icon name={playing === v.name ? "pause" : "play"} size={12} /></button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ font: "600 13px/1 var(--font-sans)" }}>{cap(v.name)}</span>
                        <span className="vbadge">{v.accent}</span>
                        <span className="vbadge muted-b">{v.age}</span>
                      </div>
                      <div className="voice-tags">{v.characteristics.map(c => <span key={c} className="vtag">{c}</span>)}</div>
                      <div className="hint" style={{ marginTop: 4 }}>Good for {v.use_cases.join(", ").toLowerCase()}</div>
                    </div>
                    {value === v.name && <Icon name="check" size={15} style={{ color: "var(--brand)", flexShrink: 0 }} />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AIModelCard({ m }) {
  return (
    <div className="ai-model">
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: "550 13px/1.2 var(--font-sans)" }}>{m.task}</div>
        <div className="mono hint" style={{ marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{m.id}</div>
      </div>
      <span className="badge" style={{ background: "oklch(0.72 0.16 150 / 16%)", color: "var(--ok)", fontSize: 10 }}><span className="dot" style={{ background: "var(--ok)" }}></span>auto</span>
    </div>
  );
}

function AIPrefs() {
  const [autotag, setAutotag] = useStateSet(true);
  const [voice, setVoice] = useStateSet("asteria");
  const [chunk, setChunk] = useStateSet(512);
  const [gateway, setGateway] = useStateSet(false);
  const [gwName, setGwName] = useStateSet("press-gateway");
  const [prov, setProv] = useStateSet({ summary: "workers-ai", vision: "workers-ai" });
  const M = window.WORKERS_AI;
  const PROVS = window.GATEWAY_PROVIDERS;
  const needsKey = prov.summary !== "workers-ai" || prov.vision !== "workers-ai";

  return (
    <div>
      <div className="set-h">AI &amp; Audio</div>
      <p className="set-sub">Models and defaults for tagging, embedding, and narration. Workers AI models are detected automatically from your worker bindings.</p>

      <div className="set-card" style={{ marginTop: 20 }}>
        <div className="set-section">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>Workers AI models</div>
            <Button variant="ghost" size="sm"><Icon name="refresh" size={13} />Re-detect</Button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <AIModelCard m={M.summary} />
            <AIModelCard m={{ ...M.embedding, task: `${M.embedding.task} · ${M.embedding.dims}-dim` }} />
            <AIModelCard m={M.vision} />
          </div>
        </div>
        <PrefRow label="Auto-tag on ingest" hint="Let the model propose tags during processing."><Toggle on={autotag} onChange={setAutotag} /></PrefRow>
        <div className="set-section">
          <div className="row-between"><div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>Chunk size</div><span className="mono" style={{ color: "var(--brand)", fontWeight: 600 }}>{chunk} tok</span></div>
          <div className="hint" style={{ margin: "6px 0 12px" }}>How finely articles are split before embedding. Smaller = more precise retrieval.</div>
          <input type="range" min="256" max="1024" step="128" value={chunk} onChange={e => setChunk(+e.target.value)} style={{ width: "100%", accentColor: "var(--brand)" }} />
        </div>
      </div>

      {/* Audio */}
      <div className="set-card" style={{ marginTop: 18, overflow: "visible" }}>
        <div className="set-section">
          <div className="row-between" style={{ marginBottom: 6 }}>
            <div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>Narration voice</div>
            <span className="badge badge-outline mono" style={{ fontSize: 10 }}>{M.audio.id}</span>
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>Deepgram Aura-2 on Workers AI. Pick a default voice — press play to hear a sample.</div>
          <VoicePicker value={voice} onChange={setVoice} />
        </div>
      </div>

      {/* AI Gateway */}
      <div className="set-card" style={{ marginTop: 18 }}>
        <PrefRow label="Route through AI Gateway" hint="Add caching, rate-limiting, logging, and the option to use providers beyond Workers AI."><Toggle on={gateway} onChange={setGateway} /></PrefRow>
        {gateway && (
          <>
            <div className="set-section">
              <Field label="Gateway name" hint="The AI Gateway slug in your Cloudflare account."><input className="input mono" value={gwName} onChange={e => setGwName(e.target.value)} style={{ maxWidth: 320 }} /></Field>
            </div>
            <div className="set-section">
              <div style={{ font: "550 13px/1.3 var(--font-sans)", marginBottom: 4 }}>Provider per task</div>
              <div className="hint" style={{ marginBottom: 12 }}>Mix Workers AI with external providers. Embeddings stay on Workers AI to keep Vectorize dimensions stable.</div>
              {[["summary", "Tagging & summary"], ["vision", "Screenshot OCR"]].map(([k, label]) => (
                <div key={k} className="row-between" style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 13 }}>{label}</span>
                  <select className="select" value={prov[k]} onChange={e => setProv({ ...prov, [k]: e.target.value })}>
                    {PROVS.map(p => <option key={p.id} value={p.id}>{p.label} — {p.note}</option>)}
                  </select>
                </div>
              ))}
            </div>
            {needsKey && (
              <div className="set-section">
                <Field label="Provider API key" hint="Stored as a worker secret. Required for non-Workers-AI providers.">
                  <input className="input mono" type="password" placeholder="sk-…" style={{ maxWidth: 360 }} />
                </Field>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function NotifPrefs() {
  const [p, setP] = useStateSet({ success: false, failure: true, review: true, digest: true, batch: true, email: false });
  const set = (k, v) => setP({ ...p, [k]: v });
  return (
    <div>
      <div className="set-h">Notifications</div>
      <p className="set-sub">Choose what reaches the bell in the top bar. Failures and reviews are on by default.</p>
      <div className="set-card" style={{ marginTop: 20 }}>
        <PrefRow label="Article archived" hint="Notify on every successful capture (can get noisy)."><Toggle on={p.success} onChange={v => set("success", v)} /></PrefRow>
        <PrefRow label="Processing failed" hint="Render, fetch, or embedding errors."><Toggle on={p.failure} onChange={v => set("failure", v)} /></PrefRow>
        <PrefRow label="Tags need review" hint="When AI applies tags below your confidence threshold."><Toggle on={p.review} onChange={v => set("review", v)} /></PrefRow>
        <PrefRow label="Batch complete" hint="When a share-sheet dump finishes processing."><Toggle on={p.batch} onChange={v => set("batch", v)} /></PrefRow>
        <PrefRow label="Daily & weekly digest" hint="Summary counts of what was archived."><Toggle on={p.digest} onChange={v => set("digest", v)} /></PrefRow>
        <PrefRow label="Also send by email" hint="Mirror notifications to your account email."><Toggle on={p.email} onChange={v => set("email", v)} /></PrefRow>
      </div>
    </div>
  );
}

function AccountPrefsRemoved() { return null; }

/* ============================ SHELL ============================ */
const SET_SECTIONS = [
  { id: "tags", label: "Tags", icon: "tag" },
  { id: "views", label: "Saved views", icon: "layers" },
  { id: "ingestion", label: "Ingestion", icon: "inbox" },
  { id: "ai", label: "AI & Audio", icon: "sparkles" },
  { id: "notifications", label: "Notifications", icon: "bell" },
];

function Settings({ section, setSection, views, setViews, focusNew }) {
  return (
    <div className="settings">
      <nav className="set-nav">
        {SET_SECTIONS.map(s => (
          <button key={s.id} className={`set-nav-item ${section === s.id ? "active" : ""}`} onClick={() => setSection(s.id)}>
            <Icon name={s.icon} size={16} />{s.label}
          </button>
        ))}
      </nav>
      <div className="set-main">
        {section === "tags" && <TagsAdmin />}
        {section === "views" && <ViewsAdmin views={views} setViews={setViews} focusNew={focusNew} />}
        {section === "ingestion" && <IngestionPrefs />}
        {section === "ai" && <AIPrefs />}
        {section === "notifications" && <NotifPrefs />}
      </div>
    </div>
  );
}

Object.assign(window, { Settings });
