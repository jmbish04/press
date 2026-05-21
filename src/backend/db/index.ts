/**
 * @fileoverview D1 / Drizzle client factory.
 */

import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schemas";

export { schema };

/** Returns a Drizzle client bound to the D1 database for the current request. */
export function getDb(env: Env) {
  return drizzle(env.DB, { schema });
}

export type Db = ReturnType<typeof getDb>;
