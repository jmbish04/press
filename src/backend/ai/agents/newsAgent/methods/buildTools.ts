/**
 * @fileoverview Tool definitions for the NewsAgent.
 */

import { tool } from "ai";
import { z } from "zod";

import { searchArchive } from "./searchArchive";

/** Builds the AI SDK tool set bound to the request environment. */
export function buildNewsTools(env: Env) {
  return {
    searchArchive: tool({
      description:
        "Semantic search across every archived article. Use before answering factual questions.",
      inputSchema: z.object({
        query: z.string().describe("Natural-language search query"),
      }),
      execute: async ({ query }) => searchArchive(env, query),
    }),
  };
}
