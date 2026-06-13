/**
 * @fileoverview Processing page — real-time pipeline monitoring via WebSocket.
 *
 * Connects to the ProcessingMonitor Durable Object via the Agents SDK
 * `useAgent` hook. The monitor broadcasts individual job updates via
 * `broadcast()` — only the delta is sent over the wire, not the full state.
 *
 * Message types:
 *   - `snapshot`  — full job list sent on connect
 *   - `update`    — single job delta sent on each workflow stage change
 *
 * Falls back to REST polling if the WebSocket connection drops.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAgent } from "agents/react";
import { Icon } from "../PressIcon";

interface ProcessingJobUpdate {
  id: string;
  url: string;
  stage: number;
  state: string;
  title?: string | null;
  error?: string | null;
  articleId?: number | null;
  source?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

const STAGES = ["Fetch", "Render", "Extract", "Embed", "Index", "Tags", "Mindmap", "Audio"];

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return new Date(iso).toLocaleTimeString();
}

export default function Processing() {
  const [jobs, setJobs] = useState<Record<string, ProcessingJobUpdate>>({});
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<string>("");

  // Connect to the ProcessingMonitor DO via Agents SDK WebSocket.
  useAgent({
    agent: "processing-monitor",
    name: "global",
    onMessage: (message: MessageEvent) => {
      try {
        const data = JSON.parse(String(message.data));

        if (data.type === "snapshot" && Array.isArray(data.jobs)) {
          // Full snapshot on initial connect — replace all jobs.
          const map: Record<string, ProcessingJobUpdate> = {};
          for (const j of data.jobs) map[j.id] = j;
          setJobs(map);
        } else if (data.type === "update" && data.job) {
          // Incremental delta — patch a single job.
          setJobs((prev) => ({
            ...prev,
            [data.job.id]: { ...prev[data.job.id], ...data.job },
          }));
        }
      } catch {
        // Ignore non-JSON protocol messages (identity, state sync, etc.)
      }
    },
    onOpen: () => setConnected(true),
    onClose: () => setConnected(false),
    onError: () => setConnected(false),
  });

  // Fallback: also poll REST if WebSocket disconnects.
  const fetchRest = useCallback(async () => {
    try {
      const r = await fetch("/api/processing/jobs?limit=100");
      const d = (await r.json()) as { jobs: ProcessingJobUpdate[] };
      const map: Record<string, ProcessingJobUpdate> = {};
      for (const j of d.jobs ?? []) map[j.id] = j;
      setJobs(map);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    if (!connected) {
      fetchRest();
      const interval = setInterval(fetchRest, 5000);
      return () => clearInterval(interval);
    }
  }, [connected, fetchRest]);

  // Sorted job list.
  const allJobs: ProcessingJobUpdate[] = useMemo(() => {
    return Object.values(jobs).sort(
      (a, b) => (b.updatedAt ?? b.createdAt ?? "").localeCompare(a.updatedAt ?? a.createdAt ?? ""),
    );
  }, [jobs]);

  // Filter
  const filteredJobs = useMemo(() => {
    if (!filter) return allJobs;
    return allJobs.filter((j) => j.state === filter);
  }, [allJobs, filter]);

  // Stats
  const stats = useMemo(() => {
    const s = { active: 0, done: 0, err: 0, discarded: 0, total: allJobs.length };
    for (const j of allJobs) {
      if (j.state === "active") s.active++;
      else if (j.state === "done") s.done++;
      else if (j.state === "err") s.err++;
      else if (j.state === "discarded") s.discarded++;
    }
    return s;
  }, [allJobs]);

  const handleRetry = async (id: string) => {
    await fetch(`/api/processing/jobs/${id}/retry`, { method: "POST" });
    if (!connected) fetchRest();
  };

  const handleDiscard = async (id: string) => {
    await fetch(`/api/processing/jobs/${id}/discard`, { method: "POST" });
    if (!connected) fetchRest();
  };

  return (
    <div className="page">
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
        <h2
          style={{
            fontSize: 24,
            fontWeight: 700,
            fontFamily: "var(--font-editorial)",
            letterSpacing: "-.01em",
          }}
        >
          Processing
        </h2>
        <span
          className="live-dot"
          style={{
            background: connected ? "var(--ok)" : "var(--warn)",
            boxShadow: connected ? "0 0 8px var(--ok)" : "0 0 8px var(--warn)",
          }}
        />
        <span style={{ fontSize: 12, color: connected ? "var(--ok)" : "var(--muted-foreground)" }}>
          {connected ? "Live" : "Polling"}
        </span>
      </div>

      <div className="proc-stats">
        {[
          { label: "Active", value: stats.active, color: "var(--brand)" },
          { label: "Completed", value: stats.done, color: "var(--ok)" },
          { label: "Errors", value: stats.err, color: "var(--err)" },
          { label: "Total", value: stats.total, color: "var(--foreground)" },
        ].map((s) => (
          <div key={s.label} className="proc-stat card">
            <div className="label">
              <span className="dot" style={{ background: s.color }} />
              {s.label}
            </div>
            <div className="val" style={{ color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      <div className="filterbar">
        {["", "active", "done", "err", "discarded"].map((f) => (
          <button
            key={f}
            className={`chip ${filter === f ? "on" : ""}`}
            onClick={() => setFilter(f)}
          >
            {f || "All"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {!connected && (
          <button className="btn" data-variant="outline" data-size="sm" onClick={fetchRest}>
            <Icon name="refresh" size={13} /> Refresh
          </button>
        )}
      </div>

      {filteredJobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--muted-foreground)" }}>
          <Icon name="activity" size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontSize: 14 }}>No jobs found.</div>
        </div>
      ) : (
        <div className="card" style={{ overflow: "auto", marginTop: 16 }}>
          <table className="proc-table">
            <thead>
              <tr>
                <th>URL</th>
                <th>Stage</th>
                <th>State</th>
                <th>Title</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr key={job.id} className={job.state === "err" ? "err-row" : ""}>
                  <td>
                    <div className="proc-url">{hostname(job.url)}</div>
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {STAGES.map((_, i) => (
                        <span
                          key={i}
                          className={`stage ${
                            i < (job.stage ?? 0)
                              ? "done"
                              : i === (job.stage ?? 0) && job.state === "active"
                                ? "active"
                                : job.state === "err" && i === (job.stage ?? 0)
                                  ? "err"
                                  : "wait"
                          }`}
                          style={{ fontSize: 10, padding: "2px 5px" }}
                        >
                          {i < (job.stage ?? 0) && <Icon name="check" size={9} />}
                          {i === (job.stage ?? 0) && job.state === "active" && (
                            <span
                              className="dot"
                              style={{
                                background: "currentColor",
                                width: 5,
                                height: 5,
                                animation: "pulse 1s infinite",
                              }}
                            />
                          )}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <span className={`stage ${job.state}`}>
                      {job.state === "active" && (
                        <span
                          className="dot"
                          style={{ background: "currentColor", width: 5, height: 5 }}
                        />
                      )}
                      {job.state}
                    </span>
                  </td>
                  <td
                    style={{
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {job.title ?? "—"}
                  </td>
                  <td
                    style={{
                      fontSize: 11,
                      color: "var(--muted-foreground)",
                      fontFamily: "var(--font-mono, monospace)",
                    }}
                  >
                    {timeAgo(job.updatedAt ?? job.createdAt ?? null)}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      {job.state === "err" && (
                        <button
                          className="icon-btn"
                          title="Retry"
                          onClick={() => handleRetry(job.id)}
                        >
                          <Icon name="refresh" size={13} />
                        </button>
                      )}
                      {job.state !== "discarded" && (
                        <button
                          className="icon-btn danger"
                          title="Discard"
                          onClick={() => handleDiscard(job.id)}
                        >
                          <Icon name="trash" size={13} />
                        </button>
                      )}
                    </div>
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
