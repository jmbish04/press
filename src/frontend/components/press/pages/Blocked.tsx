/**
 * @fileoverview Blocked page — URLs whose scrape was bot-blocked / access-denied.
 *
 * Lists the URLs (newest first) recorded by the ingestion pipeline's Workers AI
 * bot-block detector. These are never archived as articles, so they don't show
 * on the Newsstand.
 */
import React, { useState, useEffect, useCallback } from "react";
import { Icon } from "../PressIcon";

interface BlockedItem {
  id: number;
  url: string;
  reason: string | null;
  createdAt: string | null;
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function Blocked() {
  const [items, setItems] = useState<BlockedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/blocked")
      .then((r) => r.json() as Promise<{ blocked?: BlockedItem[] }>)
      .then((d) => setItems(d.blocked ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            fontFamily: "var(--font-editorial)",
            letterSpacing: "-.01em",
          }}
        >
          Blocked
        </h2>
        <span className="count">{items.length}</span>
        <div style={{ flex: 1 }} />
        <button className="btn" data-variant="outline" data-size="sm" onClick={load}>
          <Icon name="refresh" size={13} /> Refresh
        </button>
      </div>
      <p
        style={{
          color: "var(--muted-foreground)",
          fontSize: 13,
          lineHeight: 1.6,
          marginBottom: 20,
          maxWidth: 660,
        }}
      >
        URLs where the site served a bot-block or access-denied page (Cloudflare challenge,
        CAPTCHA, paywall wall, …) instead of an article. They were <strong>not</strong> archived and
        don't appear on the Newsstand. Newest first.
      </p>

      {loading ? (
        <div style={{ padding: 40, color: "var(--muted-foreground)", fontSize: 14 }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted-foreground)" }}>
          <Icon name="check" size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: 14 }}>No blocked URLs.</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "auto" }}>
          <table className="proc-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Reason</th>
                <th>Date added</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ maxWidth: 440 }}>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener"
                      style={{ color: "var(--foreground)", wordBreak: "break-all", fontSize: 13 }}
                    >
                      {it.url}
                    </a>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                      {hostname(it.url)}
                    </div>
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                    {it.reason || "blocked"}
                  </td>
                  <td
                    style={{
                      fontSize: 12,
                      color: "var(--muted-foreground)",
                      whiteSpace: "nowrap",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {formatDate(it.createdAt)}
                  </td>
                  <td>
                    <a
                      href={it.url}
                      target="_blank"
                      rel="noopener"
                      className="icon-btn"
                      title="Open original"
                    >
                      <Icon name="ext" size={13} />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
