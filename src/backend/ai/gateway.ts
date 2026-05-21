/**
 * @fileoverview Cloudflare AI Gateway configuration.
 *
 * Every Workers AI call in this project routes through a single AI Gateway so
 * usage is observable, cacheable, and rate-limited. Because the gateway accepts
 * both `@cf/*` Workers AI models and `{provider}/{model}` strings, any provider
 * or model can be selected without changing call sites.
 */

import { createWorkersAI, type WorkersAI } from "workers-ai-provider";

/** Gateway slug. AI Gateway auto-provisions a gateway on first authenticated use. */
export const AI_GATEWAY_ID = "default-gateway";

/**
 * Options object for raw `env.AI.run(model, input, AI_GATEWAY_OPTIONS)` calls.
 * The account is inferred from the `AI` binding.
 */
export const AI_GATEWAY_OPTIONS = {
  gateway: { id: AI_GATEWAY_ID },
} as const;

/**
 * Default model IDs. Override per call to use any other Workers AI model or a
 * `{provider}/{model}` string (e.g. `"openai/gpt-4o"`) routed via the gateway.
 */
export const MODELS = {
  /** Conversational agent model. */
  chat: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
  /** Structured metadata extraction. */
  extract: "@cf/meta/llama-3.1-8b-instruct",
  /** Embeddings — must match the model the `press` Vectorize index was created with. */
  embedding: "@cf/baai/bge-large-en-v1.5",
  /** Long-form HTML/code generation for spawned artifacts. */
  generate: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
} as const;

/**
 * AI SDK provider bound to `env.AI` and routed through the gateway.
 * `getAI(env)("@cf/...")` or `getAI(env)("openai/gpt-4o")` both work.
 */
export function getAI(env: Env) {
  return createWorkersAI({ binding: env.AI, gateway: { id: AI_GATEWAY_ID } });
}

/**
 * Returns an AI SDK language model for chat/agent use. `model` accepts any
 * Workers AI model or `{provider}/{model}` string supported by the gateway.
 */
export function chatModel(env: Env, model: string = MODELS.chat) {
  return getAI(env)(model as Parameters<WorkersAI>[0]);
}

/**
 * Embeds a single string with the configured embedding model, routed through
 * the gateway. Returns the embedding vector, or `null` if the model returned
 * no data (e.g. an async response).
 */
export async function embed(env: Env, text: string): Promise<number[] | null> {
  const result = await env.AI.run(MODELS.embedding, { text: [text] }, AI_GATEWAY_OPTIONS);
  const data = (result as { data?: number[][] }).data;
  return data?.[0] ?? null;
}
