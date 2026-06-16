/**
 * @fileoverview Article narration API.
 *
 * Generates TTS audio via Workers AI Deepgram Aura-2 and stores it in R2.
 * The audio is streamed from R2 on subsequent requests.
 */

import { eq } from "drizzle-orm";
import { Hono } from "hono";

import { getDb } from "../../db";
import { articles, preferences } from "../../db/schemas";
import { AI_GATEWAY_OPTIONS } from "../../ai/gateway";
import { narrateFullArticle } from "../../ai/ingest/narrateFullArticle";

/** Deepgram Aura-2 model on Workers AI. */
const TTS_MODEL = "@cf/deepgram/aura-2-en" as const;

/** Available Aura-2 voices. */
export const VOICES = [
  {
    id: "amalthea",
    name: "Amalthea",
    gender: "female",
    age: "Young Adult",
    language: "en-ph",
    accent: "Filipino",
    characteristics: ["Engaging", "Natural", "Cheerful"],
    useCases: ["Casual chat"],
  },
  {
    id: "andromeda",
    name: "Andromeda",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Casual", "Expressive", "Comfortable"],
    useCases: ["Customer service", "IVR"],
  },
  {
    id: "apollo",
    name: "Apollo",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Confident", "Comfortable", "Casual"],
    useCases: ["Casual chat"],
  },
  {
    id: "arcas",
    name: "Arcas",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Natural", "Smooth", "Clear", "Comfortable"],
    useCases: ["Customer service", "casual chat"],
  },
  {
    id: "aries",
    name: "Aries",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Warm", "Energetic", "Caring"],
    useCases: ["Casual chat"],
  },
  {
    id: "asteria",
    name: "Asteria",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Clear", "Confident", "Knowledgeable", "Energetic"],
    useCases: ["Advertising"],
  },
  {
    id: "athena",
    name: "Athena",
    gender: "female",
    age: "Mature",
    language: "en-us",
    accent: "American",
    characteristics: ["Calm", "Smooth", "Professional"],
    useCases: ["Storytelling"],
  },
  {
    id: "atlas",
    name: "Atlas",
    gender: "male",
    age: "Mature",
    language: "en-us",
    accent: "American",
    characteristics: ["Enthusiastic", "Confident", "Approachable", "Friendly"],
    useCases: ["Advertising"],
  },
  {
    id: "aurora",
    name: "Aurora",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Cheerful", "Expressive", "Energetic"],
    useCases: ["Interview"],
  },
  {
    id: "callista",
    name: "Callista",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Clear", "Energetic", "Professional", "Smooth"],
    useCases: ["IVR"],
  },
  {
    id: "cora",
    name: "Cora",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Smooth", "Melodic", "Caring"],
    useCases: ["Storytelling"],
  },
  {
    id: "cordelia",
    name: "Cordelia",
    gender: "female",
    age: "Young Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Approachable", "Warm", "Polite"],
    useCases: ["Storytelling"],
  },
  {
    id: "delia",
    name: "Delia",
    gender: "female",
    age: "Young Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Casual", "Friendly", "Cheerful", "Breathy"],
    useCases: ["Interview"],
  },
  {
    id: "draco",
    name: "Draco",
    gender: "male",
    age: "Adult",
    language: "en-gb",
    accent: "British",
    characteristics: ["Warm", "Approachable", "Trustworthy", "Baritone"],
    useCases: ["Storytelling"],
  },
  {
    id: "electra",
    name: "Electra",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Professional", "Engaging", "Knowledgeable"],
    useCases: ["IVR", "advertising", "customer service"],
  },
  {
    id: "harmonia",
    name: "Harmonia",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Empathetic", "Clear", "Calm", "Confident"],
    useCases: ["Customer service"],
  },
  {
    id: "helena",
    name: "Helena",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Caring", "Natural", "Positive", "Friendly", "Raspy"],
    useCases: ["IVR", "casual chat"],
  },
  {
    id: "hera",
    name: "Hera",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Smooth", "Warm", "Professional"],
    useCases: ["Informative"],
  },
  {
    id: "hermes",
    name: "Hermes",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Expressive", "Engaging", "Professional"],
    useCases: ["Informative"],
  },
  {
    id: "hyperion",
    name: "Hyperion",
    gender: "male",
    age: "Adult",
    language: "en-au",
    accent: "Australian",
    characteristics: ["Caring", "Warm", "Empathetic"],
    useCases: ["Interview"],
  },
  {
    id: "iris",
    name: "Iris",
    gender: "female",
    age: "Young Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Cheerful", "Positive", "Approachable"],
    useCases: ["IVR", "advertising", "customer service"],
  },
  {
    id: "janus",
    name: "Janus",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Southern", "Smooth", "Trustworthy"],
    useCases: ["Storytelling"],
  },
  {
    id: "juno",
    name: "Juno",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Natural", "Engaging", "Melodic", "Breathy"],
    useCases: ["Interview"],
  },
  {
    id: "jupiter",
    name: "Jupiter",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Expressive", "Knowledgeable", "Baritone"],
    useCases: ["Informative"],
  },
  {
    id: "luna",
    name: "Luna",
    gender: "female",
    age: "Young Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Friendly", "Natural", "Engaging"],
    useCases: ["IVR"],
  },
  {
    id: "mars",
    name: "Mars",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Smooth", "Patient", "Trustworthy", "Baritone"],
    useCases: ["Customer service"],
  },
  {
    id: "minerva",
    name: "Minerva",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Positive", "Friendly", "Natural"],
    useCases: ["Storytelling"],
  },
  {
    id: "neptune",
    name: "Neptune",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Professional", "Patient", "Polite"],
    useCases: ["Customer service"],
  },
  {
    id: "odysseus",
    name: "Odysseus",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Calm", "Smooth", "Comfortable", "Professional"],
    useCases: ["Advertising"],
  },
  {
    id: "ophelia",
    name: "Ophelia",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Expressive", "Enthusiastic", "Cheerful"],
    useCases: ["Interview"],
  },
  {
    id: "orion",
    name: "Orion",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Approachable", "Comfortable", "Calm", "Polite"],
    useCases: ["Informative"],
  },
  {
    id: "orpheus",
    name: "Orpheus",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Professional", "Clear", "Confident", "Trustworthy"],
    useCases: ["Customer service", "storytelling"],
  },
  {
    id: "pandora",
    name: "Pandora",
    gender: "female",
    age: "Adult",
    language: "en-gb",
    accent: "British",
    characteristics: ["Smooth", "Calm", "Melodic", "Breathy"],
    useCases: ["IVR", "informative"],
  },
  {
    id: "phoebe",
    name: "Phoebe",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Energetic", "Warm", "Casual"],
    useCases: ["Customer service"],
  },
  {
    id: "pluto",
    name: "Pluto",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Smooth", "Calm", "Empathetic", "Baritone"],
    useCases: ["Interview", "storytelling"],
  },
  {
    id: "saturn",
    name: "Saturn",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Knowledgeable", "Confident", "Baritone"],
    useCases: ["Customer service"],
  },
  {
    id: "thalia",
    name: "Thalia",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Clear", "Confident", "Energetic", "Enthusiastic"],
    useCases: ["Casual chat", "customer service", "IVR"],
  },
  {
    id: "theia",
    name: "Theia",
    gender: "female",
    age: "Adult",
    language: "en-au",
    accent: "Australian",
    characteristics: ["Expressive", "Polite", "Sincere"],
    useCases: ["Informative"],
  },
  {
    id: "vesta",
    name: "Vesta",
    gender: "female",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Natural", "Expressive", "Patient", "Empathetic"],
    useCases: ["Customer service", "interview", "storytelling"],
  },
  {
    id: "zeus",
    name: "Zeus",
    gender: "male",
    age: "Adult",
    language: "en-us",
    accent: "American",
    characteristics: ["Deep", "Trustworthy", "Smooth"],
    useCases: ["IVR"],
  },
] as const;

