/* global React, Icon, Button, Tag, PageRender, ChatThread, Composer, window, ARTICLES, SOURCES, TAGS, CATEGORIES */
const { useState: useStateNB, useMemo: useMemoNB } = React;

function Notebook({ openArticle }) {
  const [mode, setMode] = useStateNB("all"); // all | tags | articles
  const [selTags, setSelTags] = useStateNB([]);
  const [selArticles, setSelArticles] = useStateNB([]);
  const [filter, setFilter] = useStateNB("");
  const [messages, setMessages] = useStateNB([]);
  const [thinking, setThinking] = useStateNB(false);
  const [srcOpen, setSrcOpen] = useStateNB(false); // mobile drawer

  const allTags = useMemoNB(() => {
    const m = {};
    ARTICLES.forEach(a => a.tags.forEach(([id]) => { m[id] = (m[id] || 0) + 1; }));
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ id, n }));
  }, []);

  // scope → which articles are in play
  const scopedArticles = useMemoNB(() => {
    if (mode === "articles") return ARTICLES.filter(a => selArticles.includes(a.id));
    if (mode === "tags" && selTags.length) return ARTICLES.filter(a => a.tags.some(([id]) => selTags.includes(id)));
    return ARTICLES;
  }, [mode, selTags, selArticles]);

  const scopeLabel = mode === "all" ? `all ${ARTICLES.length} articles`
    : mode === "tags" ? (selTags.length ? `${scopedArticles.length} articles · ${selTags.length} tags` : "pick tags →")
    : (selArticles.length ? `${selArticles.length} selected articles` : "pick articles →");

  function send(text) {
    setMessages(m => [...m, { role: "user", text }]);
    setThinking(true);
    setTimeout(() => {
      setThinking(false);
      const cites = scopedArticles.slice(0, 3).map(a => a.title.length > 32 ? a.title.slice(0, 32) + "…" : a.title);
      setMessages(m => [...m, { role: "ai", text: cannedNotebookReply(text, scopedArticles, mode, selTags), cites }]);
    }, 1300);
  }

  const filteredList = ARTICLES.filter(a =>
    !filter || a.title.toLowerCase().includes(filter.toLowerCase()) || SOURCES[a.src].name.toLowerCase().includes(filter.toLowerCase()));

  const PROMPTS = mode === "tags" && selTags.includes("interviewing")
    ? ["How do I structure a strong answer to 'tell me about yourself'?", "Summarise the negotiation tactics across these pieces", "Build me a checklist for the day before an interview"]
    : mode === "tags" && (selTags.includes("build-a-pc") || selTags.includes("laptops"))
    ? ["Draft a shopping list for a local-inference PC under $2,500", "Compare Apple Silicon vs a discrete GPU for ML", "What are the current trends in consumer tech?"]
    : ["What are the common threads across these sources?", "Give me a reading order for a newcomer", "What do these articles disagree about?"];

  return (
    <div className="nb">
      {/* sources panel */}
      <div className={`nb-sources ${srcOpen ? "open" : ""}`}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ font: "600 14px/1 var(--font-heading)" }}>Chat sources</div>
          <button className="btn mobileonly" data-variant="ghost" data-size="icon-sm" onClick={() => setSrcOpen(false)}><Icon name="x" size={16} /></button>
        </div>
        <div className="seg" style={{ width: "100%" }}>
          {[["all", "All"], ["tags", "By tag"], ["articles", "Pick"]].map(([id, label]) => (
            <button key={id} className={mode === id ? "active" : ""} style={{ flex: 1, justifyContent: "center" }} onClick={() => setMode(id)}>{label}</button>
          ))}
        </div>

        {mode === "all" && (
          <div className="card" style={{ padding: 14, display: "flex", gap: 11, alignItems: "center" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--brand-soft)", color: "var(--brand)", display: "grid", placeItems: "center", flexShrink: 0 }}><Icon name="layers" size={16} /></div>
            <div>
              <div style={{ font: "500 13px/1.2 var(--font-sans)" }}>Whole archive</div>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 3 }}>{ARTICLES.length} articles · all tags</div>
            </div>
          </div>
        )}

        {mode === "tags" && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7, overflowY: "auto" }}>
            {allTags.map(({ id, n }) => (
              <span key={id} onClick={() => setSelTags(t => t.includes(id) ? t.filter(x => x !== id) : [...t, id])}>
                <Tag id={id} selectable selected={selTags.includes(id)}
                  origin={selTags.includes(id) ? "human" : "ai"} />
              </span>
            ))}
          </div>
        )}

        {mode === "articles" && (
          <>
            <div className="search-wrap">
              <Icon name="search" size={14} />
              <input className="input" style={{ height: 34, fontSize: 13 }} placeholder="Filter articles…" value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
              {filteredList.map(a => {
                const on = selArticles.includes(a.id);
                return (
                  <div key={a.id} className="src-item" onClick={() => setSelArticles(s => on ? s.filter(x => x !== a.id) : [...s, a.id])}>
                    <div className={`checkbox ${on ? "on" : ""}`}>{on && <Icon name="check" size={12} />}</div>
                    <div className="src-thumb"><PageRender srcId={a.src} title={a.title} headSize={7} lines={3} hero={false} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div className="src-name">{a.title}</div>
                      <div className="src-meta">{SOURCES[a.src].name}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* chat */}
      <div className="nb-chat">
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 26px", borderBottom: "1px solid var(--border)" }}>
          <button className="btn mobileonly" data-variant="outline" data-size="icon-sm" onClick={() => setSrcOpen(true)}><Icon name="layers" size={16} /></button>
          <span className="ai-orb" style={{ width: 22, height: 22, borderRadius: 999, background: "radial-gradient(circle at 35% 30%, var(--brand), oklch(0.5 0.18 30) 70%)" }}></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "600 14px/1.1 var(--font-sans)" }}>Notebook</div>
            <div className="muted mono" style={{ fontSize: 11, marginTop: 2 }}>chatting against {scopeLabel}</div>
          </div>
          {messages.length > 0 && <Button variant="ghost" size="sm" onClick={() => setMessages([])}><Icon name="refresh" size={13} />New chat</Button>}
        </div>

        {messages.length === 0 ? (
          <div className="nb-feed">
            <div className="nb-feed-inner">
              <div style={{ textAlign: "center", padding: "20px 0 4px" }}>
                <span className="ai-orb" style={{ display: "inline-block", width: 44, height: 44, borderRadius: 999, background: "radial-gradient(circle at 35% 30%, var(--brand), oklch(0.45 0.18 30) 70%)", boxShadow: "0 0 0 8px var(--brand-soft)" }}></span>
                <h2 style={{ font: "700 26px/1.15 var(--font-editorial)", margin: "18px 0 8px" }}>Ask your archive anything</h2>
                <p className="muted" style={{ fontSize: 14, maxWidth: 460, margin: "0 auto" }}>
                  By default I reason across everything you've saved. Narrow the scope with tags or hand-picked articles in the panel.
                </p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 26 }}>
                {PROMPTS.map((p, i) => (
                  <div key={i} className="nb-prompt-card" onClick={() => send(p)}>
                    <Icon name="sparkles" size={15} style={{ color: "var(--brand)" }} />
                    <div style={{ font: "450 13.5px/1.45 var(--font-sans)", marginTop: 10 }}>{p}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="nb-feed">
            <div className="nb-feed-inner">
              <ChatThread messages={messages} thinking={thinking} />
            </div>
          </div>
        )}

        <div className="nb-compose">
          <div className="nb-compose-inner">
            <Composer onSend={send} placeholder={`Message the notebook · ${scopeLabel}`}
              suggestions={messages.length === 0 ? null : null} onSuggest={send} />
          </div>
        </div>
      </div>
    </div>
  );
}

function cannedNotebookReply(q, arts, mode, tags) {
  const ql = q.toLowerCase();
  const n = arts.length;
  const scope = mode === "all" ? "your full archive" : mode === "tags" ? `the ${tags.map(t => TAGS[t]?.label).join(", ")} desk` : "your selected articles";
  if (/checklist|day before|prepare|prep/.test(ql))
    return `Pulling from ${scope}: the night before, (1) re-read the job description and map three of your stories to its top requirements, (2) prepare two specific questions about the team's roadmap, and (3) confirm logistics and lay out everything. The pieces here stress that calm preparation beats last-minute cramming. I drew this from ${n} sources.`;
  if (/shopping list|build|pc|under \$|workstation/.test(ql))
    return `Based on ${scope}, a sensible local-inference build under $2,500: a current-gen 12-core CPU, 64GB RAM, a 16GB+ GPU for the model weights, and a quiet tower cooler — the hardware desk repeatedly flags thermals and memory bandwidth as the real bottlenecks, not raw core count. Want me to turn this into a line-item table?`;
  if (/thread|common|theme|across/.test(ql))
    return `Across these ${n} articles, three threads recur: a shift from one-time capability to ongoing capability, a premium on judgment over raw access, and a quiet warning that defaults matter more than headlines. Two of the sources actively disagree on timing — want me to lay out where?`;
  if (/disagree|tension|contrast/.test(ql))
    return `The sharpest disagreement in ${scope} is about pace: one camp argues the change is already here and under-priced, the other that adoption always lags the demo. Both agree on direction, only on speed do they part ways.`;
  return `Reasoning over ${scope} (${n} articles): ${q.replace(/\?$/, "")} comes up in several of these. The consensus view is nuanced — the sources broadly agree on the direction while differing on specifics and timing. I've cited the most relevant pieces below; ask me to go deeper on any one.`;
}

Object.assign(window, { Notebook });
