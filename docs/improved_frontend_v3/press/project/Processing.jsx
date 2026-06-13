/* global React, Icon, Button, window, PROC_JOBS, PROC_STAGES, SOURCES */
const { useState: useStateP, useEffect: useEffectP, useRef: useRefP } = React;

const STAGE_LABEL = { fetch: "Fetch", render: "Render", extract: "Extract", embed: "Embed", index: "Index" };

function StageTrack({ job }) {
  return (
    <div className="stage-track">
      {PROC_STAGES.map((st, i) => {
        let cls = "wait";
        if (job.state === "err" && i === job.stage - 1) cls = "err";
        else if (i < job.stage - (job.state === "done" ? 0 : 1)) cls = "done";
        else if (i === job.stage - 1 && job.state === "active") cls = "active";
        else if (job.state === "done") cls = "done";
        return (
          <React.Fragment key={st}>
            {i > 0 && <span className="stage-sep"></span>}
            <span className={`stage ${cls}`}>
              {cls === "active" && <span className="dot" style={{ background: "currentColor", width: 5, height: 5, borderRadius: 999 }}></span>}
              {cls === "err" && <Icon name="alert" size={11} />}
              {cls === "done" && <Icon name="check" size={11} />}
              {STAGE_LABEL[st]}
            </span>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function Processing() {
  const [filter, setFilter] = useStateP("all"); // all | active | done | err
  const [expanded, setExpanded] = useStateP(null);
  const [tick, setTick] = useStateP(0);
  const [jobs, setJobs] = useStateP(PROC_JOBS);

  // simulate live progress: nudge an active job forward periodically
  useEffectP(() => {
    const iv = setInterval(() => {
      setTick(t => t + 1);
      setJobs(prev => prev.map(j => {
        if (j.state === "active" && Math.random() < 0.4) {
          if (j.stage >= 5) return { ...j, state: "done", t: "just now" };
          return { ...j, stage: j.stage + 1, t: "now" };
        }
        return j;
      }));
    }, 2200);
    return () => clearInterval(iv);
  }, []);

  const counts = {
    all: jobs.length,
    active: jobs.filter(j => j.state === "active").length,
    done: jobs.filter(j => j.state === "done").length,
    err: jobs.filter(j => j.state === "err").length,
  };
  const shown = jobs.filter(j => filter === "all" || j.state === filter);

  const STATS = [
    { label: "In flight", icon: "zap", val: counts.active, sub: "actively processing", color: "var(--brand)" },
    { label: "Archived today", icon: "check", val: 142, sub: "+18 in the last hour", color: "var(--ok)" },
    { label: "Errors", icon: "alert", val: counts.err, sub: "needs attention", color: "var(--err)" },
    { label: "Avg. time", icon: "clock", val: "8.4s", sub: "fetch → index", color: "var(--foreground)" },
  ];

  return (
    <div className="page">
      <div className="stand-head" style={{ marginBottom: 18 }}>
        <div>
          <div className="stand-title" style={{ fontSize: 26 }}>Processing</div>
          <div className="stand-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="live-dot"></span> Live · the ingestion pipeline in real time
          </div>
        </div>
        <Button variant="outline" size="sm"><Icon name="refresh" size={14} />Refresh</Button>
      </div>

      <div className="proc-stats">
        {STATS.map((s, i) => (
          <div key={i} className="card proc-stat">
            <div className="label"><Icon name={s.icon} size={14} style={{ color: s.color }} />{s.label}</div>
            <div className="val" style={{ color: s.color }}>{s.val}</div>
            <div className="sub">{s.sub}</div>
          </div>
        ))}
      </div>

      {/* filter tabs */}
      <div className="filterbar" style={{ marginBottom: 0 }}>
        {[["all", "All"], ["active", "Active"], ["done", "Done"], ["err", "Errors"]].map(([id, label]) => (
          <button key={id} className={`chip ${filter === id ? "on" : ""}`} onClick={() => setFilter(id)}
            style={filter === id && id === "err" ? { background: "var(--err)", borderColor: "var(--err)", color: "#fff" } : null}>
            {id === "err" && <Icon name="alert" size={12} />}
            {label} <span style={{ opacity: .6, fontFamily: "var(--font-mono)", fontSize: 11 }}>{counts[id]}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ marginTop: 16, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table className="proc-table">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Job</th>
                <th>Article</th>
                <th style={{ width: 340 }}>Pipeline</th>
                <th style={{ width: 80 }}>Updated</th>
                <th style={{ width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(j => (
                <React.Fragment key={j.id}>
                  <tr className={j.state === "err" ? "err-row" : ""} style={{ cursor: j.state === "err" ? "pointer" : "default" }}
                      onClick={() => j.state === "err" && setExpanded(expanded === j.id ? null : j.id)}>
                    <td className="mono muted" style={{ fontSize: 12 }}>{j.id}</td>
                    <td>
                      <div style={{ font: "500 13px/1.3 var(--font-sans)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 2, background: SOURCES[j.src].accent, flexShrink: 0, boxShadow: "0 0 0 1px var(--border)" }}></span>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 300, color: j.state === "err" ? "var(--err)" : "var(--foreground)" }}>{j.title}</span>
                      </div>
                      <div className="proc-url">{j.url}</div>
                    </td>
                    <td><StageTrack job={j} /></td>
                    <td className="muted mono" style={{ fontSize: 11.5 }}>{j.t}</td>
                    <td>
                      {j.state === "err"
                        ? <Icon name="chevron" size={15} style={{ transform: expanded === j.id ? "rotate(180deg)" : "none", color: "var(--muted-foreground)" }} />
                        : j.state === "active" ? <Icon name="refresh" size={14} style={{ animation: "spin 1.4s linear infinite", color: "var(--brand)" }} />
                        : <Icon name="check" size={14} style={{ color: "var(--ok)" }} />}
                    </td>
                  </tr>
                  {expanded === j.id && j.error && (
                    <tr>
                      <td colSpan={5} style={{ padding: "0 14px 14px" }}>
                        <div className="err-detail">
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontWeight: 600 }}>
                            <Icon name="alert" size={13} /> {j.error.split(" — ")[0]}
                          </div>
                          {j.error.split(" — ")[1]}
                          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                            <Button variant="outline" size="sm" onClick={e => e.stopPropagation()}><Icon name="refresh" size={13} />Retry job</Button>
                            <Button variant="ghost" size="sm" onClick={e => e.stopPropagation()}><Icon name="ext" size={13} />Open URL</Button>
                            <Button variant="ghost" size="sm" onClick={e => e.stopPropagation()}><Icon name="trash" size={13} />Discard</Button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {shown.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-foreground)" }}>
                  <Icon name="check" size={22} style={{ opacity: .5 }} /><div style={{ marginTop: 8 }}>Nothing here — queue is clear.</div>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Processing });
