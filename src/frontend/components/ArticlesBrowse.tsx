import { BookOpen, ExternalLink, FilterX, Search, Sparkles, Tag as TagIcon, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Separator } from "./ui/separator";
import { Skeleton } from "./ui/skeleton";

interface Tag {
  id: number;
  name: string;
}

interface Article {
  id: number;
  url: string;
  host: string;
  title: string;
  summary: string;
  topic?: string;
  source?: string;
  author?: string;
  screenshotUrl: string | null;
  tags: Tag[];
  properties: Record<string, string>;
  createdAt: string | null;
}

interface ArticleDetail extends Article {
  rawContent: string;
  pdfUrl: string;
}

type GroupBy = "none" | "topic" | "source" | "tag";
type ViewMode = "iframe" | "markdown" | "pdf";

interface GroupedArticles {
  label: string;
  items: Article[];
}

/* ── grouping ────────────────────────────────────────────────────────── */

function groupArticles(articles: Article[], groupBy: GroupBy): GroupedArticles[] {
  if (groupBy === "none") return [{ label: "All", items: articles }];

  if (groupBy === "tag") {
    const groups = new Map<string, Article[]>();
    for (const article of articles) {
      if (article.tags.length === 0) {
        const list = groups.get("Untagged") ?? [];
        list.push(article);
        groups.set("Untagged", list);
        continue;
      }
      for (const tag of article.tags) {
        const list = groups.get(tag.name) ?? [];
        list.push(article);
        groups.set(tag.name, list);
      }
    }
    return [...groups.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, items]) => ({ label, items }));
  }

  const keyFor = (a: Article): string => {
    if (groupBy === "source") return a.source ?? a.host;
    return a.topic ?? "Uncategorised";
  };

  const groups = new Map<string, Article[]>();
  for (const article of articles) {
    const key = keyFor(article);
    const list = groups.get(key) ?? [];
    list.push(article);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, items]) => ({ label, items }));
}

/* ── article card ────────────────────────────────────────────────────── */

function ArticleCard({ article, onOpen }: { article: Article; onOpen: () => void }) {
  return (
    <Card
      className="group hover:border-primary/50 cursor-pointer overflow-hidden transition-colors"
      onClick={onOpen}
    >
      <div className="bg-muted aspect-[16/10] w-full overflow-hidden">
        {article.screenshotUrl ? (
          <img
            src={article.screenshotUrl}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <div className="text-muted-foreground flex h-full items-center justify-center text-xs">
            no preview
          </div>
        )}
      </div>
      <CardHeader className="space-y-1">
        <CardTitle className="line-clamp-2 text-base">{article.title}</CardTitle>
        <p className="text-muted-foreground text-xs">{article.host}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {article.summary && (
          <p className="text-muted-foreground line-clamp-3 text-xs">{article.summary}</p>
        )}
        <div className="flex flex-wrap gap-1">
          {article.topic && <Badge variant="secondary">{article.topic}</Badge>}
          {article.tags.map((tag) => (
            <Badge key={tag.id} variant="outline">
              {tag.name}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── skeleton card (loading state) ────────────────────────────────────── */

function ArticleCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[16/10] w-full rounded-none" />
      <CardHeader className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
      </CardHeader>
      <CardContent className="space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-5/6" />
        <Skeleton className="h-3 w-2/3" />
        <div className="flex gap-1 pt-1">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
      </CardContent>
    </Card>
  );
}

function ArticleGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <ArticleCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ── empty states ─────────────────────────────────────────────────────── */

function EmptyArchive() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="bg-secondary text-secondary-foreground flex size-16 items-center justify-center rounded-full">
          <BookOpen className="size-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Your archive is empty</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Paste a few article URLs on the Ingest page and we'll render, summarise, and tag them —
            they'll show up here in seconds.
          </p>
        </div>
        <a
          href="/"
          className={cn(buttonVariants({ variant: "default", size: "sm" }), "mt-2 gap-1")}
        >
          <Sparkles className="size-3.5" />
          Start ingesting
        </a>
      </CardContent>
    </Card>
  );
}

function EmptyMatches({ onReset }: { onReset: () => void }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="bg-secondary text-secondary-foreground flex size-16 items-center justify-center rounded-full">
          <FilterX className="size-7" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">No matches</h2>
          <p className="text-muted-foreground max-w-sm text-sm">
            Nothing in the archive lines up with the current search and tag filters. Try loosening
            them.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onReset} className="mt-2 gap-1">
          <FilterX className="size-3.5" />
          Clear filters
        </Button>
      </CardContent>
    </Card>
  );
}

/* ── tag picker (used in toolbar + detail view) ──────────────────────── */

