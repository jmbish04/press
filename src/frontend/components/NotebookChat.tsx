import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { ExternalLink, PanelLeftClose, PanelRightClose, Tag as TagIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import type { ArticleChatState } from "../../backend/ai/agents/articleChat";

import { Thread } from "./assistant-ui/thread";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";

export interface NotebookArticle {
  id: number;
  url: string;
  createdAt: string;
}

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

const ARTIFACT_LABELS: Record<SpawnedArtifact["type"], string> = {
  pwa: "📱 PWA",
  mindmap: "🗺 Mind Map",
  "summary-card": "📄 Summary",
};

function articleHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/* ── sources panel ────────────────────────────────────────────────────── */

function SourcesPanel({
  articles,
  pinned,
  togglePin,
  setAll,
  open,
  onToggle,
}: {
  articles: NotebookArticle[];
  pinned: Set<number>;
  togglePin: (id: number) => void;
  setAll: (ids: number[]) => void;
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
    return (
      <Card className="bg-card flex w-12 shrink-0 flex-col items-center justify-start py-3">
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Open sources">
          <PanelLeftClose className="h-4 w-4 rotate-180" />
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex w-72 shrink-0 flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-sm font-semibold">
          Sources{" "}
          <span className="text-muted-foreground font-normal">
            {pinned.size}/{articles.length}
          </span>
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse sources">
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Separator />
      <div className="flex items-center gap-2 px-4 py-2 text-xs">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2"
          onClick={() => setAll(articles.map((a) => a.id))}
        >
          All
        </Button>
        <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setAll([])}>
          None
        </Button>
      </div>
      <Separator />
      <CardContent className="flex-1 overflow-y-auto p-0">
        {articles.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-center text-xs">
            No articles archived yet.
          </p>
        )}
        {articles.map((article) => (
          <label
            key={article.id}
            className="hover:bg-muted/50 border-border/40 flex cursor-pointer items-start gap-2 border-b px-4 py-2.5"
          >
            <input
              type="checkbox"
              checked={pinned.has(article.id)}
              onChange={() => togglePin(article.id)}
              className="mt-0.5 shrink-0"
            />
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{articleHost(article.url)}</span>
              <span className="text-muted-foreground block truncate text-[10px]">
                {article.url}
              </span>
            </span>
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── artifacts panel ──────────────────────────────────────────────────── */

function ArtifactsPanel({
  artifacts,
  onPreview,
  open,
  onToggle,
}: {
  artifacts: SpawnedArtifact[];
  onPreview: (url: string) => void;
  open: boolean;
  onToggle: () => void;
}) {
  if (!open) {
    return (
      <Card className="bg-card flex w-12 shrink-0 flex-col items-center justify-start py-3">
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Open artifacts">
          <PanelRightClose className="h-4 w-4 rotate-180" />
        </Button>
      </Card>
    );
  }

  return (
    <Card className="flex w-72 shrink-0 flex-col overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
        <CardTitle className="text-sm font-semibold">
          Artifacts <span className="text-muted-foreground font-normal">{artifacts.length}</span>
        </CardTitle>
        <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Collapse artifacts">
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="flex-1 overflow-y-auto p-0">
        {artifacts.length === 0 && (
          <p className="text-muted-foreground px-4 py-6 text-center text-xs">
            Ask the agent to spawn a PWA or summary to see it here.
          </p>
        )}
        {artifacts.map((artifact) => (
          <div key={artifact.id} className="border-border/40 hover:bg-muted/50 border-b px-4 py-3">
            <p className="truncate text-xs font-medium">{artifact.title}</p>
            <p className="text-muted-foreground mb-2 text-[10px] capitalize">
              {ARTIFACT_LABELS[artifact.type] ?? artifact.type}
            </p>
            {artifact.publicUrl && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => onPreview(artifact.publicUrl!)}
                >
                  Preview
                </Button>
                <a
                  href={artifact.publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* ── root ─────────────────────────────────────────────────────────────── */

export function NotebookChat({ articles, sessionId }: NotebookChatProps) {
  const [pinned, setPinned] = useState<Set<number>>(new Set());
  const [artifacts, setArtifacts] = useState<SpawnedArtifact[]>([]);
  const [sourcesOpen, setSourcesOpen] = useState(true);
  const [artifactsOpen, setArtifactsOpen] = useState(true);
  const [preview, setPreview] = useState<string | null>(null);

  const agent = useAgent<ArticleChatState>({
    agent: "ArticleChatAgent",
    name: sessionId,
  });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat as Parameters<typeof useAISDKRuntime>[0]);

  /** Sync pinned source IDs into the agent's DO state. */
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

  useEffect(() => {
    if (chat.status === "ready") void refreshArtifacts();
  }, [chat.status, refreshArtifacts]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="bg-background text-foreground flex h-screen gap-2 overflow-hidden p-2">
        <SourcesPanel
          articles={articles}
          pinned={pinned}
          togglePin={togglePin}
          setAll={setAll}
          open={sourcesOpen}
          onToggle={() => setSourcesOpen((o) => !o)}
        />

        <Card className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
            <CardTitle className="text-sm font-semibold">Notebook chat</CardTitle>
            <div className="flex items-center gap-1.5 text-xs">
              {pinned.size > 0 ? (
                <Badge variant="secondary" className="gap-1">
                  <TagIcon className="h-3 w-3" />
                  {pinned.size} pinned
                </Badge>
              ) : (
                <span className="text-muted-foreground">no sources pinned</span>
              )}
            </div>
          </CardHeader>
          <Separator />
          <div className="flex min-h-0 flex-1 flex-col">
            <Thread />
          </div>
        </Card>

        <ArtifactsPanel
          artifacts={artifacts}
          onPreview={setPreview}
          open={artifactsOpen}
          onToggle={() => setArtifactsOpen((o) => !o)}
        />

        {preview && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-8"
            onClick={() => setPreview(null)}
          >
            <Card
              className="flex h-full w-full max-w-5xl flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 py-3">
                <CardTitle className="truncate text-xs font-mono">{preview}</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                  Close
                </Button>
              </CardHeader>
              <Separator />
              <iframe
                src={preview}
                title="Artifact preview"
                className="flex-1 bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            </Card>
          </div>
        )}
      </div>
    </AssistantRuntimeProvider>
  );
}