export const narrationRouter = new Hono<{ Bindings: Env }>();

/** POST /api/articles/:id/narrate — generate or return cached TTS audio. */
narrationRouter.post("/:id/narrate", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const body = await c.req.json<{ voice?: string; force?: boolean }>().catch(() => ({}));
  const force = (body as { force?: boolean }).force ?? false;

  // Read configured voice from preferences, with request body override.
  let voice = (body as { voice?: string }).voice ?? null;
  if (!voice) {
    try {
      const db = getDb(c.env);
      const voicePref = await db
        .select()
        .from(preferences)
        .where(eq(preferences.key, "narration_voice"))
        .get();
      if (voicePref?.value) {
        const parsed = JSON.parse(voicePref.value);
        if (typeof parsed === "string" && parsed.trim()) voice = parsed.trim();
      }
    } catch {
      // Fallback silently.
    }
    if (!voice) voice = "asteria";
  }

  const db = getDb(c.env);
  const [article] = await db
    .select({ id: articles.id, rawContent: articles.rawContent, cleanContent: articles.cleanContent, audioKey: articles.audioKey })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  if (!article) return c.json({ error: "Article not found" }, 404);

  // Return cached audio if available (unless forced).
  if (article.audioKey && !force) {
    return c.json({ audioUrl: `/api/articles/${id}/audio`, cached: true });
  }

  const contentForNarration = article.cleanContent || article.rawContent;
  if (!contentForNarration || contentForNarration.trim().length < 100) {
    return c.json({ error: "Article content too short for narration" }, 400);
  }

  try {
    const audioBytes = await narrateFullArticle(c.env, contentForNarration, voice);
    const audioKey = `audio/article-${id}.wav`;

    await c.env.SPAWNED_PWAS.put(audioKey, audioBytes, {
      httpMetadata: {
        contentType: "audio/wav",
        cacheControl: "public, max-age=86400",
      },
    });

    await db.update(articles).set({ audioKey }).where(eq(articles.id, id));

    return c.json({ audioUrl: `/api/articles/${id}/audio`, cached: false });
  } catch (err) {
    console.error(`Narration failed for article ${id}:`, err);
    return c.json({ error: err instanceof Error ? err.message : "Narration failed" }, 500);
  }
});

/** GET /api/articles/:id/audio — stream narration audio from R2. */
narrationRouter.get("/:id/audio", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  if (!Number.isFinite(id)) return c.json({ error: "Invalid id" }, 400);

  const db = getDb(c.env);
  const [article] = await db
    .select({ audioKey: articles.audioKey })
    .from(articles)
    .where(eq(articles.id, id))
    .limit(1);

  if (!article?.audioKey) return c.json({ error: "Audio not found" }, 404);

  const obj = await c.env.SPAWNED_PWAS.get(article.audioKey);
  if (!obj) return c.json({ error: "Audio file not found in R2" }, 404);

  return new Response(obj.body, {
    headers: {
      "Content-Type": obj.httpMetadata?.contentType ?? "audio/wav",
      "Cache-Control": "public, max-age=86400",
    },
  });
});

/** GET /api/articles/voices — list all available TTS voices (no auth required). */
narrationRouter.get("/voices", async (c) => {
  return c.json({ voices: [...VOICES] });
});
