import { ExternalLink, Search, Tag as TagIcon, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { Badge } from "./ui/badge";
import { Button, buttonVariants } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Separator } from "./ui/separator";

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

/* ── tag picker (used in sidebar + detail view) ──────────────────────── */

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

/* ── filter sidebar ──────────────────────────────────────────────────── */

function FilterSidebar({
  tags,
  filterTags,
  setFilterTags,
  search,
  setSearch,
  groupBy,
  setGroupBy,
  onCreateTag,
}: {
  tags: Tag[];
  filterTags: Set<number>;
  setFilterTags: (s: Set<number>) => void;
  search: string;
  setSearch: (s: string) => void;
  groupBy: GroupBy;
  setGroupBy: (g: GroupBy) => void;
  onCreateTag: (name: string) => Promise<void>;
}) {
  const selectedTags = tags.filter((t) => filterTags.has(t.id));

  return (
    <aside className="w-64 shrink-0 space-y-6">
      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Search</Label>
        <div className="relative">
          <Search className="text-muted-foreground absolute left-2 top-2.5 h-4 w-4" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Title or summary…"
            className="pl-8"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-muted-foreground text-xs uppercase tracking-wider">Group by</Label>
        <div className="flex flex-wrap gap-1">
          {(["none", "topic", "source", "tag"] as const).map((option) => (
            <Button
              key={option}
              variant={groupBy === option ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupBy(option)}
            >
              {option === "none" ? "Flat" : option}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-muted-foreground text-xs uppercase tracking-wider">Tags</Label>
          {filterTags.size > 0 && (
            <button
              onClick={() => setFilterTags(new Set())}
              className="text-muted-foreground hover:text-foreground text-xs"
            >
              clear
            </button>
          )}
        </div>
        <TagPicker
          tags={tags}
          selected={filterTags}
          onChange={setFilterTags}
          onCreate={onCreateTag}
          triggerClass="w-full justify-start"
          triggerContent={
            <>
              <TagIcon className="mr-2 h-3 w-3" />
              {filterTags.size === 0 ? "Filter by tag" : `${filterTags.size} tag(s) selected`}
            </>
          }
        />
        {selectedTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selectedTags.map((tag) => (
              <Badge key={tag.id} variant="secondary" className="gap-1">
                {tag.name}
                <button
                  onClick={() => {
                    const next = new Set(filterTags);
                    next.delete(tag.id);
                    setFilterTags(next);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ── article detail modal ────────────────────────────────────────────── */

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
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{detail?.title ?? "Loading…"}</h2>
            <p className="text-muted-foreground flex items-center gap-2 text-xs">
              {detail && (
                <>
                  <span className="truncate">{detail.host}</span>
                  <a
                    href={detail.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-foreground inline-flex items-center gap-1"
                  >
                    open <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
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

          <div className="mx-2 h-6 w-px bg-border" />

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
                <TagIcon className="mr-2 h-3 w-3" />
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
          {!detail && <p className="text-muted-foreground p-8 text-center text-sm">Loading…</p>}
          {detail && view === "iframe" && (
            <iframe
              src={detail.url}
              title={detail.title}
              className="h-full w-full"
              sandbox="allow-scripts allow-same-origin allow-forms"
            />
          )}
          {detail && view === "pdf" && (
            <iframe src={detail.pdfUrl} title={`${detail.title} PDF`} className="h-full w-full" />
          )}
          {detail && view === "markdown" && (
            <article className="prose prose-sm dark:prose-invert max-w-none overflow-y-auto p-6">
              {detail.rawContent ? (
                detail.rawContent.split(/\n\n+/).map((para, i) => <p key={i}>{para.trim()}</p>)
              ) : (
                <p className="text-muted-foreground">No extracted content.</p>
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

  return (
    <div className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Archive</h1>
          <p className="text-muted-foreground text-sm">
            {articles.length} article{articles.length === 1 ? "" : "s"}
            {filtered.length !== articles.length ? ` · ${filtered.length} match` : ""}
          </p>
        </div>
        <nav className="flex gap-2">
          <a href="/" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Home
          </a>
          <a href="/notebook" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Notebook
          </a>
        </nav>
      </header>

      <div className="flex gap-6">
        <FilterSidebar
          tags={tags}
          filterTags={filterTags}
          setFilterTags={setFilterTags}
          search={search}
          setSearch={setSearch}
          groupBy={groupBy}
          setGroupBy={setGroupBy}
          onCreateTag={createTag}
        />

        <main className="min-w-0 flex-1 space-y-10">
          {loading && <p className="text-muted-foreground text-sm">Loading articles…</p>}
          {!loading && filtered.length === 0 && (
            <p className="text-muted-foreground text-sm">No articles match these filters yet.</p>
          )}
          {grouped.map((group) => (
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
      </div>

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
