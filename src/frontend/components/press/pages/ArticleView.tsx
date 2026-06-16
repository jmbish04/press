/**
 * @fileoverview ArticleView — tabbed article viewer with Reader, Mindmap,
 * Screenshot, PDF, Markdown, and side panel showing source info, tags (editable),
 * and audio.
 *
 * On mount, fetches full article detail from `/api/articles/:id` to populate
 * rawContent, cleanContent, audioUrl, pdfUrl, and title (from AI extraction properties).
 */
import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Icon } from "../PressIcon";
import type { MindElixirData } from "mind-elixir";
import {
  AudioPlayer,
  AudioPlayerElement,
  AudioPlayerControlBar,
  AudioPlayerPlayButton,
  AudioPlayerSeekBackwardButton,
  AudioPlayerSeekForwardButton,
  AudioPlayerTimeDisplay,
  AudioPlayerTimeRange,
  AudioPlayerDurationDisplay,
  AudioPlayerMuteButton,
} from "../../ai-elements/audio-player";
import {
  Transcription,
  TranscriptionSegment as TranscriptionSegmentComponent,
} from "../../ai-elements/transcription";

const ShadcnMindMap = lazy(() =>
  import("../../ui/mindmap").then((m) => ({ default: m.MindMap })),
);
const ShadcnMindMapControls = lazy(() =>
  import("../../ui/mindmap").then((m) => ({ default: m.MindMapControls })),
);
const ArticleAssistant = lazy(() => import("../ArticleAssistant"));

interface SourceInfo {
  name: string;
  accent: string | null;
  bg: string | null;
  short: string | null;
}

interface Article {
  id: number;
  title: string | null;
  url: string;
  source?: SourceInfo | null;
  rawContent?: string | null;
  audioKey?: string | null;
  mindmapKey?: string | null;
  screenshotUrl?: string | null;
  tags?: { id: number; name: string; color: string | null }[];
  createdAt?: string | null;
}

/** Shape returned by GET /api/articles/:id */
interface ArticleDetail {
  id: number;
  title: string;
  url: string;
  host: string;
  summary: string;
  rawContent: string;
  cleanContent: string | null;
  transcriptionText: string | null;
  transcriptionSegments: { text: string; startSecond: number; endSecond: number }[] | null;
  pdfUrl: string;
  audioUrl: string | null;
  markdownUrl: string | null;
  fullScreenshotUrl: string | null;
  mindmapUrl: string | null;
  screenshotUrl: string | null;
  source: SourceInfo | null;
  author?: string;
  publishedDate?: string;
  tags: { id: number; name: string; color: string | null }[];
  properties: Record<string, string>;
  createdAt: string | null;
  images?: { id: number; imageName: string; imageCfUrl: string; position: number | null; caption: string | null }[];
}

interface TagItem {
  id: number;
  name: string;
  color: string | null;
  description?: string | null;
}

interface ArticleViewProps {
  article: Article;
  onBack: () => void;
}

type Tab = "reader" | "mindmap" | "screenshot" | "pdf" | "markdown";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "reader", label: "Reader", icon: "book" },
  { id: "mindmap", label: "Mind map", icon: "zap" },
  { id: "screenshot", label: "Screenshot", icon: "layers" },
  { id: "pdf", label: "PDF", icon: "download" },
  { id: "markdown", label: "Markdown", icon: "link" },
];

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

