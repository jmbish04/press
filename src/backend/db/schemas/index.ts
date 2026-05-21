/**
 * @fileoverview Aggregated Drizzle schema.
 *
 * Each table lives in its own file under a domain folder. This barrel
 * re-exports every table so callers can `import * as schema from "db/schemas"`.
 */

export * from "./auth";
export * from "./dashboard";
export * from "./threads";
export * from "./system";
export * from "./documents";
export * from "./articles";
