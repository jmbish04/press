import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Visitor log — tracks every page view with device, geo, and session data. */
export const visitorLogs = sqliteTable("visitor_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** IP address of the visitor. */
  ipAddress: text("ip_address"),
  /** User-Agent string. */
  userAgent: text("user_agent"),
  /** Parsed device type: mobile, tablet, desktop. */
  deviceType: text("device_type"),
  /** Parsed browser name (e.g. Safari, Chrome). */
  browser: text("browser"),
  /** Parsed OS name (e.g. iOS, Android, macOS). */
  os: text("os"),
  /** ISO 3166-1 country code extracted from CF headers. */
  country: text("country"),
  /** City extracted from CF headers. */
  city: text("city"),
  /** Region/state extracted from CF headers. */
  region: text("region"),
  /** Latitude from CF headers. */
  latitude: text("latitude"),
  /** Longitude from CF headers. */
  longitude: text("longitude"),
  /** The page/route visited (e.g. "/", "/notebook", "/api/articles/42"). */
  path: text("path"),
  /** HTTP referer header. */
  referer: text("referer"),
  /** Timestamp of the visit. */
  visitedAt: integer("visited_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
