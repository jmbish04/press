/**
 * @fileoverview ArticleAssistant — assistant-ui modal for article views.
 *
 * Uses the Cloudflare Agents SDK (useAgent + useAgentChat) to connect to
 * the ArticleChatAgent Durable Object. Rendered as a floating modal trigger
 * button that opens an assistant-ui popover with Thread.
 *
 * The agent has tools for search_sources, search_archive, spawn_artifact,
 * and iterate_artifact — supporting dynamic PWA/mindmap creation.
 */
import React, { useEffect, useCallback } from "react";
import {
  AssistantRuntimeProvider,
  AssistantModalPrimitive,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { ArticleChatState } from "../../../backend/ai/agents/articleChat";
import { Thread } from "../assistant-ui/thread";
import { Icon } from "./PressIcon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ArticleAssistantProps {
  /** The article ID this assistant is scoped to. */
  articleId: number;
  /** Article title for display. */
  articleTitle: string;
  /** Callback when the agent spawns an artifact. */
  onArtifactSpawned?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ArticleAssistant({
  articleId,
  articleTitle,
  onArtifactSpawned,
}: ArticleAssistantProps) {
  // Connect to the ArticleChatAgent Durable Object via WebSocket.
  const agent = useAgent<ArticleChatState>({
    agent: "ArticleChatAgent",
    name: `article-${articleId}`,
  });

  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(
    chat as Parameters<typeof useAISDKRuntime>[0],
  );

  // Pin the article as a source whenever we connect.
  useEffect(() => {
    if (agent.state) {
      agent.setState({
        pinnedArticleIds: [articleId],
        sessionName: articleTitle,
      });
    }
  }, [agent, articleId, articleTitle]);

  // Watch for artifact spawning events.
  const refreshOnReady = useCallback(() => {
    if (chat.status === "ready" && onArtifactSpawned) {
      onArtifactSpawned();
    }
  }, [chat.status, onArtifactSpawned]);

  useEffect(() => {
    refreshOnReady();
  }, [refreshOnReady]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <AssistantModalPrimitive.Root>
        <AssistantModalPrimitive.Trigger asChild>
          <button className="asst-pill">
            <span className="ai-orb" />
            Ask Press AI
          </button>
        </AssistantModalPrimitive.Trigger>
        <AssistantModalPrimitive.Content
          className="asst-modal"
          style={{
            position: "fixed",
            bottom: 80,
            right: 24,
            width: 420,
            maxWidth: "calc(100vw - 32px)",
            height: "min(600px, 80vh)",
            borderRadius: "var(--radius-2xl)",
            border: "1px solid var(--border)",
            background: "var(--sidebar)",
            boxShadow: "var(--shadow-2xl)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            zIndex: 100,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "14px 16px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span className="ai-orb" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Press AI</div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: "var(--font-mono, monospace)",
                  color: "var(--muted-foreground)",
                  marginTop: 3,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                Scoped to: {articleTitle}
              </div>
            </div>
          </div>

          {/* Scope indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 16px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface)",
              fontSize: 12,
              color: "var(--muted-foreground)",
            }}
          >
            <Icon name="layers" size={12} />
            1 article pinned as source
            <span
              className="dot"
              style={{
                background: "var(--ok)",
                width: 5,
                height: 5,
                marginLeft: 4,
              }}
            />
            Connected
          </div>

          {/* Chat thread */}
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
        </AssistantModalPrimitive.Content>
      </AssistantModalPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
