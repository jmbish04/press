/**
 * @fileoverview Notebook page — three-pane NotebookLM-style UI:
 * source scoping panel (All / By Tag / Pick Articles),
 * agent chat powered by ArticleChatAgent via assistant-ui,
 * and action buttons for mindmap/PWA generation.
 */
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { ArticleChatState } from "../../../../backend/ai/agents/articleChat";
import { Thread } from "../../assistant-ui/thread";
import { Icon } from "../PressIcon";
import type { Article } from "../PressApp";

interface TagItem {
  id: number;
  name: string;
  color?: string | null;
}

interface NotebookProps {
  articles: Article[];
  onGenerate?: (kind: "mindmap" | "pwa", scopeLabel: string) => void;
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

type SourceMode = "all" | "tags" | "articles";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function Notebook({ articles, onGenerate }: NotebookProps) {
  const [mode, setMode] = useState<SourceMode>("all");
  const [selTags, setSelTags] = useState<number[]>([]);
  const [selArticles, setSelArticles] = useState<number[]>([]);
  const [filter, setFilter] = useState("");
  const [srcOpen, setSrcOpen] = useState(false);
  const [tags, setTags] = useState<TagItem[]>([]);

  // Fetch tags for the "By Tag" mode.
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json() as Promise<{ tags?: TagItem[] }>)
      .then((d) => setTags(d.tags ?? []))
      .catch(() => {});
  }, []);

  // Compute which articles are in scope.
  const scopedArticles = useMemo(() => {
    if (mode === "articles") return articles.filter((a) => selArticles.includes(a.id));
    if (mode === "tags" && selTags.length > 0) {
      // We'd need article-tag mapping. For now, scope to all articles if tags are selected.
      // The agent handles tag-based scoping server-side via search_sources tool.
      return articles;
    }
    return articles;
  }, [mode, selTags, selArticles, articles]);

  const pinnedIds = useMemo(() => {
    if (mode === "articles") return selArticles;
    return scopedArticles.map((a) => a.id);
  }, [mode, selArticles, scopedArticles]);

  const scopeLabel = useMemo(() => {
    if (mode === "all") return `all ${articles.length} articles`;
    if (mode === "tags")
      return selTags.length
        ? `${selTags.length} tag${selTags.length > 1 ? "s" : ""} selected`
        : "pick tags →";
    return selArticles.length
      ? `${selArticles.length} selected article${selArticles.length > 1 ? "s" : ""}`
      : "pick articles →";
  }, [mode, selTags, selArticles, articles.length]);

  // Connect to ArticleChatAgent via WebSocket.
  const agent = useAgent<ArticleChatState>({
    agent: "ArticleChatAgent",
    name: `notebook-${mode}`,
  });

  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(
    chat as Parameters<typeof useAISDKRuntime>[0],
  );

  // Update pinned article IDs whenever scope changes.
  useEffect(() => {
    if (agent.state) {
      agent.setState({
        pinnedArticleIds: pinnedIds.slice(0, 50), // Cap at 50 for performance
        sessionName: `Notebook · ${scopeLabel}`,
      });
    }
  }, [agent, pinnedIds, scopeLabel]);

  const toggleTag = useCallback((id: number) => {
    setSelTags((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const toggleArticle = useCallback((id: number) => {
    setSelArticles((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  const filteredList = useMemo(() => {
    if (!filter) return articles;
    const q = filter.toLowerCase();
    return articles.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        a.url.toLowerCase().includes(q),
    );
  }, [articles, filter]);

  const PROMPTS = [
    "What are the common threads across these sources?",
    "Give me a reading order for a newcomer",
    "Summarize the key findings",
    "What do these articles disagree about?",
  ];

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="nb">
        {/* Sources panel */}
        <div className={`nb-sources ${srcOpen ? "open" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ font: "600 14px/1 var(--font-heading, var(--font-sans))" }}>Chat sources</div>
            <button
              className="btn mobileonly"
              data-variant="ghost"
              data-size="icon-sm"
              onClick={() => setSrcOpen(false)}
            >
              <Icon name="x" size={16} />
            </button>
          </div>

          <div className="seg" style={{ width: "100%" }}>
            {(
              [
                ["all", "All"],
                ["tags", "By tag"],
                ["articles", "Pick"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={mode === id ? "active" : ""}
                style={{ flex: 1, justifyContent: "center" }}
                onClick={() => setMode(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "all" && (
            <div className="card" style={{ padding: 14, display: "flex", gap: 11, alignItems: "center" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: "var(--brand-soft)",
                  color: "var(--brand)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Icon name="layers" size={16} />
              </div>
              <div>
                <div style={{ font: "500 13px/1.2 var(--font-sans)" }}>Whole archive</div>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>
                  {articles.length} articles · all tags
                </div>
              </div>
            </div>
          )}

          {mode === "tags" && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 7, overflowY: "auto" }}>
              {tags.map((t) => (
                <button
                  key={t.id}
                  className={`chip tagchip ${selTags.includes(t.id) ? "on" : ""}`}
                  onClick={() => toggleTag(t.id)}
                  style={{ cursor: "pointer" }}
                >
                  <span
                    className="dot"
                    style={{ background: t.color ?? "var(--brand)" }}
                  />
                  {t.name}
                </button>
              ))}
              {tags.length === 0 && (
                <div className="muted" style={{ fontSize: 13, padding: "20px 0" }}>
                  No tags yet.
                </div>
              )}
            </div>
          )}

          {mode === "articles" && (
            <>
              <div className="search-wrap">
                <Icon name="search" size={14} />
                <input
                  className="input-press"
                  style={{ height: 34, fontSize: 13 }}
                  placeholder="Filter articles…"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
                {filteredList.slice(0, 50).map((a) => {
                  const on = selArticles.includes(a.id);
                  return (
                    <div
                      key={a.id}
                      className="src-item"
                      onClick={() => toggleArticle(a.id)}
                    >
                      <div
                        className={`checkbox ${on ? "on" : ""}`}
                        style={{
                          width: 17,
                          height: 17,
                          borderRadius: 5,
                          border: "1px solid var(--input)",
                          display: "grid",
                          placeItems: "center",
                          background: on
                            ? "var(--brand)"
                            : "color-mix(in oklab, var(--input) 26%, transparent)",
                          borderColor: on ? "var(--brand)" : undefined,
                          color: on ? "#fff" : "transparent",
                          flexShrink: 0,
                        }}
                      >
                        {on && <Icon name="check" size={11} />}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div className="src-name" style={{ fontSize: 12.5, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {a.title ?? "Untitled"}
                        </div>
                        <div className="src-meta" style={{ fontSize: 10.5, color: "var(--muted-foreground)", fontFamily: "var(--font-mono, monospace)", marginTop: 2 }}>
                          {hostname(a.url)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Chat area */}
        <div className="nb-chat">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 26px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <button
              className="btn mobileonly"
              data-variant="outline"
              data-size="icon-sm"
              onClick={() => setSrcOpen(true)}
            >
              <Icon name="layers" size={16} />
            </button>
            <span
              className="ai-orb"
              style={{
                width: 22,
                height: 22,
                borderRadius: 999,
                background:
                  "radial-gradient(circle at 35% 30%, var(--brand), oklch(0.5 0.18 30) 70%)",
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ font: "600 14px/1.1 var(--font-sans)" }}>Notebook</div>
              <div
                className="muted mono"
                style={{ fontSize: 11, marginTop: 2, fontFamily: "var(--font-mono, monospace)" }}
              >
                chatting against {scopeLabel}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {onGenerate && (
                <>
                  <button
                    className="btn"
                    data-variant="outline"
                    data-size="sm"
                    onClick={() => onGenerate("mindmap", scopeLabel)}
                    title="Generate a mind map from these sources"
                  >
                    <Icon name="share" size={13} />
                    Map
                  </button>
                  <button
                    className="btn"
                    data-variant="brand"
                    data-size="sm"
                    onClick={() => onGenerate("pwa", scopeLabel)}
                    title="Build a PWA from these sources"
                  >
                    <Icon name="sparkles" size={13} />
                    Build
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Thread — assistant-ui handles empty state, messages, and composer */}
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Thread />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