export default function ArticleView({ article, onBack }: ArticleViewProps) {
  const [tab, setTab] = useState<Tab>("reader");
  const [mindmapData, setMindmapData] = useState<MindElixirData | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Markdown content streamed from R2.
  const [markdownContent, setMarkdownContent] = useState<string | null>(null);
  const [loadingMarkdown, setLoadingMarkdown] = useState(false);

  // Full detail fetched from the detail endpoint.
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Tag editing state.
  const [editingTags, setEditingTags] = useState(false);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [articleTags, setArticleTags] = useState<{ id: number; name: string; color: string | null }[]>([]);
  const [showCreateTag, setShowCreateTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagDesc, setNewTagDesc] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");

  // Fetch full article detail (rawContent, title, pdfUrl, audioUrl).
  useEffect(() => {
    setLoading(true);
    fetch(`/api/articles/${article.id}`)
      .then((r) => (r.ok ? (r.json() as Promise<ArticleDetail>) : null))
      .then((d) => {
        if (d) {
          setDetail(d);
          if (d.audioUrl) setAudioUrl(d.audioUrl);
          setArticleTags(d.tags ?? []);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [article.id]);

  // Fetch markdown from R2 when switching to Markdown tab.
  useEffect(() => {
    if (tab !== "markdown" || markdownContent !== null) return;
    setLoadingMarkdown(true);
    fetch(`/api/articles/${article.id}/markdown`)
      .then((r) => (r.ok ? r.text() : null))
      .then((text) => setMarkdownContent(text))
      .catch(() => {})
      .finally(() => setLoadingMarkdown(false));
  }, [tab, article.id, markdownContent]);

  // Fetch mind map data.
  useEffect(() => {
    fetch(`/api/articles/${article.id}/mindmap`)
      .then((r) => (r.ok ? (r.json() as Promise<MindElixirData>) : null))
      .then((d) => setMindmapData(d))
      .catch(() => {});
  }, [article.id]);

  // Fetch all tags (for the add-tag dropdown).
  const loadAllTags = useCallback(() => {
    fetch("/api/tags")
      .then((r) => r.json() as Promise<{ tags: TagItem[] }>)
      .then((d) => setAllTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  /** Sync audio playback time for transcription highlighting. */
  const handleAudioTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  /** Seek audio when user clicks a transcription segment. */
  const handleTranscriptionSeek = useCallback((time: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setAudioCurrentTime(time);
    }
  }, []);

  const handleRemoveTag = async (tagId: number) => {
    const updated = articleTags.filter((t) => t.id !== tagId);
    setArticleTags(updated);
    try {
      await fetch(`/api/tags/article/${article.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: updated.map((t) => t.id) }),
      });
    } catch (err) {
      console.error("Remove tag failed:", err);
    }
  };

  const handleAddTag = async (tag: TagItem) => {
    if (articleTags.some((t) => t.id === tag.id)) return;
    const updated = [...articleTags, { id: tag.id, name: tag.name, color: tag.color }];
    setArticleTags(updated);
    try {
      await fetch(`/api/tags/article/${article.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: updated.map((t) => t.id) }),
      });
    } catch (err) {
      console.error("Add tag failed:", err);
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTagName.trim(),
          description: newTagDesc.trim() || undefined,
          color: newTagColor,
        }),
      });
      const data = await res.json() as { tag: TagItem };
      if (data.tag) {
        await handleAddTag(data.tag);
        setAllTags((prev) => [...prev, data.tag]);
        setNewTagName("");
        setNewTagDesc("");
        setShowCreateTag(false);
      }
    } catch (err) {
      console.error("Create tag failed:", err);
    }
  };

  // Use detail data when available, fall back to list data.
  const title = detail?.title ?? article.title ?? "Untitled";
  const rawContent = detail?.rawContent ?? article.rawContent ?? null;
  const cleanContent = detail?.cleanContent ?? null;
  const readerContent = cleanContent || rawContent;
  const screenshotUrl = detail?.screenshotUrl ?? article.screenshotUrl ?? null;
  const fullScreenshotUrl = detail?.fullScreenshotUrl ?? null;
  const pdfUrl = detail?.pdfUrl ?? `/api/articles/${article.id}/pdf`;
  const host = hostname(article.url);
  const sourceInfo = detail?.source ?? article.source ?? null;
  const accent = sourceInfo?.accent ?? `oklch(0.5 0.12 ${(article.id * 47) % 360})`;
  const shortLabel = sourceInfo?.short ?? host[0]?.toUpperCase() ?? "?";

  // Transcription segments for highlight-as-you-speak.
  const transcriptionSegments = detail?.transcriptionSegments ?? null;

  // Author and published date from detail properties.
  const author = detail?.author ?? detail?.properties?.author ?? null;
  const publishedDate = detail?.publishedDate ?? detail?.properties?.publisheddate ?? null;

  // Available tags for the dropdown (exclude already-applied).
  const appliedIds = new Set(articleTags.map((t) => t.id));
  const availableTags = allTags.filter((t) => !appliedIds.has(t.id));

  return (
    <div className="av-wrap">
      {/* Main content area */}
      <div className="av-main">
        <div className="av-tabs">
          <button className="av-tab" onClick={onBack}>
            <Icon name="chevronR" size={14} style={{ transform: "rotate(180deg)" }} /> Back
          </button>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`av-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <Icon name={t.icon} size={14} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "reader" && (
          <div className="reader">
            <div className="kicker">{host}</div>
            <h1>{title}</h1>
            <div className="byline">
              {author && (
                <>
                  <span style={{ fontWeight: 500 }}>{author}</span>
                  <span>·</span>
                </>
              )}
              <Icon name="globe" size={13} />
              <a href={article.url} target="_blank" rel="noopener">{host}</a>
              <span>·</span>
              <span>{formatDate(publishedDate) || (article.createdAt ? new Date(article.createdAt).toLocaleDateString() : "")}</span>
            </div>

            {/* Transcription-synced reader: highlights text as audio plays */}
            {audioUrl && transcriptionSegments && transcriptionSegments.length > 0 ? (
              <div className="reader-rich">
                <Transcription
                  segments={transcriptionSegments}
                  currentTime={audioCurrentTime}
                  onSeek={handleTranscriptionSeek}
                  style={{ lineHeight: 2, fontSize: 16, fontFamily: "var(--font-serif, Georgia, serif)" }}
                >
                  {(segment, index) => (
                    <TranscriptionSegmentComponent
                      key={index}
                      segment={segment}
                      index={index}
                      style={{ padding: "2px 4px", borderRadius: 4, transition: "all 0.2s" }}
                    />
                  )}
                </Transcription>
              </div>
            ) : loading ? (
              <p style={{ color: "var(--muted-foreground)" }}>Loading article content…</p>
            ) : cleanContent ? (
              <div className="reader-rich" dangerouslySetInnerHTML={{ __html: cleanContent }} />
            ) : readerContent ? (
              readerContent.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))
            ) : (
              <p style={{ color: "var(--muted-foreground)" }}>
                Article content not available. View the original at{" "}
                <a href={article.url} target="_blank" rel="noopener">{article.url}</a>.
              </p>
            )}
            {/* Inline article images from Cloudflare Images */}
            {detail?.images && detail.images.length > 0 && !cleanContent && (
              <div className="reader-images">
                {detail.images.map((img) => (
                  <figure key={img.id} className="reader-img">
                    <img src={img.imageCfUrl} alt={img.imageName} loading="lazy" />
                    {img.caption && <figcaption>{img.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "mindmap" && (
          <div className="page">
            {mindmapData ? (
              <div style={{ width: "100%", height: 560, position: "relative" }}>
                <Suspense fallback={<div style={{ padding: 40, textAlign: "center", color: "var(--muted-foreground)" }}>Loading mind map…</div>}>
                  <ShadcnMindMap data={mindmapData} theme="dark" readonly fit>
                    <ShadcnMindMapControls position="top-right" />
                  </ShadcnMindMap>
                </Suspense>
              </div>
            ) : (
              <div style={{ padding: 60, textAlign: "center", color: "var(--muted-foreground)" }}>
                <Icon name="zap" size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
                <div style={{ fontSize: 14 }}>No mind map generated for this article yet.</div>
              </div>
            )}
          </div>
        )}

        {tab === "screenshot" && (
          <div className="doc-surface" style={{ padding: 30 }}>
            {(fullScreenshotUrl || screenshotUrl) ? (
              <img
                src={fullScreenshotUrl ?? screenshotUrl!}
                alt={title}
                style={{
                  maxWidth: 860,
                  width: "100%",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-xl)",
                  display: "block",
                }}
              />
            ) : (
              <div
                className="render"
                style={{
                  "--src-bg": sourceInfo?.bg ?? "#f8f7f4",
                  "--src-accent": accent,
                  "--r-head": "16px",
                  maxWidth: 860,
                  width: "100%",
                  aspectRatio: "3/4",
                  borderRadius: "var(--radius-lg)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-xl)",
                } as React.CSSProperties}
              >
                <div className="r-chrome">
                  <i /><i /><i />
                  <div className="r-brand">{shortLabel}</div>
                </div>
                <div className="r-body">
                  <div className="r-kicker" />
                  <div className="r-head">{title}</div>
                  <div className="r-hero" />
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="r-line" style={{ width: `${94 - (i % 3) * 13}%` }} />
                  ))}
                </div>
                <div className="r-fade" />
              </div>
            )}
          </div>
        )}

        {tab === "pdf" && (
          <div className="doc-surface" style={{ padding: 0, display: "flex", flexDirection: "column", height: "calc(100vh - 120px)" }}>
            <iframe
              src={pdfUrl}
              title="Article PDF"
              style={{
                width: "100%",
                flex: 1,
                border: "none",
                borderRadius: "var(--radius-lg)",
                background: "var(--card)",
              }}
            />
          </div>
        )}

        {tab === "markdown" && (
          <div className="doc-surface" style={{ padding: 30 }}>
            <div
              style={{
                maxWidth: 820,
                width: "100%",
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-lg)",
                padding: "28px 30px",
                fontFamily: "var(--font-mono, monospace)",
                fontSize: "13px",
                lineHeight: 1.7,
                color: "var(--surface-foreground)",
                whiteSpace: "pre-wrap",
              }}
            >
              {loadingMarkdown ? (
                <span style={{ color: "var(--muted-foreground)" }}>Loading markdown from archive…</span>
              ) : markdownContent ? (
                markdownContent
              ) : (
                <span style={{ color: "var(--muted-foreground)" }}>No markdown content available.</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div className="av-side">
        <div className="av-block">
          <div className="av-block-h">Source</div>
          <div
            style={{
              display: "flex",
              gap: 11,
              alignItems: "center",
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--surface)",
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: accent,
                display: "grid",
                placeItems: "center",
                color: "#fff",
                fontWeight: 700,
                fontSize: 13,
                fontFamily: "var(--font-editorial)",
              }}
            >
              {shortLabel}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{sourceInfo?.name ?? host}</div>
              <a
                href={article.url}
                target="_blank"
                rel="noopener"
                style={{ fontSize: 11, color: "var(--muted-foreground)" }}
              >
                View original ↗
              </a>
            </div>
          </div>
        </div>

        {/* Editable Tags */}
        <div className="av-block">
          <div className="av-block-h">
            <Icon name="tag" size={13} />
            Tags
            <button
              className="btn"
              data-variant="ghost"
              data-size="sm"
              style={{ fontSize: 11, marginLeft: "auto", height: 22 }}
              onClick={() => {
                setEditingTags((e) => !e);
                if (!editingTags) loadAllTags();
              }}
            >
              {editingTags ? "Done" : "Edit"}
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {articleTags.map((t) => (
              <span
                key={t.id}
                className="chip tagchip"
                style={{ fontSize: 11.5, cursor: editingTags ? "pointer" : "default" }}
              >
                <span
                  className="dot"
                  style={{ background: t.color ?? "var(--brand)", width: 6, height: 6 }}
                />
                {t.name}
                {editingTags && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleRemoveTag(t.id); }}
                    style={{
                      background: "none",
                      border: "none",
                      padding: "0 0 0 4px",
                      cursor: "pointer",
                      color: "var(--muted-foreground)",
                      fontSize: 12,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
          </div>

          {editingTags && (
            <div style={{ marginTop: 8 }}>
              {/* Add existing tag dropdown */}
              {availableTags.length > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 4 }}>Add tag:</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, maxHeight: 120, overflowY: "auto" }}>
                    {availableTags.slice(0, 20).map((t) => (
                      <button
                        key={t.id}
                        className="chip tagchip"
                        style={{ fontSize: 10.5, cursor: "pointer" }}
                        onClick={() => handleAddTag(t)}
                      >
                        <span className="dot" style={{ background: t.color ?? "var(--brand)", width: 5, height: 5 }} />
                        + {t.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Create new tag */}
              {!showCreateTag ? (
                <button
                  className="btn"
                  data-variant="outline"
                  data-size="sm"
                  style={{ fontSize: 11, width: "100%" }}
                  onClick={() => setShowCreateTag(true)}
                >
                  <Icon name="plus" size={12} /> Create new tag
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: 10, border: "1px solid var(--border)", borderRadius: "var(--radius-md)", background: "var(--surface)" }}>
                  <input
                    className="input-press"
                    placeholder="Tag name"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    style={{ fontSize: 12, height: 28 }}
                  />
                  <input
                    className="input-press"
                    placeholder="Description (optional)"
                    value={newTagDesc}
                    onChange={(e) => setNewTagDesc(e.target.value)}
                    style={{ fontSize: 12, height: 28 }}
                  />
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      type="color"
                      value={newTagColor}
                      onChange={(e) => setNewTagColor(e.target.value)}
                      style={{ width: 28, height: 28, border: "none", padding: 0, cursor: "pointer" }}
                    />
                    <button
                      className="btn"
                      data-variant="brand"
                      data-size="sm"
                      style={{ fontSize: 11, flex: 1 }}
                      onClick={handleCreateTag}
                      disabled={!newTagName.trim()}
                    >
                      Create
                    </button>
                    <button
                      className="btn"
                      data-variant="ghost"
                      data-size="sm"
                      style={{ fontSize: 11 }}
                      onClick={() => { setShowCreateTag(false); setNewTagName(""); setNewTagDesc(""); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="av-block">
          <div className="av-block-h">
            <Icon name="play" size={13} />
            Listen
          </div>
          {audioUrl ? (
            <div style={{ padding: "4px 0" }}>
              <AudioPlayer style={{ width: "100%" }}>
                <AudioPlayerElement
                  src={audioUrl}
                  ref={(el: HTMLAudioElement | null) => {
                    audioRef.current = el;
                    if (el) {
                      el.ontimeupdate = handleAudioTimeUpdate;
                    }
                  }}
                />
                <AudioPlayerControlBar>
                  <AudioPlayerPlayButton />
                  <AudioPlayerSeekBackwardButton />
                  <AudioPlayerSeekForwardButton />
                  <AudioPlayerTimeDisplay />
                  <AudioPlayerTimeRange />
                  <AudioPlayerDurationDisplay />
                  <AudioPlayerMuteButton />
                </AudioPlayerControlBar>
              </AudioPlayer>
            </div>
          ) : (
            <div style={{ padding: "8px 0", fontSize: 12, color: "var(--muted-foreground)" }}>
              <Icon name="activity" size={13} style={{ opacity: 0.4, marginRight: 6 }} />
              Audio processing…
            </div>
          )}
        </div>

        <div className="av-block">
          <div className="av-block-h">Actions</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener"
              className="btn"
              data-variant="outline"
              data-size="sm"
            >
              <Icon name="download" size={13} /> Download PDF
            </a>
            <a
              href={article.url}
              target="_blank"
              rel="noopener"
              className="btn"
              data-variant="outline"
              data-size="sm"
            >
              <Icon name="ext" size={13} /> Open source
            </a>
          </div>
        </div>
      </div>

      {/* Floating AI assistant */}
      <Suspense fallback={null}>
        <ArticleAssistant
          articleId={article.id}
          articleTitle={title}
        />
      </Suspense>
    </div>
  );
}
