/**
 * @fileoverview PressApp — Root SPA component for the Press archive.
 *
 * Client-only React island mounted in an Astro page. Routes between
 * Newsstand, ArticleView, Ingest, Processing, Studio, Notebook, and Settings.
 */
import React, { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Sidebar, TopBar, PressDock, type Route, type SavedView } from "./Shell";

// Lazy-load page components to keep the initial bundle lean.
const Newsstand = lazy(() => import("./pages/Newsstand"));
const ArticleView = lazy(() => import("./pages/ArticleView"));
const Ingest = lazy(() => import("./pages/Ingest"));
const Processing = lazy(() => import("./pages/Processing"));
const Studio = lazy(() => import("./pages/Studio"));
const Notebook = lazy(() => import("./pages/Notebook"));
const Settings = lazy(() => import("./pages/Settings"));
const GenerateModal = lazy(() => import("./GenerateModal"));
const NotificationsPanel = lazy(() => import("./NotificationsPanel"));
import type { ArtifactKind, GeneratedArtifact } from "./GenerateModal";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceInfo {
  name: string;
  accent: string | null;
  bg: string | null;
  short: string | null;
  ink: string | null;
  face: string | null;
}

export interface Article {
  id: number;
  title: string | null;
  url: string;
  sourceName?: string | null;
  source?: SourceInfo | null;
  author?: string | null;
  publishedDate?: string | null;
  rawContent?: string | null;
  cleanContent?: string | null;
  audioKey?: string | null;
  mindmapKey?: string | null;
  screenshotUrl?: string | null;
  tags?: { id: number; name: string; color: string | null }[];
  isRead?: boolean;
  createdAt?: string | null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const PAGE_META: Record<string, { title: string; icon: string }> = {
  ingest: { title: "Add to archive", icon: "inbox" },
  stand: { title: "Newsstand", icon: "stand" },
  notebook: { title: "Notebook", icon: "book" },
  studio: { title: "Studio", icon: "studio" },
  processing: { title: "Processing", icon: "activity" },
  settings: { title: "Settings & config", icon: "settings" },
  article: { title: "Article", icon: "stand" },
};

export default function PressApp() {
  const [route, setRoute] = useState<Route>("stand");
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [errorCount, setErrorCount] = useState(0);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [genReq, setGenReq] = useState<{
    kind: ArtifactKind;
    scopeLabel: string;
    presetPrompt?: string;
  } | null>(null);

  const [unreadOnly, setUnreadOnly] = useState(true);

  // Fetch articles.
  const refreshArticles = useCallback(() => {
    const params = new URLSearchParams();
    if (unreadOnly) params.set("unreadOnly", "true");
    fetch(`/api/articles?${params}`)
      .then((r) => r.json() as Promise<{ articles?: Article[] }>)
      .then((d) => setArticles(d.articles ?? []))
      .catch(() => {});
  }, [unreadOnly]);

  useEffect(() => {
    refreshArticles();
  }, [refreshArticles]);

  // Fetch saved views.
  useEffect(() => {
    fetch("/api/views")
      .then((r) => r.json() as Promise<{ views?: SavedView[] }>)
      .then((d) => setSavedViews(d.views ?? []))
      .catch(() => {});
  }, []);

  // Fetch processing error count.
  useEffect(() => {
    fetch("/api/processing/stats")
      .then((r) => r.json() as Promise<{ err?: number }>)
      .then((d) => setErrorCount(d.err ?? 0))
      .catch(() => {});
  }, []);

  // Fetch notification count.
  useEffect(() => {
    fetch("/api/notifications?unreadOnly=true")
      .then((r) => {
        if (r.ok) return r.json() as Promise<{ unreadCount?: number }>;
        return { unreadCount: 0 };
      })
      .then((d) => setUnreadCount(d.unreadCount ?? 0))
      .catch(() => {});
  }, []);

  const go = useCallback(
    (r: Route, opts?: Record<string, unknown>) => {
      if (r === "article" && opts?.article) {
        setSelectedArticle(opts.article as Article);
      }
      setRoute(r);
      setMobileOpen(false);
    },
    [],
  );

  const openArticle = useCallback(
    (article: Article) => {
      setSelectedArticle(article);
      setRoute("article");
    },
    [],
  );

  const meta = PAGE_META[route] ?? PAGE_META.stand;

  const shellClass = [
    "app",
    collapsed ? "collapsed" : "",
    mobileOpen ? "mobile-open" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={shellClass}>
      {/* Sidebar */}
      <Sidebar
        route={route}
        go={go}
        articleCount={articles.length}
        errorCount={errorCount}
        savedViews={savedViews}
        onSettings={() => go("settings")}
      />

      {/* Mobile scrim */}
      <div className="scrim" onClick={() => setMobileOpen(false)} />

      {/* Main content */}
      <div className="main">
        <TopBar
          title={route === "article" ? selectedArticle?.title ?? "Article" : meta.title}
          icon={meta.icon}
          onToggle={() => setCollapsed((c) => !c)}
          onMenu={() => setMobileOpen((o) => !o)}
          unread={unreadCount}
          onBell={() => setNotifOpen((o) => !o)}
        />

        <Suspense
          fallback={
            <div className="page" style={{ display: "grid", placeItems: "center", minHeight: 300 }}>
              <div style={{ color: "var(--muted-foreground)", fontSize: 14 }}>Loading…</div>
            </div>
          }
        >
          {route === "stand" && (
            <Newsstand
              articles={articles}
              onOpen={openArticle}
              unreadOnly={unreadOnly}
              onUnreadToggle={setUnreadOnly}
            />
          )}
          {route === "article" && selectedArticle && (
            <ArticleView article={selectedArticle} onBack={() => { refreshArticles(); go("stand"); }} />
          )}
          {route === "ingest" && (
            <Ingest
              onIngested={(newArticles: Article[]) =>
                setArticles((prev) => [...newArticles, ...prev])
              }
            />
          )}
          {route === "processing" && <Processing />}
          {route === "studio" && <Studio />}
          {route === "notebook" && (
            <Notebook
              articles={articles}
              onGenerate={(kind: ArtifactKind, scopeLabel: string) =>
                setGenReq({ kind, scopeLabel })
              }
            />
          )}
          {route === "settings" && <Settings />}
        </Suspense>

        {/* Notifications panel */}
        <Suspense fallback={null}>
          <NotificationsPanel
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            onCountChange={(count) => setUnreadCount(count)}
          />
        </Suspense>
      </div>

      {/* Press Dock — MacOS-style magnifying navigation */}
      <PressDock route={route} go={go} />

      {/* Generate modal (cross-cutting) */}
      {genReq && (
        <Suspense fallback={null}>
          <GenerateModal
            kind={genReq.kind}
            scopeLabel={genReq.scopeLabel}
            presetPrompt={genReq.presetPrompt}
            onClose={() => setGenReq(null)}
            onDone={(_artifact: GeneratedArtifact) => {
              setGenReq(null);
              setRoute("studio");
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
