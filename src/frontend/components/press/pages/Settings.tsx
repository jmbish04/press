/**
 * @fileoverview Settings page — full-featured config matching v3 reference.
 * Sections: Tags, Sources, Saved Views, Ingestion, AI & Audio, Notifications.
 */
import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Icon } from "../PressIcon";

type Section = "tags" | "sources" | "views" | "ingestion" | "ai" | "notifications";

const SET_SECTIONS: { id: Section; label: string; icon: string }[] = [
  { id: "tags", label: "Tags", icon: "tag" },
  { id: "sources", label: "Sources", icon: "globe" },
  { id: "views", label: "Saved views", icon: "layers" },
  { id: "ingestion", label: "Ingestion", icon: "inbox" },
  { id: "ai", label: "AI & Audio", icon: "sparkles" },
  { id: "notifications", label: "Notifications", icon: "bell" },
];

const HUES = [265, 200, 150, 30, 95, 320, 0, 250, 175, 50];

// ---------------------------------------------------------------------------
// Shared controls
// ---------------------------------------------------------------------------

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`toggle ${on ? "on" : ""}`}
      onClick={() => onChange(!on)}
      aria-pressed={on}
    />
  );
}

function SwatchPick({ hue, onChange }: { hue: number; onChange: (h: number) => void }) {
  return (
    <div className="swatch-pick">
      {HUES.map((h) => (
        <button
          key={h}
          type="button"
          className={hue === h ? "on" : ""}
          style={{ background: `oklch(0.65 0.17 ${h})` }}
          onClick={() => onChange(h)}
        />
      ))}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {hint && <span className="hint">{hint}</span>}
      {children}
    </div>
  );
}

function PrefRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="set-section row-between">
      <div>
        <div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>{label}</div>
        {hint && (
          <div className="hint" style={{ marginTop: 4, maxWidth: 420 }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag types
// ---------------------------------------------------------------------------

interface TagItem {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  hue: number | null;
  isActive: boolean | null;
  archived: boolean | null;
  parentId: number | null;
  articleCount: number;
}

// ---------------------------------------------------------------------------
// camelCase preview helper (mirrors backend normaliseTagName)
// ---------------------------------------------------------------------------

function toCamelCase(raw: string): string {
  const spaced = raw.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  const words = spaced.replace(/[^a-zA-Z0-9 ]+/g, " ").trim().split(/[\s_-]+/).filter(Boolean);
  if (!words.length) return "";
  return words.map((w, i) => i === 0 ? w.toLowerCase() : w[0].toUpperCase() + w.slice(1).toLowerCase()).join("");
}

function childColor(parentHue: number, depth: number, siblingIdx: number): string {
  const L = Math.min(0.84, 0.6 + depth * 0.07 + (siblingIdx % 2) * 0.02);
  const h = parentHue + (siblingIdx * 7 - 7);
  return `oklch(${L.toFixed(2)} 0.15 ${h})`;
}

// ---------------------------------------------------------------------------
// ParentSelect — dropdown for choosing a parent tag
// ---------------------------------------------------------------------------

function ParentSelect({
  tags,
  value,
  exclude,
  onChange,
}: {
  tags: TagItem[];
  value: number | null;
  exclude: number[];
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const opts = tags.filter(
    (t) => !t.archived && !exclude.includes(t.id) && t.parentId == null,
  );
  const selected = tags.find((t) => t.id === value);

  return (
    <div className="parent-select" ref={ref}>
      <button
        type="button"
        className="btn"
        data-variant="outline"
        data-size="sm"
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", justifyContent: "space-between", fontSize: 12 }}
      >
        {selected ? `#${selected.name}` : "None (top-level)"}
        <Icon name="chevron-down" size={13} />
      </button>
      {open && (
        <div className="parent-pop">
          <div
            className="parent-opt"
            onClick={() => { onChange(null); setOpen(false); }}
          >
            <span style={{ color: "var(--muted-foreground)" }}>— None (top-level)</span>
          </div>
          {opts.map((t) => (
            <div
              key={t.id}
              className="parent-opt"
              onClick={() => { onChange(t.id); setOpen(false); }}
            >
              <span
                className="tswatch"
                style={{ background: t.color ?? `oklch(0.7 0.16 ${t.hue ?? 265})` }}
              />
              #{t.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagsAdmin — tree view + sticky editor panel (v3 design)
// ---------------------------------------------------------------------------

function TagsAdmin() {
  const [tags, setTags] = useState<TagItem[]>([]);
  const [q, setQ] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());

  // Editor state
  const [editing, setEditing] = useState<number | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [draftHue, setDraftHue] = useState(265);
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const [draftParentId, setDraftParentId] = useState<number | null>(null);
  const [draftActive, setDraftActive] = useState(true);

  const loadTags = useCallback(() => {
    fetch("/api/tags?flat=true")
      .then((r) => r.json() as Promise<{ tags?: TagItem[] }>)
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadTags(); }, [loadTags]);

  // Build tree from flat tags
  const tree = useMemo(() => {
    const byParent = new Map<number | null, TagItem[]>();
    for (const t of tags) {
      const key = (t as any).parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(t);
    }
    type TreeNode = TagItem & { depth: number; parentId: number | null };
    const result: TreeNode[] = [];
    function walk(parentId: number | null, depth: number) {
      const children = byParent.get(parentId) ?? [];
      children.sort((a, b) => a.name.localeCompare(b.name));
      for (const c of children) {
        result.push({ ...c, depth, parentId: (c as any).parentId ?? null });
        if (!collapsed.has(c.id)) walk(c.id, depth + 1);
      }
    }
    walk(null, 0);
    return result;
  }, [tags, collapsed]);

  const visible = tree.filter(
    (t) =>
      (showInactive || t.isActive !== false) &&
      t.name.toLowerCase().includes(q.toLowerCase()),
  );

  const hasChildren = (id: number) => tags.some((t) => (t as any).parentId === id);

  const toggleCollapse = (id: number) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const startNew = () => {
    setIsNew(true); setEditing(null);
    setDraftName(""); setDraftDesc("");
    setDraftHue(265); setDraftColor(null);
    setDraftParentId(null); setDraftActive(true);
  };

  const startEdit = (t: TagItem & { parentId?: number | null }) => {
    setIsNew(false); setEditing(t.id);
    setDraftName(t.name); setDraftDesc(t.description ?? "");
    setDraftHue(t.hue ?? 265); setDraftColor(t.color);
    setDraftParentId(t.parentId ?? null); setDraftActive(t.isActive !== false);
  };

  const cancelEdit = () => { setEditing(null); setIsNew(false); };

  const save = async () => {
    const name = draftName.trim();
    if (!name) return;
    const body: Record<string, unknown> = {
      name, description: draftDesc || null,
      hue: draftHue, color: draftColor ?? `oklch(0.7 0.16 ${draftHue})`,
      parentId: draftParentId, isActive: draftActive,
    };
    if (isNew) {
      await fetch("/api/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else if (editing != null) {
      await fetch(`/api/tags/${editing}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    }
    cancelEdit(); loadTags();
  };

  const toggleActive = async (id: number, active: boolean) => {
    await fetch(`/api/tags/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: active }) });
    loadTags();
  };

  const camelPreview = toCamelCase(draftName);
  const parentTag = draftParentId ? tags.find((t) => t.id === draftParentId) : null;
  const editorColor = draftColor ?? `oklch(0.7 0.16 ${draftHue})`;

  const getDescendantIds = (id: number): number[] => {
    const children = tags.filter((t) => (t as any).parentId === id);
    const ids: number[] = [];
    for (const c of children) { ids.push(c.id, ...getDescendantIds(c.id)); }
    return ids;
  };
  const excludeIds = editing != null ? [editing, ...getDescendantIds(editing)] : [];

  if (loading) {
    return (<div><div className="set-h">Tags</div><p className="set-sub" style={{ marginTop: 20 }}>Loading tags…</p></div>);
  }

  const activeCount = tags.filter((t) => t.isActive !== false).length;
  const showEditor = isNew || editing != null;

  return (
    <div>
      <div className="set-h">Tags</div>
      <p className="set-sub">
        {activeCount} active tags — names auto-normalise to{" "}
        <code style={{ fontSize: 12, background: "var(--surface)", padding: "1px 5px", borderRadius: 4 }}>#camelCase</code>.
        Create hierarchies by choosing a parent.
      </p>

      <div className="tag-toolbar">
        <div className="search-wrap" style={{ flex: 1, minWidth: 180, position: "relative" }}>
          <Icon name="search" size={15} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input className="input-press" placeholder="Search tags…" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32, height: 36, fontSize: 13, width: "100%" }} />
        </div>
        <button className="btn" data-variant="brand" data-size="sm" onClick={startNew}><Icon name="plus" size={14} /> New tag</button>
      </div>

      <div className="admin-grid">
        {/* Tree view (left) */}
        <div className="tag-tree">
          {visible.map((t) => (
            <div key={t.id} className={`tnode ${t.isActive === false ? "inactive" : ""} ${editing === t.id ? "selected" : ""}`} data-depth={Math.min(t.depth, 2)} onClick={() => startEdit(t)}>
              {hasChildren(t.id) ? (
                <span className="twist" onClick={(e) => { e.stopPropagation(); toggleCollapse(t.id); }}>
                  <Icon name={collapsed.has(t.id) ? "chevron-right" : "chevron-down"} size={14} />
                </span>
              ) : <span className="twist" />}
              <span className="tswatch" style={{ background: t.color ?? `oklch(0.7 0.16 ${t.hue ?? 265})` }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tname"><span className="at">#</span>{t.name}{t.isActive === false && <span className="tbadge" style={{ marginLeft: 8 }}>inactive</span>}</div>
                {t.description && <div className="tdesc">{t.description}</div>}
              </div>
              <span className="tcount">{t.articleCount}</span>
              <div className="tactions">
                <button className="icon-btn" title="Edit" onClick={(e) => { e.stopPropagation(); startEdit(t); }}><Icon name="edit" size={14} /></button>
                {t.isActive !== false ? (
                  <button className="icon-btn danger" title="Mark inactive" onClick={(e) => { e.stopPropagation(); toggleActive(t.id, false); }}><Icon name="archive" size={14} /></button>
                ) : (
                  <button className="icon-btn" title="Reactivate" onClick={(e) => { e.stopPropagation(); toggleActive(t.id, true); }}><Icon name="undo" size={15} /></button>
                )}
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <div className="tnode" style={{ justifyContent: "center", color: "var(--muted-foreground)", fontSize: 13 }}>No tags match.</div>
          )}
        </div>

        {/* Editor panel (right, sticky) */}
        {showEditor ? (
          <div className="editor">
            <h3>{isNew ? "New tag" : "Edit tag"}</h3>
            <div className="ed-sub">{isNew ? "Create a new tag. Names are stored as camelCase." : "Update this tag's name, description, parent, and colour."}</div>

            <div className="field">
              <label>Name</label>
              <input className="input-press" autoFocus placeholder="Tag name…" value={draftName} onChange={(e) => setDraftName(e.target.value)} style={{ height: 36, fontSize: 13, width: "100%" }} />
              {draftName.trim() && <div className="camel-preview">{draftName.trim()} <span className="arrow">→</span> <span className="out">#{camelPreview}</span></div>}
            </div>

            <div className="field">
              <label>Description</label>
              <textarea className="input-press" placeholder="Optional description…" value={draftDesc} onChange={(e) => setDraftDesc(e.target.value)} rows={2} style={{ fontSize: 13, width: "100%", minHeight: 60, padding: "8px 12px", resize: "vertical" }} />
            </div>

            <div className="field">
              <label>Parent tag</label>
              <ParentSelect tags={tags} value={draftParentId} exclude={excludeIds} onChange={(id) => {
                setDraftParentId(id);
                if (id) {
                  const p = tags.find((t) => t.id === id);
                  if (p) { const ph = p.hue ?? 265; setDraftHue(ph); setDraftColor(childColor(ph, 1, tags.filter((t) => (t as any).parentId === id).length)); }
                }
              }} />
            </div>

            <div className="field">
              <label>Colour</label>
              {parentTag ? (
                <>
                  <span className="hint" style={{ display: "block", marginBottom: 8 }}>In-family shades of parent's hue ({parentTag.name})</span>
                  <div className="hue-strip">
                    <span className="lbl">family</span>
                    <span className="fam">
                      {[0, 1, 2, 3, 4, 5].map((idx) => {
                        const c = childColor(parentTag.hue ?? 265, 1, idx);
                        return <span key={idx} className={draftColor === c ? "pick" : ""} style={{ background: c }} onClick={() => setDraftColor(c)} />;
                      })}
                    </span>
                  </div>
                </>
              ) : (
                <div className="swatch-row">
                  {HUES.map((h) => (
                    <button key={h} type="button" className={draftHue === h ? "on" : ""} style={{ background: `oklch(0.65 0.17 ${h})` }} onClick={() => { setDraftHue(h); setDraftColor(`oklch(0.7 0.16 ${h})`); }} />
                  ))}
                </div>
              )}
            </div>

            <div className="field"><label>Active</label><Toggle on={draftActive} onChange={setDraftActive} /></div>

            <div className="field" style={{ marginTop: 16 }}>
              <label>Preview</label>
              <span className="preview-chip" style={{ background: `color-mix(in oklab, ${editorColor} 22%, transparent)`, color: `color-mix(in oklab, ${editorColor} 70%, white)`, border: `1px solid color-mix(in oklab, ${editorColor} 35%, transparent)` }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: editorColor }} />#{camelPreview || "tagName"}
              </span>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
              <button className="btn" data-variant="brand" data-size="sm" onClick={save}>{isNew ? "Create tag" : "Save changes"}</button>
              <button className="btn" data-variant="ghost" data-size="sm" onClick={cancelEdit}>Cancel</button>
              {!isNew && editing != null && (
                <button className="btn" data-variant="ghost" data-size="sm" style={{ marginLeft: "auto", color: "var(--err)" }} onClick={() => { toggleActive(editing, false); cancelEdit(); }}>Mark inactive</button>
              )}
            </div>
          </div>
        ) : (
          <div className="editor" style={{ opacity: 0.6, textAlign: "center", padding: "40px 18px" }}>
            <Icon name="edit" size={24} style={{ color: "var(--muted-foreground)" }} />
            <div style={{ marginTop: 12, fontSize: 13, color: "var(--muted-foreground)" }}>Select a tag to edit, or create a new one</div>
          </div>
        )}
      </div>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 9, marginTop: 14, cursor: "pointer", fontSize: 13 }}>
        <Toggle on={showInactive} onChange={setShowInactive} />
        Show inactive tags
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TagMulti — multi-select for tag selection in view editor
// ---------------------------------------------------------------------------

function TagMulti({
  selected,
  tags,
  onChange,
}: {
  selected: number[];
  tags: TagItem[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const active = tags.filter((t) => !t.archived);
  const matches = active.filter(
    (t) =>
      t.name.toLowerCase().includes(q.toLowerCase()) &&
      !selected.includes(t.id),
  );

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
        {selected.map((id) => {
          const t = tags.find((x) => x.id === id);
          if (!t) return null;
          return (
            <span key={id} className="chip tagchip" style={{ fontSize: 12 }}>
              <span
                className="dot"
                style={{
                  background: t.color ?? "var(--brand)",
                  width: 6,
                  height: 6,
                }}
              />
              {t.name}
              <span
                className="x"
                style={{ cursor: "pointer", marginLeft: 4, opacity: 0.6 }}
                onClick={() => onChange(selected.filter((x) => x !== id))}
              >
                <Icon name="x" size={11} />
              </span>
            </span>
          );
        })}
        {selected.length === 0 && (
          <span className="hint" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            No tags yet
          </span>
        )}
      </div>
      <div className="combo" ref={ref} style={{ maxWidth: 280, position: "relative" }}>
        <button
          type="button"
          className="btn"
          data-variant="ghost"
          data-size="sm"
          onClick={() => setOpen((o) => !o)}
        >
          <Icon name="plus" size={14} />
          Add tag
        </button>
        {open && (
          <div className="combo-pop" style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, width: 240, background: "var(--popover)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-lg)", padding: 4, maxHeight: 260, overflowY: "auto" }}>
            <input
              className="input-press"
              autoFocus
              placeholder="Search tags…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              style={{ height: 32, fontSize: 12, marginBottom: 4, width: "100%" }}
            />
            {matches.map((t) => (
              <div
                key={t.id}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: 13 }}
                onClick={() => {
                  onChange([...selected, t.id]);
                  setQ("");
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = "var(--accent)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "")}
              >
                <span className="dot" style={{ background: t.color ?? "var(--brand)", width: 7, height: 7 }} />
                {t.name}
              </div>
            ))}
            {matches.length === 0 && (
              <div style={{ padding: "6px 8px", color: "var(--muted-foreground)", fontSize: 12 }}>
                No matches
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChipInput — freeform keyword/domain chip entry
// ---------------------------------------------------------------------------

function ChipInput({
  value,
  onChange,
  placeholder,
  chipClass = "kw-chip",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  chipClass?: string;
}) {
  const [v, setV] = useState("");
  const add = () => {
    const t = v.trim().replace(/^https?:\/\//, "").replace(/\/$/, "");
    if (t && !value.includes(t)) onChange([...value, t]);
    setV("");
  };
  return (
    <div className="chip-input">
      {value.map((item) => (
        <span key={item} className={chipClass}>
          {item}
          <span
            className="x"
            onClick={() => onChange(value.filter((x) => x !== item))}
          >
            <Icon name="x" size={11} />
          </span>
        </span>
      ))}
      <input
        value={v}
        placeholder={value.length ? "" : placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !v && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// SavedViewsAdmin — CRUD for reusable filter presets
// ---------------------------------------------------------------------------

interface SavedView {
  id: string;
  name: string;
  hue: number;
  includeFacets: string;
  excludeFacets: string;
  deleted: boolean;
}

interface IncFacets {
  tags: { match: "any" | "all"; items: number[] };
  keywords: { match: "any" | "all"; items: string[] };
  domains: { match: "any" | "all"; items: string[] };
}

interface ExcFacets {
  tags: number[];
  keywords: string[];
}

const BLANK_INC: IncFacets = {
  tags: { match: "any", items: [] },
  keywords: { match: "any", items: [] },
  domains: { match: "any", items: [] },
};
const BLANK_EXC: ExcFacets = { tags: [], keywords: [] };

function MatchSeg({
  value,
  onChange,
}: {
  value: "any" | "all";
  onChange: (v: "any" | "all") => void;
}) {
  return (
    <div className="seg matchseg" style={{ display: "inline-flex", background: "var(--muted)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
      <button
        className={`btn ${value === "any" ? "" : ""}`}
        data-variant={value === "any" ? "brand" : "ghost"}
        data-size="sm"
        style={{ fontSize: 11, height: 24, padding: "0 10px", borderRadius: 0 }}
        onClick={() => onChange("any")}
      >
        Any
      </button>
      <button
        className={`btn`}
        data-variant={value === "all" ? "brand" : "ghost"}
        data-size="sm"
        style={{ fontSize: 11, height: 24, padding: "0 10px", borderRadius: 0 }}
        onClick={() => onChange("all")}
      >
        All
      </button>
    </div>
  );
}

function SavedViewsAdmin() {
  const [views, setViews] = useState<SavedView[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftHue, setDraftHue] = useState(265);
  const [draftInc, setDraftInc] = useState<IncFacets>(BLANK_INC);
  const [draftExc, setDraftExc] = useState<ExcFacets>(BLANK_EXC);
  const [draftId, setDraftId] = useState<string | null>(null);

  const loadViews = useCallback(() => {
    fetch("/api/views")
      .then((r) => r.json() as Promise<{ views?: SavedView[] }>)
      .then((d) => setViews(d.views ?? []))
      .catch(() => {});
  }, []);

  const loadTags = useCallback(() => {
    fetch("/api/tags")
      .then((r) => r.json() as Promise<{ tags?: TagItem[] }>)
      .then((d) => setAllTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadViews();
    loadTags();
  }, [loadViews, loadTags]);

  const startNew = () => {
    setDraftId(null);
    setDraftName("");
    setDraftHue(265);
    setDraftInc(BLANK_INC);
    setDraftExc(BLANK_EXC);
    setEditing("new");
  };

  const startEdit = (v: SavedView) => {
    setDraftId(v.id);
    setDraftName(v.name);
    setDraftHue(v.hue);
    try {
      setDraftInc(JSON.parse(v.includeFacets));
    } catch {
      setDraftInc(BLANK_INC);
    }
    try {
      setDraftExc(JSON.parse(v.excludeFacets));
    } catch {
      setDraftExc(BLANK_EXC);
    }
    setEditing(v.id);
  };

  const save = async () => {
    if (!draftName.trim()) return;
    const body = {
      name: draftName,
      hue: draftHue,
      includeFacets: JSON.stringify(draftInc),
      excludeFacets: JSON.stringify(draftExc),
    };
    if (draftId) {
      await fetch(`/api/views/${draftId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    setEditing(null);
    loadViews();
  };

  const softDelete = async (id: string) => {
    await fetch(`/api/views/${id}`, { method: "DELETE" });
    loadViews();
  };

  const restore = async (id: string) => {
    await fetch(`/api/views/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deleted: false }),
    });
    loadViews();
  };

  const setInc = (key: keyof IncFacets, val: IncFacets[keyof IncFacets]) =>
    setDraftInc({ ...draftInc, [key]: val });
  const setExcField = (key: keyof ExcFacets, val: ExcFacets[keyof ExcFacets]) =>
    setDraftExc({ ...draftExc, [key]: val });

  // View editor
  if (editing) {
    const isNew = !draftId;
    return (
      <div>
        <div className="set-h">{isNew ? "New saved view" : "Edit view"}</div>
        <p className="set-sub">
          A view is a live filter. Each include facet matches <strong>any</strong> or{" "}
          <strong>all</strong> of its entries; the exclude facets hide anything matching{" "}
          <strong>none-of</strong> rules.
        </p>
        <div className="set-card" style={{ padding: 20, marginTop: 20, overflow: "visible" }}>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
            <Field label="Name">
              <input
                className="input-press"
                autoFocus
                placeholder="e.g. Interview prep"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                style={{ width: 280, height: 36, fontSize: 13 }}
              />
            </Field>
            <Field label="Colour">
              <SwatchPick hue={draftHue} onChange={setDraftHue} />
            </Field>
          </div>

          <div className="facet-section-h">
            <span className="dot" style={{ background: "var(--ok)" }} />
            Include
          </div>

          {/* Include Tags */}
          <div className="facet-block">
            <div className="facet-head">
              <Icon name="tag" size={14} style={{ color: "var(--muted-foreground)" }} />
              <span className="facet-label">Tags</span>
              <span className="facet-logic">match</span>
              <MatchSeg
                value={draftInc.tags.match}
                onChange={(m) => setInc("tags", { ...draftInc.tags, match: m })}
              />
            </div>
            <TagMulti
              selected={draftInc.tags.items}
              tags={allTags}
              onChange={(items) => setInc("tags", { ...draftInc.tags, items })}
            />
          </div>

          {/* Include Keywords */}
          <div className="facet-block">
            <div className="facet-head">
              <Icon name="hash" size={14} style={{ color: "var(--muted-foreground)" }} />
              <span className="facet-label">Keywords</span>
              <span className="facet-logic">match</span>
              <MatchSeg
                value={draftInc.keywords.match}
                onChange={(m) => setInc("keywords", { ...draftInc.keywords, match: m })}
              />
            </div>
            <ChipInput
              value={draftInc.keywords.items}
              onChange={(items) => setInc("keywords", { ...draftInc.keywords, items })}
              placeholder="add a keyword…"
            />
          </div>

          {/* Include Domains */}
          <div className="facet-block">
            <div className="facet-head">
              <Icon name="globe" size={14} style={{ color: "var(--muted-foreground)" }} />
              <span className="facet-label">Source domains</span>
              <span className="facet-logic">match</span>
              <MatchSeg
                value={draftInc.domains.match}
                onChange={(m) => setInc("domains", { ...draftInc.domains, match: m })}
              />
            </div>
            <ChipInput
              value={draftInc.domains.items}
              onChange={(items) => setInc("domains", { ...draftInc.domains, items })}
              placeholder="e.g. cnn.com…"
              chipClass="dom-chip"
            />
          </div>

          <div className="facet-section-h">
            <span className="dot" style={{ background: "var(--err)" }} />
            Exclude{" "}
            <span className="hint" style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
              — hide articles matching none-of these
            </span>
          </div>

          {/* Exclude Tags */}
          <div className="facet-block">
            <div className="facet-head">
              <Icon name="tag" size={14} style={{ color: "var(--muted-foreground)" }} />
              <span className="facet-label">None of these tags</span>
            </div>
            <TagMulti
              selected={draftExc.tags}
              tags={allTags}
              onChange={(items) => setExcField("tags", items)}
            />
          </div>

          {/* Exclude Keywords */}
          <div className="facet-block">
            <div className="facet-head">
              <Icon name="hash" size={14} style={{ color: "var(--muted-foreground)" }} />
              <span className="facet-label">None of these keywords</span>
            </div>
            <ChipInput
              value={draftExc.keywords}
              onChange={(items) => setExcField("keywords", items)}
              placeholder="add an excluded keyword…"
            />
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
            <button
              className="btn"
              data-variant="brand"
              data-size="sm"
              onClick={save}
              disabled={!draftName.trim()}
            >
              <Icon name="check" size={14} />
              Save view
            </button>
            <button
              className="btn"
              data-variant="ghost"
              data-size="sm"
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  // View list
  const activeViews = views.filter((v) => !v.deleted);

  return (
    <div>
      <div className="set-h">Saved views</div>
      <p className="set-sub">
        Reusable filters that appear in your sidebar. Each blends include rules
        (tags, keywords, domains — any or all) with exclusions. {activeViews.length}{" "}
        active.
      </p>
      <div className="set-toolbar">
        <div style={{ flex: 1 }} />
        <button className="btn" data-variant="brand" data-size="sm" onClick={startNew}>
          <Icon name="plus" size={14} />
          New view
        </button>
      </div>

      {activeViews.map((v) => {
        let inc: IncFacets;
        let exc: ExcFacets;
        try { inc = JSON.parse(v.includeFacets); } catch { inc = BLANK_INC; }
        try { exc = JSON.parse(v.excludeFacets); } catch { exc = BLANK_EXC; }
        const empty =
          !inc.tags.items.length &&
          !inc.keywords.items.length &&
          !inc.domains.items.length &&
          !exc.tags.length &&
          !exc.keywords.length;

        return (
          <div key={v.id} className="view-card">
            <div className="vc-head">
              <span
                className="dot"
                style={{ background: `oklch(0.7 0.16 ${v.hue})`, width: 10, height: 10 }}
              />
              <span className="vc-name">{v.name}</span>
              <div style={{ flex: 1 }} />
              <button className="icon-btn" title="Edit" onClick={() => startEdit(v)}>
                <Icon name="edit" size={14} />
              </button>
              <button
                className="icon-btn danger"
                title="Delete"
                onClick={() => softDelete(v.id)}
              >
                <Icon name="trash" size={14} />
              </button>
            </div>
            <div className="vc-facets">
              {inc.tags.items.length > 0 && (
                <div className="vc-facet">
                  <span className="fl">Tags</span>
                  <span className="fv">
                    <span className="match-pill">{inc.tags.match}</span>
                    {inc.tags.items.map((id) => {
                      const t = allTags.find((x) => x.id === id);
                      return (
                        <span key={id} className="chip tagchip" style={{ fontSize: 11 }}>
                          <span className="dot" style={{ background: t?.color ?? "var(--brand)", width: 5, height: 5 }} />
                          {t?.name ?? `#${id}`}
                        </span>
                      );
                    })}
                  </span>
                </div>
              )}
              {inc.keywords.items.length > 0 && (
                <div className="vc-facet">
                  <span className="fl">Keywords</span>
                  <span className="fv">
                    <span className="match-pill">{inc.keywords.match}</span>
                    {inc.keywords.items.map((k) => (
                      <span key={k} className="kw-chip">{k}</span>
                    ))}
                  </span>
                </div>
              )}
              {inc.domains.items.length > 0 && (
                <div className="vc-facet">
                  <span className="fl">Domains</span>
                  <span className="fv">
                    <span className="match-pill">{inc.domains.match}</span>
                    {inc.domains.items.map((d) => (
                      <span key={d} className="dom-chip">{d}</span>
                    ))}
                  </span>
                </div>
              )}
              {exc.tags.length > 0 && (
                <div className="vc-facet">
                  <span className="fl exc">excl. tags</span>
                  <span className="fv">
                    {exc.tags.map((id) => {
                      const t = allTags.find((x) => x.id === id);
                      return (
                        <span key={id} className="chip tagchip" style={{ fontSize: 11 }}>
                          <span className="dot" style={{ background: t?.color ?? "var(--brand)", width: 5, height: 5 }} />
                          {t?.name ?? `#${id}`}
                        </span>
                      );
                    })}
                  </span>
                </div>
              )}
              {exc.keywords.length > 0 && (
                <div className="vc-facet">
                  <span className="fl exc">excl. keywords</span>
                  <span className="fv">
                    {exc.keywords.map((k) => (
                      <span key={k} className="kw-chip">{k}</span>
                    ))}
                  </span>
                </div>
              )}
              {empty && (
                <span className="hint" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  Empty view — matches everything.
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IngestionPrefs
// ---------------------------------------------------------------------------

function IngestionPrefs({
  prefs,
  savePref,
}: {
  prefs: Record<string, unknown>;
  savePref: (key: string, value: unknown) => Promise<void>;
}) {
  const thresh = (prefs.tagConfidence as number) ?? 70;
  const dedupe = prefs.deduplicate !== false;
  const canon = prefs.canonicalize !== false;

  return (
    <div>
      <div className="set-h">Ingestion</div>
      <p className="set-sub">
        How links are captured and prepared before they reach your archive.
      </p>
      <div className="set-card" style={{ marginTop: 20 }}>
        <div className="set-section">
          <div className="row-between">
            <div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>
              AI tag confidence threshold
            </div>
            <span
              className="mono"
              style={{ color: "var(--brand)", fontWeight: 600, fontFamily: "var(--font-mono)" }}
            >
              {thresh}%
            </span>
          </div>
          <div className="hint" style={{ margin: "6px 0 12px" }}>
            Tags the model applies below this score are kept but flagged for review.
          </div>
          <input
            type="range"
            min="40"
            max="95"
            step="5"
            value={thresh}
            onChange={(e) => savePref("tagConfidence", +e.target.value)}
            style={{ width: "100%", accentColor: "var(--brand)" }}
          />
        </div>
        <PrefRow label="Deduplicate by URL" hint="Skip links already in the archive.">
          <Toggle on={dedupe} onChange={(v) => savePref("deduplicate", v)} />
        </PrefRow>
        <PrefRow
          label="Canonicalise & follow redirects"
          hint="Strip tracking params and resolve short links before fetching."
        >
          <Toggle on={canon} onChange={(v) => savePref("canonicalize", v)} />
        </PrefRow>
        <PrefRow label="Auto-generate mind maps" hint="Automatically create a mind map during article ingestion.">
          <Toggle
            on={prefs.autoMindmap !== false}
            onChange={(v) => savePref("autoMindmap", v)}
          />
        </PrefRow>
        <PrefRow label="Auto-generate audio narration" hint="Automatically generate TTS audio after article ingestion.">
          <Toggle
            on={!!prefs.autoNarrate}
            onChange={(v) => savePref("autoNarrate", v)}
          />
        </PrefRow>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AIPrefs — voice picker, model display, chunk size
// ---------------------------------------------------------------------------

interface Voice {
  id: string;
  name: string;
  gender: string;
  age?: string;
  accent?: string;
  language?: string;
  characteristics?: readonly string[];
  useCases?: readonly string[];
}

function AIPrefs({
  prefs,
  savePref,
}: {
  prefs: Record<string, unknown>;
  savePref: (key: string, value: unknown) => Promise<void>;
}) {
  const [voices, setVoices] = useState<Voice[]>([]);
  const [loading, setLoading] = useState(true);
  const [voicePickerOpen, setVoicePickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedVoice = (prefs.voice as string) ?? "asteria";
  const autoTag = prefs.autoTag !== false;

  useEffect(() => {
    fetch("/api/articles/voices")
      .then((r) => r.json() as Promise<{ voices?: Voice[] }>)
      .then((d) => setVoices(d.voices ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
        setVoicePickerOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const sel = voices.find((v) => v.id === selectedVoice) ?? voices[0];
  const groups: ["female" | "male", string][] = [
    ["female", "Feminine"],
    ["male", "Masculine"],
  ];

  return (
    <div>
      <div className="set-h">AI & Audio</div>
      <p className="set-sub">
        Models and defaults for tagging, embedding, and narration. Workers AI
        models are detected automatically from your worker bindings.
      </p>

      <div className="set-card" style={{ marginTop: 20 }}>
        <div className="set-section">
          <div className="row-between" style={{ marginBottom: 12 }}>
            <div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>
              Workers AI models
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { task: "Tagging & summary", id: "@cf/meta/llama-3.1-70b-instruct" },
              { task: "Embedding · 768-dim", id: "@cf/baai/bge-base-en-v1.5" },
              { task: "Narration", id: "@cf/deepgram/aura-2" },
            ].map((m) => (
              <div key={m.task} className="ai-model">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ font: "550 13px/1.2 var(--font-sans)" }}>{m.task}</div>
                  <div
                    className="hint"
                    style={{
                      marginTop: 4,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      fontFamily: "var(--font-mono)",
                      fontSize: 11,
                    }}
                  >
                    {m.id}
                  </div>
                </div>
                <span
                  className="badge"
                  style={{
                    background: "oklch(0.72 0.16 150 / 16%)",
                    color: "var(--ok)",
                    fontSize: 10,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "2px 8px",
                    borderRadius: 4,
                  }}
                >
                  <span className="dot" style={{ background: "var(--ok)", width: 5, height: 5 }} />
                  auto
                </span>
              </div>
            ))}
          </div>
        </div>
        <PrefRow label="Auto-tag on ingest" hint="Let the model propose tags during processing.">
          <Toggle on={autoTag} onChange={(v) => savePref("autoTag", v)} />
        </PrefRow>
      </div>

      {/* Voice picker */}
      <div className="set-card" style={{ marginTop: 18, overflow: "visible" }}>
        <div className="set-section" style={{ overflow: "visible" }}>
          <div className="row-between" style={{ marginBottom: 6 }}>
            <div style={{ font: "550 13.5px/1.3 var(--font-sans)" }}>
              Narration voice
            </div>
          </div>
          <div className="hint" style={{ marginBottom: 12 }}>
            Deepgram Aura-2 on Workers AI. Pick a default voice.
          </div>
          {loading ? (
            <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
              Loading voices…
            </div>
          ) : (
            <div className="combo" ref={pickerRef} style={{ maxWidth: 460, position: "relative" }}>
              <button
                className="voice-trigger"
                onClick={() => setVoicePickerOpen((o) => !o)}
              >
                <div
                  className="voice-play"
                  style={{ width: 30, height: 30, pointerEvents: "none" }}
                >
                  <Icon name="play" size={13} />
                </div>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div style={{ font: "600 13.5px/1.1 var(--font-sans)" }}>
                    {sel?.name ?? "No voice"}{" "}
                    <span className="hint" style={{ fontWeight: 400 }}>
                      · {sel?.accent ?? sel?.language ?? ""}
                    </span>
                  </div>
                  {sel?.characteristics && (
                    <div
                      className="hint"
                      style={{
                        marginTop: 3,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {sel.characteristics.slice(0, 3).join(" · ")}
                    </div>
                  )}
                </div>
                <Icon
                  name="chevron"
                  size={15}
                  style={{ color: "var(--muted-foreground)", flexShrink: 0 }}
                />
              </button>
              {voicePickerOpen && (
                <div className="voice-pop">
                  {groups.map(([gid, glabel]) => {
                    const gvoices = voices.filter((v) => v.gender === gid);
                    if (gvoices.length === 0) return null;
                    return (
                      <div key={gid}>
                        <div className="voice-group">
                          {glabel}{" "}
                          <span className="hint" style={{ fontWeight: 400 }}>
                            · {gvoices.length} voices
                          </span>
                        </div>
                        {gvoices.map((v) => (
                          <div
                            key={v.id}
                            className={`voice-row ${selectedVoice === v.id ? "sel" : ""}`}
                            onClick={() => {
                              savePref("voice", v.id);
                              setVoicePickerOpen(false);
                            }}
                          >
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 7,
                                }}
                              >
                                <span
                                  style={{ font: "600 13px/1 var(--font-sans)" }}
                                >
                                  {v.name}
                                </span>
                                <span className="vbadge">{v.accent ?? v.language}</span>
                                {v.age && (
                                  <span className="vbadge muted-b">{v.age}</span>
                                )}
                              </div>
                              {v.characteristics && v.characteristics.length > 0 && (
                                <div className="voice-tags">
                                  {v.characteristics.map((c) => (
                                    <span key={c} className="vtag">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {v.useCases && v.useCases.length > 0 && (
                                <div
                                  className="hint"
                                  style={{ marginTop: 4 }}
                                >
                                  Good for {v.useCases.join(", ").toLowerCase()}
                                </div>
                              )}
                            </div>
                            {selectedVoice === v.id && (
                              <Icon
                                name="check"
                                size={15}
                                style={{ color: "var(--brand)", flexShrink: 0 }}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationPrefs
// ---------------------------------------------------------------------------

function NotificationPrefs({
  prefs,
  savePref,
}: {
  prefs: Record<string, unknown>;
  savePref: (key: string, value: unknown) => Promise<void>;
}) {
  const get = (k: string, def: boolean) => (prefs[k] as boolean | undefined) ?? def;

  return (
    <div>
      <div className="set-h">Notifications</div>
      <p className="set-sub">
        Choose what reaches the bell in the top bar. Failures and reviews are on
        by default.
      </p>
      <div className="set-card" style={{ marginTop: 20 }}>
        <PrefRow
          label="Article archived"
          hint="Notify on every successful capture (can get noisy)."
        >
          <Toggle on={get("notifySuccess", false)} onChange={(v) => savePref("notifySuccess", v)} />
        </PrefRow>
        <PrefRow label="Processing failed" hint="Render, fetch, or embedding errors.">
          <Toggle on={get("notifyFailure", true)} onChange={(v) => savePref("notifyFailure", v)} />
        </PrefRow>
        <PrefRow
          label="Tags need review"
          hint="When AI applies tags below your confidence threshold."
        >
          <Toggle on={get("notifyReview", true)} onChange={(v) => savePref("notifyReview", v)} />
        </PrefRow>
        <PrefRow label="Batch complete" hint="When a share-sheet dump finishes processing.">
          <Toggle on={get("notifyBatch", true)} onChange={(v) => savePref("notifyBatch", v)} />
        </PrefRow>
        <PrefRow label="Daily & weekly digest" hint="Summary counts of what was archived.">
          <Toggle on={get("notifyDigest", true)} onChange={(v) => savePref("notifyDigest", v)} />
        </PrefRow>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings page shell
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// FACE_FONT map for live preview
// ---------------------------------------------------------------------------
const FACE_FONT: Record<string, string> = {
  serif: '"Newsreader", Georgia, serif',
  grotesque: '"Archivo", "Geist", sans-serif',
  condensed: '"Archivo Narrow", "Arial Narrow", sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  slab: '"Roboto Slab", Georgia, serif',
};
const FACES = ["serif", "grotesque", "condensed", "mono", "slab"] as const;

// ---------------------------------------------------------------------------
// SourcesAdmin — publication style profile editor (v3)
// ---------------------------------------------------------------------------

interface SourceItem {
  id: number;
  key: string;
  name: string;
  accent: string | null;
  ink: string | null;
  bg: string | null;
  short: string | null;
  face: string | null;
  articleCount: number;
}

function SourcesAdmin() {
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    fetch("/api/sources")
      .then((r) => r.json() as Promise<{ sources?: SourceItem[] }>)
      .then((d) => setSources(d.sources ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateSource = async (id: number, updates: Record<string, unknown>) => {
    await fetch(`/api/sources/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    load();
  };

  if (loading) {
    return (
      <div>
        <div className="set-h">Sources</div>
        <p className="set-sub" style={{ marginTop: 20 }}>Loading sources…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="set-h">Sources</div>
      <p className="set-sub">
        {sources.length} publication sources. Each source's style profile (accent,
        typeface, ink) applies consistently across all its Newsstand cards.
      </p>

      <div className="source-list">
        {sources.map((s) => {
          const accent = s.accent ?? "#333";
          const ink = s.ink ?? "#fff";
          const face = s.face ?? "serif";

          return (
            <div key={s.id} className="source-card">
              {/* Live masthead preview */}
              <div
                className="masthead"
                style={{
                  "--src-accent": accent,
                  "--src-ink": ink,
                  "--src-face": FACE_FONT[face] ?? FACE_FONT.serif,
                  background: accent,
                  color: ink,
                } as React.CSSProperties}
              >
                <span className={`mh-name ${face}`}>{s.name}</span>
              </div>

              <div className="source-body">
                <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 120 }}>
                  <span className="source-name">{s.name}</span>
                  <span className="source-key">{s.key}</span>
                </div>

                <span className="source-count">{s.articleCount} articles</span>

                {/* Face selector */}
                <div className="face-seg">
                  {FACES.map((f) => (
                    <button
                      key={f}
                      className={face === f ? "active" : ""}
                      onClick={() => updateSource(s.id, { face: f })}
                    >
                      {f}
                    </button>
                  ))}
                </div>

                {/* Ink toggle */}
                <button
                  className="btn"
                  data-variant="outline"
                  data-size="sm"
                  style={{ fontSize: 11 }}
                  onClick={() => updateSource(s.id, { ink: ink === "#fff" ? "#111" : "#fff" })}
                  title="Toggle ink colour (light/dark text on masthead)"
                >
                  Ink: {ink === "#fff" ? "light" : "dark"}
                </button>

                {/* Accent swatch */}
                <div className="swatch-row" style={{ gap: 4 }}>
                  {HUES.slice(0, 6).map((h) => {
                    const c = `oklch(0.5 0.18 ${h})`;
                    return (
                      <button
                        key={h}
                        type="button"
                        className={accent.includes(String(h)) ? "on" : ""}
                        style={{ background: c, width: 20, height: 20 }}
                        onClick={() => updateSource(s.id, { accent: c })}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}

        {sources.length === 0 && (
          <div className="muted" style={{ padding: 40, textAlign: "center" }}>
            No sources yet — ingest some articles to populate this list.
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Settings — main component
// ---------------------------------------------------------------------------

export default function Settings() {
  const [section, setSection] = useState<Section>("tags");
  const [prefs, setPrefs] = useState<Record<string, unknown>>({});

  useEffect(() => {
    fetch("/api/preferences")
      .then((r) => r.json() as Promise<{ preferences?: Record<string, unknown> }>)
      .then((d) => setPrefs(d.preferences ?? {}))
      .catch(() => {});
  }, []);

  const savePref = async (key: string, value: unknown) => {
    setPrefs((p) => ({ ...p, [key]: value }));
    await fetch(`/api/preferences/${key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  };

  return (
    <div className="settings">
      <nav className="set-nav">
        {SET_SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`set-nav-item ${section === s.id ? "active" : ""}`}
            onClick={() => setSection(s.id)}
          >
            <Icon name={s.icon} size={16} />
            {s.label}
          </button>
        ))}
      </nav>
      <div className="set-main">
        {section === "tags" && <TagsAdmin />}
        {section === "sources" && <SourcesAdmin />}
        {section === "views" && <SavedViewsAdmin />}
        {section === "ingestion" && <IngestionPrefs prefs={prefs} savePref={savePref} />}
        {section === "ai" && <AIPrefs prefs={prefs} savePref={savePref} />}
        {section === "notifications" && <NotificationPrefs prefs={prefs} savePref={savePref} />}
      </div>
    </div>
  );
}
