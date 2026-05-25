/**
 * @fileoverview ArticleChatAgent — a NotebookLM-style chat Durable Object.
 *
 * Each instance is one chat session. It grounds responses in a user-selected
 * set of archived articles (RAG over Vectorize) and can spawn visual artifacts.
 * All inference runs through Workers AI via the shared AI Gateway.
 */

import type { StreamTextOnFinishCallback, ToolSet } from "ai";

import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";

import type { ArticleChatState, ChatToolContext } from "./types";

import { chatModel } from "../../gateway";
import { buildArticleChatTools } from "./methods/buildTools";
import { buildSystemPrompt } from "./methods/systemPrompt";
import { INITIAL_CHAT_STATE } from "./types";

export class ArticleChatAgent extends AIChatAgent<Env, ArticleChatState> {
  initialState: ArticleChatState = INITIAL_CHAT_STATE;

  /** Builds the per-session context handed to the tool set. */
  private toolContext(): ChatToolContext {
    return {
      env: this.env,
      sessionId: this.name,
      getPinned: () => this.state.pinnedArticleIds,
      setSources: (ids, name) =>
        this.setState({
          pinnedArticleIds: ids,
          sessionName: name ?? this.state.sessionName,
        }),
    };
  }

  async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>) {
    const tools = buildArticleChatTools(this.toolContext());
    const result = streamText({
      model: chatModel(this.env),
      system: buildSystemPrompt(this.state),
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(8),
      onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof tools>,
    });

    return result.toUIMessageStreamResponse();
  }
}

export type {
  ArticleChatState,
  ArtifactType,
  SpawnArtifactInput,
  SpawnArtifactResult,
} from "./types";