function TagPicker({
  tags,
  selected,
  onChange,
  onCreate,
  triggerContent,
  triggerClass,
  disabled,
}: {
  tags: Tag[];
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  onCreate?: (name: string) => Promise<void>;
  triggerContent: React.ReactNode;
  triggerClass?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (!name || !onCreate) return;
    await onCreate(name);
    setDraft("");
  };

  return (
    <Popover>
      <PopoverTrigger
        disabled={disabled}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }), triggerClass)}
      >
        {triggerContent}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="max-h-64 overflow-y-auto">
          {tags.length === 0 && (
            <p className="text-muted-foreground px-2 py-3 text-center text-xs">No tags yet.</p>
          )}
          {tags.map((tag) => (
            <label
              key={tag.id}
              className="hover:bg-muted flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.has(tag.id)}
                onChange={() => toggle(tag.id)}
                className="shrink-0"
              />
              <span className="truncate">{tag.name}</span>
            </label>
          ))}
        </div>
        {onCreate && (
          <>
            <Separator className="my-2" />
            <form onSubmit={submitCreate} className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="New tag…"
                className="h-8 text-xs"
              />
              <Button type="submit" size="sm" disabled={!draft.trim()}>
                Add
              </Button>
            </form>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* ── filter toolbar (top of page, horizontal) ─────────────────────────── */

function FilterToolbar({
  tags,
  filterTags,
  setFilterTags,
  search,
  setSearch,
  groupBy,
  setGroupBy,
  onCreateTag,
  loading,
}: {
  tags: Tag[];
  filterTags: Set<number>;
  setFilterTags: (s: Set<number>) => void;
  search: string;
  setSearch: (s: string) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  onCreateTag: (name: string) => Promise<void>;
  loading: boolean;
}) {
  if (loading) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-9 w-32" />
        </CardContent>
      </Card>
    );
  }

  const selectedTags = tags.filter((t) => filterTags.has(t.id));

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-3 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="relative w-full lg:w-72">
          <Search className="text-muted-foreground pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search title, summary, or host…"
            className="pl-9"
          />
        </div>

        <Separator orientation="vertical" className="hidden h-7 lg:block" />

        <div className="flex items-center gap-1">
          <span className="text-muted-foreground mr-1 text-xs uppercase tracking-wider">Group</span>
          {(["none", "topic", "source", "tag"] as const).map((option) => (
            <Button
              key={option}
              variant={groupBy === option ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupBy(option)}
              className="capitalize"
            >
              {option === "none" ? "Flat" : option}
            </Button>
          ))}
        </div>

        <Separator orientation="vertical" className="hidden h-7 lg:block" />

        <div className="flex flex-wrap items-center gap-2">
          <TagPicker
            tags={tags}
            selected={filterTags}
            onChange={setFilterTags}
            onCreate={onCreateTag}
            triggerContent={
              <>
                <TagIcon className="mr-2 size-3" />
                {filterTags.size === 0 ? "Filter tags" : `${filterTags.size} tag(s)`}
              </>
            }
          />
          {selectedTags.map((tag) => (
            <Badge key={tag.id} variant="secondary" className="gap-1">
              {tag.name}
              <button
                onClick={() => {
                  const next = new Set(filterTags);
                  next.delete(tag.id);
                  setFilterTags(next);
                }}
                aria-label={`Remove ${tag.name} filter`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          {filterTags.size > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFilterTags(new Set())}
              className="text-muted-foreground"
            >
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── article detail modal ────────────────────────────────────────────── */

function ArticleDetailSkeleton() {
  return (
    <div className="space-y-3 p-6">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-1/3" />
      <Separator className="my-2" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-5/6" />
      <Skeleton className="h-3 w-4/5" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-3/4" />
    </div>
  );
}

function ArticleDetailDialog({
  articleId,
  tags,
  onClose,
  onTagsChanged,
  onCreateTag,
}: {
  articleId: number;
  tags: Tag[];
  onClose: () => void;
  onTagsChanged: () => Promise<void> | void;
  onCreateTag: (name: string) => Promise<void>;
}) {
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [view, setView] = useState<ViewMode>("iframe");
  const [saving, setSaving] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/articles/${articleId}`)
      .then((r) => r.json() as Promise<ArticleDetail>)
      .then((d) => {
        if (!cancelled) setDetail(d);
      });
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selected = useMemo(() => new Set(detail?.tags.map((t) => t.id) ?? []), [detail]);

  const saveTags = async (next: Set<number>) => {
    if (!detail) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tags/article/${detail.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: [...next] }),
      });
      if (res.ok) {
        const updated = (await res.json()) as { tags: Tag[] };
        setDetail({ ...detail, tags: updated.tags });
        await onTagsChanged();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 md:p-8"
    >
      <div className="bg-background flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b p-4">
          <div className="min-w-0 flex-1 space-y-1">
            {detail ? (
              <>
                <h2 className="truncate text-lg font-semibold">{detail.title}</h2>
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <span className="truncate">{detail.host}</span>
                  <a
                    href={detail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground inline-flex items-center gap-1"
                  >
                    open <ExternalLink className="size-3" />
                  </a>
                </p>
              </>
            ) : (
              <>
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          {(["iframe", "markdown", "pdf"] as const).map((mode) => (
            <Button
              key={mode}
              variant={view === mode ? "default" : "outline"}
              size="sm"
              onClick={() => setView(mode)}
            >
              {mode.toUpperCase()}
            </Button>
          ))}

          <Separator orientation="vertical" className="mx-2 h-6" />

          <TagPicker
            tags={tags}
            selected={selected}
            onChange={(next) => void saveTags(next)}
            onCreate={async (name) => {
              await onCreateTag(name);
            }}
            disabled={!detail || saving}
            triggerContent={
              <>
                <TagIcon className="mr-2 size-3" />
                Tags ({detail?.tags.length ?? 0})
              </>
            }
          />

          {detail?.tags && detail.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {detail.tags.map((t) => (
                <Badge key={t.id} variant="secondary">
                  {t.name}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="bg-muted/30 min-h-0 flex-1 overflow-hidden">
          {!detail && <ArticleDetailSkeleton />}
          {detail && view === "iframe" && (
            <iframe
              src={detail.url}
              title={detail.title}
              className="size-full"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}
          {detail && view === "pdf" && (
            <iframe src={detail.pdfUrl} title={`${detail.title} PDF`} className="size-full" />
          )}
          {detail && view === "markdown" && (
            <article className="prose prose-sm dark:prose-invert max-w-none overflow-y-auto p-6">
              {detail.rawContent ? (
                detail.rawContent.split(/\n\n+/).map((para, i) => <p key={i}>{para.trim()}</p>)
              ) : (
                <p className="text-muted-foreground">No extracted content yet.</p>
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── root ─────────────────────────────────────────────────────────────── */

export function ArticlesBrowse() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState("");
  const [filterTags, setFilterTags] = useState<Set<number>>(new Set());
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [articlesRes, tagsRes] = await Promise.all([
        fetch("/api/articles").then((r) => r.json() as Promise<{ articles: Article[] }>),
        fetch("/api/tags").then((r) => r.json() as Promise<{ tags: Tag[] }>),
      ]);
      setArticles(articlesRes.articles ?? []);
      setTags(tagsRes.tags ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const createTag = useCallback(async (name: string) => {
    const res = await fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      const data = (await res.json()) as { tag: Tag };
      setTags((prev) => (prev.some((t) => t.id === data.tag.id) ? prev : [...prev, data.tag]));
    }
  }, []);

  const filtered = useMemo(() => {
    let list = articles;
    if (filterTags.size > 0) {
      list = list.filter((a) => a.tags.some((t) => filterTags.has(t.id)));
    }
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.summary.toLowerCase().includes(q) ||
          a.host.toLowerCase().includes(q),
      );
    }
    return list;
  }, [articles, filterTags, search]);

  const grouped = useMemo(() => groupArticles(filtered, groupBy), [filtered, groupBy]);

  const filtersActive = search.trim().length > 0 || filterTags.size > 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Archive</h1>
        <p className="text-muted-foreground text-sm">
          {loading ? (
            <Skeleton className="inline-block h-3 w-32" />
          ) : (
            <>
              {articles.length} article{articles.length === 1 ? "" : "s"}
              {filtered.length !== articles.length ? ` · ${filtered.length} match` : ""}
            </>
          )}
        </p>
      </header>

      <FilterToolbar
        tags={tags}
        filterTags={filterTags}
        setFilterTags={setFilterTags}
        search={search}
        setSearch={setSearch}
        groupBy={groupBy}
        setGroupBy={setGroupBy}
        onCreateTag={createTag}
        loading={loading}
      />

      <main className="space-y-10">
        {loading && <ArticleGridSkeleton />}

        {!loading && articles.length === 0 && <EmptyArchive />}

        {!loading && articles.length > 0 && filtered.length === 0 && (
          <EmptyMatches
            onReset={() => {
              setSearch("");
              setFilterTags(new Set());
            }}
          />
        )}

        {!loading &&
          filtered.length > 0 &&
          grouped.map((group) => (
            <section key={group.label}>
              {groupBy !== "none" && (
                <h2 className="text-muted-foreground mb-3 text-xs font-semibold uppercase tracking-wider">
                  {group.label} ({group.items.length})
                </h2>
              )}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((article) => (
                  <ArticleCard
                    key={article.id}
                    article={article}
                    onOpen={() => setActiveId(article.id)}
                  />
                ))}
              </div>
            </section>
          ))}
      </main>

      {activeId !== null && (
        <ArticleDetailDialog
          articleId={activeId}
          tags={tags}
          onClose={() => setActiveId(null)}
          onTagsChanged={loadAll}
          onCreateTag={createTag}
        />
      )}
    </div>
  );
}
