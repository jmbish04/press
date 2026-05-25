/**
 * @fileoverview NewsAgent — a chat agent over the archived article corpus.
 *
 * Extends `AIChatAgent` (WebSocket chat protocol) and answers questions by
 * grounding responses in Vectorize RAG results. All inference runs through
 * Workers AI via the shared AI Gateway.
 */

import type { StreamTextOnFinishCallback, ToolSet } from "ai";

import { AIChatAgent } from "@cloudflare/ai-chat";
import { convertToModelMessages, stepCountIs, streamText } from "ai";

import { chatModel } from "../../gateway";
import { buildNewsTools } from "./methods/buildTools";

const SYSTEM_PROMPT = `You are a knowledge assistant for a personal archive of saved articles.
Use the searchArchive tool to find relevant articles before answering factual questions.
Cite article titles or URLs when you reference them, and say so plainly when the archive
does not contain an answer rather than guessing.`;

export class NewsAgent extends AIChatAgent<Env> {
  async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>) {
    const tools = buildNewsTools(this.env);
    const result = streamText({
      model: chatModel(this.env),
      system: SYSTEM_PROMPT,
      messages: await convertToModelMessages(this.messages),
      tools,
      stopWhen: stepCountIs(5),
      onFinish: onFinish as unknown as StreamTextOnFinishCallback<typeof tools>,
    });

    return result.toUIMessageStreamResponse();
  }
}

export type { SearchArchiveInput } from "./types";
