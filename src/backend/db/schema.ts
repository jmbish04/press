/**
 * @fileoverview Drizzle schema entry point.
 *
 * Table definitions are split one-file-per-table under `./schemas/`. This file
 * re-exports them so existing `import ... from "../db/schema"` paths keep working.
 */

export * from "./schemas";
