/* global React, window, SOURCES, TAGS, CATEGORIES */
const { useState, useRef, useEffect, useCallback } = React;

/* ---------- Icons (Lucide paths, 24-grid) ---------- */
const I = {
  inbox: ["M22 12h-6l-2 3h-4l-2-3H2", "M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"],
  stand: ["M3 3v18h18", "M7 14l3-3 3 2 4-5", "M7 7h.01"],
  grid: ["M3 3h7v7H3z","M14 3h7v7h-7z","M14 14h7v7h-7z","M3 14h7v7H3z"],
  book: ["M4 19.5A2.5 2.5 0 0 1 6.5 17H20", "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  activity: ["M22 12h-4l-3 9L9 3l-3 9H2"],
  search: ["m21 21-4.3-4.3", "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z"],
  menu: ["M4 12h16","M4 6h16","M4 18h16"],
  sidebar: ["M3 3h18v18H3z","M9 3v18"],
  bell: ["M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9", "M13.7 21a2 2 0 0 1-3.4 0"],
  plus: ["M12 5v14", "M5 12h14"],
  check: ["M20 6 9 17l-5-5"],
  chevron: ["m6 9 6 6 6-6"],
  chevronR: ["m9 18 6-6-6-6"],
  x: ["M18 6 6 18", "M6 6l12 12"],
  arrowRight: ["M5 12h14", "m12 5 7 7-7 7"],
  arrowUp: ["m5 12 7-7 7 7", "M12 19V5"],
  ext: ["M15 3h6v6", "M10 14 21 3", "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"],
  clock: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z", "M12 6v6l4 2"],
  play: ["M6 3l14 9-14 9z"],
  pause: ["M6 4h4v16H6z","M14 4h4v16h-4z"],
  volume: ["M11 5 6 9H2v6h4l5 4z", "M19.07 4.93a10 10 0 0 1 0 14.14", "M15.54 8.46a5 5 0 0 1 0 7.07"],
  doc: ["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6"],
  image: ["M3 3h18v18H3z","M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z","m21 15-5-5L5 21"],
  code: ["m16 18 6-6-6-6","m8 6-6 6 6 6"],
  sparkles: ["M12 3l1.9 5.8L19.5 11l-5.6 2.2L12 19l-1.9-5.8L4.5 11l5.6-2.2z"],
  send: ["m22 2-7 20-4-9-9-4z","M22 2 11 13"],
  filter: ["M22 3H2l8 9.46V19l4 2v-8.54z"],
  trash: ["M3 6h18","M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"],
  tag: ["M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.41l8.83 8.83a2 2 0 0 0 2.83 0l7.17-7.17a2 2 0 0 0 0-2.83z", "M7 7h.01"],
  refresh: ["M3 12a9 9 0 0 1 15-6.7L21 8", "M21 3v5h-5", "M21 12a9 9 0 0 1-15 6.7L3 16", "M3 21v-5h5"],
  alert: ["M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z", "M12 9v4", "M12 17h.01"],
  zap: ["M13 2 3 14h9l-1 8 10-12h-9z"],
  cpu: ["M4 4h16v16H4z","M9 9h6v6H9z","M9 1v3","M15 1v3","M9 20v3","M15 20v3","M20 9h3","M20 14h3","M1 9h3","M1 14h3"],
  link: ["M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5","M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5"],
  download: ["M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4","M7 10l5 5 5-5","M12 15V3"],
  layers: ["m12 2 9 5-9 5-9-5z","m3 12 9 5 9-5","m3 17 9 5 9-5"],
  globe: ["M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z","M2 12h20","M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"],
  copy: ["M9 9h11v11H9z","M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"],
  type: ["M4 7V5h16v2","M9 19h6","M12 5v14"],
  settings: ["M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z", "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"],
  merge: ["M18 21V9a6 6 0 0 0-6-6 6 6 0 0 0-6 6v12", "M9 6 6 3 3 6", "M21 18l-3 3-3-3"],
  edit: ["M12 20h9", "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"],
  undo: ["M3 7v6h6", "M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"],
  archive: ["M21 8v13H3V8", "M1 3h22v5H1z", "M10 12h4"],
  bolt: ["M13 2 3 14h9l-1 8 10-12h-9z"],
  bell2: ["M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.94 1.94 0 0 0 3.4 0"],
  mic: ["M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z","M19 10v2a7 7 0 0 1-14 0v-2","M12 19v3"],
  key: ["M21 2l-2 2m-7.6 7.6a5 5 0 1 0-7.07 7.07 5 5 0 0 0 7.07-7.07zm0 0L15 8m0 0 3 3 3-3-3-3"],
  sun: ["M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z","M12 1v2","M12 21v2","M4.2 4.2l1.4 1.4","M18.4 18.4l1.4 1.4","M1 12h2","M21 12h2","M4.2 19.8l1.4-1.4","M18.4 5.6l1.4-1.4"],
  hash: ["M4 9h16","M4 15h16","M10 3 8 21","M16 3l-2 18"],
};

function Icon({ name, size = 16, style, className }) {
  const d = I[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style} className={className}>
      {d.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

function Button({ children, variant = "default", size, className = "", ...rest }) {
  return <button data-variant={variant} data-size={size} className={`btn ${className}`} {...rest}>{children}</button>;
}

/* ---------- Tag chip ---------- */
function Tag({ id, origin, conf, removable, onRemove, selectable, selected, onClick }) {
  const t = TAGS[id] || { label: id, hue: 0 };
  return (
    <span className={`tag ${origin === "ai" ? "ai" : ""} ${removable ? "removable" : ""} ${selectable ? "selectable" : ""}`}
          style={{ "--tag-h": t.hue }} onClick={onClick} title={origin === "ai" ? `AI-applied · ${Math.round((conf||0)*100)}% confidence` : "Manually applied"}>
      <span className="tdot"></span>
      {t.label}
      {origin === "ai" && conf != null && <span style={{ opacity: .6, fontFamily: "var(--font-mono)", fontSize: 10 }}>{Math.round(conf*100)}</span>}
      {removable && <span className="x" onClick={(e) => { e.stopPropagation(); onRemove && onRemove(id); }}><Icon name="x" size={11} /></span>}
    </span>
  );
}

/* ---------- Faux rendered page (synthetic screenshot) ---------- */
function PageRender({ srcId, title, headSize = 13, lines = 5, hero = true }) {
  const s = SOURCES[srcId] || SOURCES.verge;
  return (
    <div className="render" style={{ "--src-bg": s.bg, "--src-accent": s.accent, "--r-head": headSize + "px" }}>
      <div className="r-chrome"><i></i><i></i><i></i><div className="r-brand">{s.short}</div></div>
      <div className="r-body">
        <div className="r-kicker"></div>
        <div className="r-head">{title}</div>
        {hero && <div className="r-hero"></div>}
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="r-line" style={{ width: (94 - (i % 3) * 13) + "%" }}></div>
        ))}
      </div>
      <div className="r-fade"></div>
    </div>
  );
}

/* ---------- combobox multiselect (for tag editing) ---------- */
function useClickOutside(ref, onOut) {
  useEffect(() => {
    function h(e) { if (ref.current && !ref.current.contains(e.target)) onOut(); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, onOut]);
}

function catHue(catId) {
  const c = CATEGORIES.find(c => c.id === catId);
  return c ? c.hue : 250;
}

Object.assign(window, { Icon, Button, Tag, PageRender, useClickOutside, useState, useRef, useEffect, useCallback, catHue, ICONSET: I });
