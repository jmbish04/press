import type { UIMessage } from "ai";

import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { ArticleChatState } from "../../backend/ai/agents/articleChat";

/** An archived article shown in the sources panel. */
export interface NotebookArticle {
  id: number;
  url: string;
  createdAt: string;
}

/** A spawned artifact record returned by `/api/artifacts`. */
interface SpawnedArtifact {
  id: string;
  type: "pwa" | "mindmap" | "summary-card";
  title: string;
  publicUrl: string | null;
  createdAt: number;
}

interface NotebookChatProps {
  articles: NotebookArticle[];
  sessionId: string;
}

const SPAWN_LABELS: Record<SpawnedArtifact["type"], string> = {
  pwa: "📱 PWA",
  mindmap: "🗺 Mind Map",
  "summary-card": "📄 Summary",
};

/** Best-effort human label for an article URL. */
function articleLabel(url: string): { title: string; host: string } {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/$/, "");
    return {
      title: path && path !== "" ? path.slice(1) || parsed.hostname : parsed.hostname,
      host: parsed.hostname,
    };
  } catch {
    return { title: url, host: url };
  }
}

function messageText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/**
 * NotebookLM-style three-pane interface: article sources, an agent chat, and a
 * gallery of spawned artifacts. Backed by the ArticleChatAgent Durable Object.
 */
