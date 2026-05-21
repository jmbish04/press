import type { D1Database, VectorizeIndex, Ai, Fetcher } from "@cloudflare/workers-types";

import { AIChatAgent } from "agents";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./backend/db/schemas/index";

export interface Env {
  DB: D1Database;
  VECTORIZE: VectorizeIndex;
  AI: Ai;
  BROWSER: Fetcher;
  NEWS_AGENT: DurableObjectNamespace;
  AI_GATEWAY_ID: string;
  CF_ACCOUNT_ID: string;
}

export class NewsAgent extends AIChatAgent<Env> {
  async onStart() {
    this.chat.system = `You are a helpful knowledge assistant analyzing the user's archived Chrome tabs. Use your tools to find relevant articles.`;

    this.chat.tools = {
      searchArchive: {
        description: "Search for archived articles by semantic query.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
        execute: async ({ query }: { query: string }) => {
          const queryEmbed = await this.env.AI.run(
            "@cf/baai/bge-base-en-v1.5",
            {
              text: [query],
            },
            { gateway: { id: this.env.AI_GATEWAY_ID } },
          );

          const vectorRes = await this.env.VECTORIZE.query(queryEmbed.data[0], { topK: 3 });
          if (!vectorRes.matches || vectorRes.matches.length === 0) return "No matching articles.";

          const db = drizzle(this.env.DB, { schema });
          const ids = vectorRes.matches.map((m) => parseInt(m.id));
          const relevantArticles = await db
            .select()
            .from(schema.articles)
            .where(inArray(schema.articles.id, ids));

          return relevantArticles
            .map((a) => `Source URL: ${a.url}\nContent: ${a.rawContent?.substring(0, 800)}`)
            .join("\n\n");
        },
      },
    };
  }
}
