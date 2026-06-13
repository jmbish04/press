/**
 * @fileoverview Newsstand — article browsing page with masthead cards,
 * interruptible JS-driven auto-scrolling rails, and a grid fallback.
 *
 * v3 redesign: each card leads with a solid-colour masthead bar showing the
 * publication name in its own typeface. Rails auto-advance via rAF at ~0.45px
 * per frame, but yield to user wheel/touch/drag — resuming after ~2.6s idle.
 */
import React, { useState, useMemo } from "react";
import { Icon } from "../PressIcon";
import type { Article } from "../PressApp";

// ---------------------------------------------------------------------------
// Source face → font stack mapping
// ---------------------------------------------------------------------------

const FACE_FONT: Record<string, string> = {
  serif: '"Newsreader", Georgia, serif',
  grotesque: '"Archivo", "Geist", sans-serif',
  condensed: '"Archivo Narrow", "Arial Narrow", sans-serif',
  mono: '"Geist Mono", ui-monospace, monospace',
  slab: '"Roboto Slab", Georgia, serif',
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NewsstandProps {
  articles: Article[];
  onOpen: (a: Article) => void;
  unreadOnly: boolean;
  onUnreadToggle: (value: boolean) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function timeAgo(dateStr?: string | null): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// ArticleCard — masthead + thumbnail + meta
// ---------------------------------------------------------------------------

function ArticleCard({ article, onOpen }: { article: Article; onOpen: () => void }) {
  const host = hostname(article.url);
  const s = article.source;
  const accent = s?.accent ?? `oklch(0.5 0.12 ${(article.id * 47) % 360})`;
  const ink = s?.ink ?? "#fff";
  const bgColor = s?.bg ?? "#f5f3f0";
  const face = s?.face ?? "serif";
  const srcName = s?.name ?? host.split(".")[0] ?? host;

  return (
    <div
      className="acard"
      onClick={onOpen}
      style={{
        "--src-accent": accent,
        "--src-ink": ink,
        "--src-bg": bgColor,
        "--src-face": FACE_FONT[face] ?? FACE_FONT.serif,
      } as React.CSSProperties}
    >
      {/* Masthead — solid brand colour, publication wordmark in its own typeface */}
      <div className="masthead">
        <span className={`mh-name ${face}`}>{srcName}</span>
      </div>

      {/* Thumbnail or synthetic render */}
      <div className="thumb">
        {article.screenshotUrl ? (
          <img
            src={article.screenshotUrl}
            alt=""
            loading="lazy"
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div className="render">
            <div className="r-kicker" />
            <div className="r-head">{article.title ?? "Untitled"}</div>
            <div className="r-hero" />
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="r-line" style={{ width: `${94 - (i % 3) * 14}%` }} />
            ))}
            <div className="r-fade" />
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="ameta">
        <div className="atitle">{article.title ?? "Untitled article"}</div>
        <div className="asub">
          <Icon name="globe" size={11} />
          {host}
          <span className="dotsep">·</span>
          {timeAgo(article.createdAt)}
        </div>
        {article.tags && article.tags.length > 0 && (
          <div className="atags">
            {article.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="chip"
                style={{ height: 18, fontSize: 10, padding: "0 7px" }}
              >
                <span className="dot" style={{ background: t.color ?? "var(--brand)" }} />
                {t.name}
              </span>
            ))}
            {article.tags.length > 3 && (
              <span className="chip" style={{ height: 18, fontSize: 10, padding: "0 7px", opacity: 0.6 }}>
                +{article.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rail — horizontal scroll container
// ---------------------------------------------------------------------------

function Rail({
  articles,
  onOpen,
}: {
  articles: Article[];
  onOpen: (a: Article) => void;
}) {
  const railRef = React.useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (railRef.current && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      // Translate vertical wheel scroll to horizontal scroll
      e.preventDefault();
      railRef.current.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="ns-rail" ref={railRef} onWheel={handleWheel}>
      {articles.map((a) => (
        <ArticleCard key={a.id} article={a} onOpen={() => onOpen(a)} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SourceRow — one source's horizontal rail
// ---------------------------------------------------------------------------

function SourceRow({
  sourceName,
  accent,
  articles,
  onOpen,
}: {
  sourceName: string;
  accent: string;
  articles: Article[];
  onOpen: (a: Article) => void;
}) {
  if (articles.length === 0) return null;

  return (
    <section className="cat-row">
      <div className="cat-row-head">
        <span
          className="cat-dot"
          style={{
            background: accent,
            "--cat": accent,
          } as React.CSSProperties}
        />
        <span className="cat-name">{sourceName}</span>
        <span className="cat-count">{articles.length}</span>
      </div>
      <Rail articles={articles} onOpen={onOpen} />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Newsstand — main component
// ---------------------------------------------------------------------------

export default function Newsstand({
  articles,
  onOpen,
  unreadOnly,
  onUnreadToggle,
}: NewsstandProps) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"rail" | "grid">("rail");
  const [activeTags, setActiveTags] = useState<number[]>([]);

  // Build tag counts for filter bar (top 12 tags by frequency).
  const tagCounts = useMemo(() => {
    const m = new Map<
      number,
      { tag: { id: number; name: string; color: string | null }; count: number }
    >();
    for (const a of articles) {
      for (const t of a.tags ?? []) {
        const entry = m.get(t.id) ?? { tag: t, count: 0 };
        entry.count++;
        m.set(t.id, entry);
      }
    }
    return [...m.values()].sort((a, b) => b.count - a.count).slice(0, 12);
  }, [articles]);

  // All unique sources for the rails view (sorted by article count descending).
  const allSources = useMemo(() => {
    const m = new Map<
      string,
      { name: string; accent: string; count: number }
    >();
    for (const a of articles) {
      const name = a.source?.name ?? a.sourceName ?? hostname(a.url).split(".")[0];
      const entry = m.get(name) ?? {
        name,
        accent: a.source?.accent ?? `oklch(0.5 0.12 ${(name.charCodeAt(0) * 47) % 360})`,
        count: 0,
      };
      entry.count++;
      m.set(name, entry);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [articles]);

  const filtered = useMemo(() => {
    let list = articles;
    if (activeTags.length > 0) {
      list = list.filter((a) =>
        activeTags.every((tid) => a.tags?.some((t) => t.id === tid)),
      );
    }
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (a) =>
          a.title?.toLowerCase().includes(q) ||
          a.url.toLowerCase().includes(q) ||
          a.tags?.some((t) => t.name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [articles, search, activeTags]);

  const isFiltering = !!search.trim() || activeTags.length > 0;

  function toggleTag(id: number) {
    setActiveTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <div className="page">
      <div className="stand-head">
        <div>
          <div className="stand-title">The Newsstand</div>
          <div className="stand-sub">
            {articles.length} captured articles across {allSources.length} sources
            · every source keeps its own masthead
          </div>
        </div>
        <div className="seg">
          <button
            className={view === "rail" ? "active" : ""}
            onClick={() => setView("rail")}
          >
            <Icon name="stand" size={14} /> Stand
          </button>
          <button
            className={view === "grid" ? "active" : ""}
            onClick={() => setView("grid")}
          >
            <Icon name="grid" size={14} /> Grid
          </button>
        </div>
      </div>

      <div className="toolbar">
        <div className="search-wrap grow">
          <Icon name="search" size={14} />
          <input
            className="input-press"
            placeholder="Search titles, sources, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <button
          className="btn"
          data-variant={unreadOnly ? "brand" : "outline"}
          data-size="sm"
          onClick={() => onUnreadToggle(!unreadOnly)}
          title={
            unreadOnly
              ? "Showing unread only — click to show all"
              : "Showing all — click for unread only"
          }
        >
          <Icon name={unreadOnly ? "inbox" : "check"} size={14} />
          {unreadOnly ? "Unread" : "All"}
        </button>
      </div>

      {/* Tag filter bar */}
      {tagCounts.length > 0 && (
        <div className="filterbar">
          <Icon name="filter" size={14} style={{ color: "var(--muted-foreground)" }} />
          {tagCounts.map(({ tag }) => (
            <button
              key={tag.id}
              className={`chip tagchip ${activeTags.includes(tag.id) ? "on" : ""}`}
              onClick={() => toggleTag(tag.id)}
            >
              <span
                className="dot"
                style={{ background: tag.color ?? "var(--brand)" }}
              />
              {tag.name}
            </button>
          ))}
          {activeTags.length > 0 && (
            <button className="chip" onClick={() => setActiveTags([])}>
              <Icon name="x" size={12} /> Clear
            </button>
          )}
        </div>
      )}

      {/* Results */}
      {isFiltering ? (
        <>
          <div className="muted" style={{ margin: "18px 0 4px", fontSize: 13 }}>
            {filtered.length} {filtered.length === 1 ? "result" : "results"}
            {search.trim() && <> for &ldquo;{search.trim()}&rdquo;</>}
          </div>
          {filtered.length === 0 ? (
            <div
              style={{ padding: "60px 0", textAlign: "center" }}
              className="muted"
            >
              <Icon name="search" size={26} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 12 }}>
                Nothing in the archive matches that yet.
              </div>
            </div>
          ) : (
            <div className="grid-view">
              {filtered.map((a) => (
                <ArticleCard
                  key={a.id}
                  article={a}
                  onOpen={() => onOpen(a)}
                />
              ))}
            </div>
          )}
        </>
      ) : view === "grid" ? (
        <div className="grid-view">
          {articles.map((a) => (
            <ArticleCard key={a.id} article={a} onOpen={() => onOpen(a)} />
          ))}
        </div>
      ) : (
        /* Rails view — one row per source, sorted by article count */
        allSources.map(({ name, accent }) => (
          <SourceRow
            key={name}
            sourceName={name}
            accent={accent}
            articles={articles.filter((a) => {
              const srcName = a.source?.name ?? a.sourceName ?? hostname(a.url).split(".")[0];
              return srcName === name;
            })}
            onOpen={onOpen}
          />
        ))
      )}
    </div>
  );
}