export function NotebookChat({ articles, sessionId }: NotebookChatProps) {
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [artifacts, setArtifacts] = useState<SpawnedArtifact[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [artifactsOpen, setArtifactsOpen] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const agent = useAgent<ArticleChatState>({ agent: "ArticleChatAgent", name: sessionId });
  const { messages, sendMessage, status } = useAgentChat({ agent });
  const busy = status === "submitted" || status === "streaming";

  // Sync pinned sources into the agent's Durable Object state.
  const syncSources = useCallback(
    (ids: Set<number>) => {
      agent.setState({
        pinnedArticleIds: [...ids],
        sessionName: agent.state?.sessionName ?? "Untitled notebook",
      });
    },
    [agent],
  );

  const togglePin = (id: number) => {
    setPinned((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      syncSources(next);
      return next;
    });
  };

  const setAll = (ids: number[]) => {
    const next = new Set(ids);
    setPinned(next);
    syncSources(next);
  };

  const refreshArtifacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/artifacts?sessionId=${encodeURIComponent(sessionId)}`);
      if (res.ok) setArtifacts((await res.json()) as SpawnedArtifact[]);
    } catch {
      // Ignore transient fetch failures.
    }
  }, [sessionId]);

  useEffect(() => {
    void refreshArtifacts();
  }, [refreshArtifacts]);

  // Refresh the gallery whenever a chat turn finishes (an artifact may exist).
  useEffect(() => {
    if (status === "ready") void refreshArtifacts();
  }, [status, refreshArtifacts]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  };

  const quickSpawn = (type: SpawnedArtifact["type"]) => {
    if (pinned.size === 0 || busy) return;
    const label =
      type === "mindmap" ? "mind map" : type === "summary-card" ? "summary card" : "reading PWA";
    sendMessage({ text: `Please spawn a ${label} for the currently pinned articles.` });
  };

  return (
    <div className="bg-background text-foreground flex h-screen overflow-hidden">
      {/* Sources panel */}
      <aside
        className={`border-border flex flex-col border-r transition-all ${sourcesOpen ? "w-72" : "w-12"}`}
      >
        <div className="border-border flex items-center justify-between border-b px-3 py-3">
          {sourcesOpen && (
            <span className="text-xs font-semibold uppercase tracking-wider">
              Sources ({pinned.size}/{articles.length})
            </span>
          )}
          <button
            onClick={() => setSourcesOpen((o) => !o)}
            className="text-muted-foreground ml-auto hover:text-foreground"
          >
            {sourcesOpen ? "◀" : "▶"}
          </button>
        </div>
        {sourcesOpen && (
          <>
            <div className="border-border flex gap-2 border-b px-3 py-2 text-xs">
              <button onClick={() => setAll(articles.map((a) => a.id))} className="hover:underline">
                All
              </button>
              <span className="text-muted-foreground">·</span>
              <button onClick={() => setAll([])} className="hover:underline">
                None
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {articles.length === 0 && (
                <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                  No archived articles yet.
                </p>
              )}
              {articles.map((article) => {
                const { title, host } = articleLabel(article.url);
                return (
                  <label
                    key={article.id}
                    className="border-border/50 hover:bg-muted flex cursor-pointer items-start gap-2 border-b px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      checked={pinned.has(article.id)}
                      onChange={() => togglePin(article.id)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">{title}</span>
                      <span className="text-muted-foreground block truncate text-[10px]">
                        {host}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </>
        )}
      </aside>

      {/* Chat panel */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border bg-muted/30 flex items-center gap-2 border-b px-4 py-2">
          <span className="text-muted-foreground mr-1 text-xs">Spawn:</span>
          {(["pwa", "mindmap", "summary-card"] as const).map((type) => (
            <button
              key={type}
              onClick={() => quickSpawn(type)}
              disabled={pinned.size === 0 || busy}
              className="bg-muted hover:bg-muted/70 rounded-none px-2.5 py-1 text-xs disabled:opacity-30"
            >
              {SPAWN_LABELS[type]}
            </button>
          ))}
          {pinned.size === 0 && (
            <span className="text-muted-foreground ml-2 text-[10px]">← pin sources to enable</span>
          )}
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <p className="text-muted-foreground text-xs uppercase tracking-wider">
              Pin article sources, then ask the agent to explore or spawn artifacts.
            </p>
          )}
          {messages.map((message) => (
            <div key={message.id} className="space-y-1">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest">
                {message.role}
              </p>
              <p className="whitespace-pre-wrap text-sm">{messageText(message)}</p>
            </div>
          ))}
          {status === "submitted" && <p className="text-muted-foreground text-xs">Thinking…</p>}
        </div>

        <form onSubmit={submit} className="border-border flex gap-2 border-t p-4">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your sources…"
            className="bg-background border-input flex-1 rounded-none border px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-1"
          />
          <button
            type="submit"
            disabled={busy}
            className="bg-primary text-primary-foreground rounded-none px-4 py-2 text-xs font-medium uppercase tracking-widest disabled:opacity-30"
          >
            Send
          </button>
        </form>
      </div>

      {/* Artifacts panel */}
      <aside
        className={`border-border flex flex-col border-l transition-all ${artifactsOpen ? "w-72" : "w-12"}`}
      >
        <div className="border-border flex items-center justify-between border-b px-3 py-3">
          <button
            onClick={() => setArtifactsOpen((o) => !o)}
            className="text-muted-foreground hover:text-foreground"
          >
            {artifactsOpen ? "▶" : "◀"}
          </button>
          {artifactsOpen && (
            <span className="ml-2 text-xs font-semibold uppercase tracking-wider">
              Artifacts ({artifacts.length})
            </span>
          )}
        </div>
        {artifactsOpen && (
          <div className="flex-1 overflow-y-auto">
            {artifacts.length === 0 && (
              <p className="text-muted-foreground px-4 py-6 text-center text-xs">
                Spawn a PWA or mind map to see it here.
              </p>
            )}
            {artifacts.map((artifact) => (
              <div key={artifact.id} className="border-border/50 hover:bg-muted border-b px-3 py-3">
                <p className="truncate text-xs font-medium">{artifact.title}</p>
                <p className="text-muted-foreground text-[10px] capitalize">{artifact.type}</p>
                {artifact.publicUrl && (
                  <div className="mt-1 flex gap-2 text-[10px]">
                    <button
                      onClick={() => setPreview(artifact.publicUrl)}
                      className="hover:underline"
                    >
                      Preview
                    </button>
                    <a
                      href={artifact.publicUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      Open ↗
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </aside>

      {/* Preview modal */}
      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-8"
          onClick={() => setPreview(null)}
        >
          <div
            className="h-full w-full max-w-5xl overflow-hidden bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between bg-zinc-900 px-4 py-2">
              <span className="truncate text-xs text-zinc-300">{preview}</span>
              <button onClick={() => setPreview(null)} className="text-zinc-400 hover:text-white">
                ✕
              </button>
            </div>
            <iframe
              src={preview}
              title="Artifact preview"
              className="h-[calc(100%-36px)] w-full"
              sandbox="allow-scripts allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  );
}
