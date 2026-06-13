/**
 * @fileoverview Ingest page — paste URLs, detect them, and submit to the
 * ingestion pipeline.
 */
import React, { useState, useMemo, useCallback } from "react";
import { Icon } from "../PressIcon";
import type { Article } from "../PressApp";

interface IngestProps {
  onIngested: (articles: Article[]) => void;
}

/** Extract URLs from a block of text. */
function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  return [...new Set(text.match(re) ?? [])];
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function pathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return "";
  }
}

export default function Ingest({ onIngested }: IngestProps) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<Array<{ url: string; status: string; title?: string }>>([]);

  const urls = useMemo(() => extractUrls(text), [text]);

  const handleSubmit = useCallback(async () => {
    if (urls.length === 0) return;
    setSubmitting(true);
    setResults([]);

    try {
      const res = await fetch("/api/articles/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      });
      const data = await res.json() as {
        results?: Array<{ url: string; status: string; title?: string; articleId?: number }>;
      };

      setResults(data.results ?? []);

      // Build article stubs from results.
      const newArticles: Article[] = (data.results ?? [])
        .filter((r) => r.status === "ok" && r.articleId)
        .map((r) => ({
          id: r.articleId!,
          title: r.title ?? null,
          url: r.url,
          createdAt: new Date().toISOString(),
        }));

      if (newArticles.length > 0) onIngested(newArticles);
      setText("");
    } catch (err) {
      console.error("Ingest failed:", err);
    } finally {
      setSubmitting(false);
    }
  }, [urls, onIngested]);

  return (
    <div className="page page-narrow">
      <div className="ingest-hero">
        <div className="ingest-eyebrow">Browser Rendering Pipeline</div>
        <div className="ingest-h">Add to the archive</div>
        <p style={{ color: "var(--muted-foreground)", fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
          Paste URLs from any source — articles, blogs, docs. Press will fetch, render,
          extract metadata, generate embeddings, and build a mind map for each one.
        </p>

        <div className={`dropzone ${focused ? "focus" : ""}`}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={"Paste URLs here — one per line, or mixed with text.\n\nhttps://example.com/article-1\nhttps://example.com/article-2"}
          />

          {urls.length > 0 && (
            <div className="detect-row" style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--border)", flexWrap: "wrap" }}>
              <Icon name="link" size={13} style={{ color: "var(--brand)" }} />
              <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                {urls.length} URL{urls.length !== 1 ? "s" : ""} detected
              </span>
              <div style={{ flex: 1 }} />
              <button
                className="btn"
                data-variant="brand"
                onClick={handleSubmit}
                disabled={submitting}
              >
                <Icon name="zap" size={14} />
                {submitting ? "Processing…" : `Process ${urls.length} URL${urls.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>

        {urls.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
            {urls.map((url, i) => (
              <div key={i} className="url-pill">
                <Icon name="globe" size={11} />
                <span className="host">{hostname(url)}</span>
                <span className="path">{pathname(url)}</span>
              </div>
            ))}
          </div>
        )}

        {results.length > 0 && (
          <div style={{ marginTop: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Results</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {results.map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-lg)",
                    background: "var(--card)",
                  }}
                >
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      background: r.status === "ok" ? "oklch(0.72 0.16 150 / 18%)" : "oklch(0.66 0.2 22 / 18%)",
                      color: r.status === "ok" ? "var(--ok)" : "var(--err)",
                    }}
                  >
                    <Icon name={r.status === "ok" ? "check" : "x"} size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{r.title ?? hostname(r.url)}</div>
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.url}
                    </div>
                  </div>
                  <span
                    className="stage"
                    style={{
                      background: r.status === "ok" ? "oklch(0.72 0.16 150 / 16%)" : "oklch(0.66 0.2 22 / 16%)",
                      color: r.status === "ok" ? "oklch(0.82 0.14 150)" : "oklch(0.78 0.16 22)",
                    }}
                  >
                    {r.status === "ok" ? "Done" : "Error"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
