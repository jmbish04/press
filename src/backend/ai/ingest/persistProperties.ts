/**
 * @fileoverview Batched persistence of AI-extracted article properties.
 *
 * Extracted so both the bulk `/api/ingest` HTTP path and the streaming
 * `IngestAgent` can reuse the same property-key lookup + chunked insert path.
 */

import { inArray } from "drizzle-orm";

import { getDb } from "../../db";
import { articleProperties, propertyKeys } from "../../db/schemas";

/** D1 chunk size — keeps any single statement well within the parameter limit. */
export const D1_INSERT_CHUNK = 50;

export interface PendingProperty {
  articleId: number;
  data: Record<string, string>;
}

/** Resolves property keys (creating any missing) and inserts properties in chunks. */
export async function persistProperties(env: Env, pending: PendingProperty[]): Promise<void> {
  const keyNames = [...new Set(pending.flatMap((p) => Object.keys(p.data)))];
  if (keyNames.length === 0) return;

  const db = getDb(env);

  const existing = await db.select().from(propertyKeys).where(inArray(propertyKeys.key, keyNames));
  const keyToId = new Map(existing.map((k) => [k.key, k.id]));
  const missing = keyNames.filter((k) => !keyToId.has(k));

  for (let i = 0; i < missing.length; i += D1_INSERT_CHUNK) {
    const chunk = missing.slice(i, i + D1_INSERT_CHUNK);
    const inserted = await db
      .insert(propertyKeys)
      .values(chunk.map((key) => ({ key })))
      .returning({ id: propertyKeys.id, key: propertyKeys.key });
    for (const row of inserted) keyToId.set(row.key, row.id);
  }

  const rows = pending.flatMap((p) =>
    Object.entries(p.data)
      .map(([key, value]) => {
        const propertyId = keyToId.get(key);
        return propertyId ? { articleId: p.articleId, propertyId, value: String(value) } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null),
  );

  for (let i = 0; i < rows.length; i += D1_INSERT_CHUNK) {
    await db.insert(articleProperties).values(rows.slice(i, i + D1_INSERT_CHUNK));
  }
}
