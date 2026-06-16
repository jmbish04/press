/* global React, Icon, window */
const { useState: useStateA, useRef: useRefA, useEffect: useEffectA } = React;

// A reusable chat surface. `scope` = small description chip(s). `seed` = canned reply generator.
function ChatThread({ messages, thinking }) {
  const endRef = useRefA(null);
  useEffectA(() => { if (endRef.current) endRef.current.scrollTop = endRef.current.scrollHeight; }, [messages, thinking]);
  return (
    <div className="asst-body" ref={endRef}>
      {messages.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          {m.role === "ai" && <div className="who" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><Icon name="sparkles" size={13} /></div>}
          {m.role === "user" && <div className="who" style={{ background: "var(--accent)", color: "var(--foreground)" }}>HC</div>}
          <div style={{ minWidth: 0 }}>
            <div className="bubble">{m.text}</div>
            {m.cites && (
              <div style={{ marginTop: 2 }}>
                {m.cites.map((c, j) => <span key={j} className="cite"><Icon name="doc" size={10} />{c}</span>)}
              </div>
            )}
          </div>
        </div>
      ))}
      {thinking && (
        <div className="msg ai">
          <div className="who" style={{ background: "var(--brand-soft)", color: "var(--brand)" }}><Icon name="sparkles" size={13} /></div>
          <div className="bubble"><span className="typing"><span></span><span></span><span></span></span></div>
        </div>
      )}
    </div>
  );
}

function Composer({ onSend, placeholder, suggestions, onSuggest }) {
  const [v, setV] = useStateA("");
  const taRef = useRefA(null);
  function grow() { const t = taRef.current; if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 100) + "px"; } }
  function send() { if (!v.trim()) return; onSend(v.trim()); setV(""); if (taRef.current) taRef.current.style.height = "auto"; }
  return (
    <div className="asst-foot">
      {suggestions && suggestions.length > 0 && (
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
          {suggestions.map((s, i) => (
            <button key={i} className="chip" style={{ height: 28, fontSize: 12 }} onClick={() => onSuggest(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="asst-input">
        <textarea ref={taRef} rows={1} value={v} placeholder={placeholder || "Ask anything…"}
          onChange={e => { setV(e.target.value); grow(); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
        <button className="asst-send" disabled={!v.trim()} onClick={send}><Icon name="send" size={15} /></button>
      </div>
    </div>
  );
}

// Floating assistant scoped to a single article
function ArticleAssistant({ article }) {
  const [open, setOpen] = useStateA(false);
  const [messages, setMessages] = useStateA([
    { role: "ai", text: `I've read “${article.title}.” Ask me to summarise it, pull out the key takeaways, or explain any part.` },
  ]);
  const [thinking, setThinking] = useStateA(false);
  const timeoutRef = useRefA(null);
  useEffectA(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function reply(userText) {
    setMessages(m => [...m, { role: "user", text: userText }]);
    setThinking(true);
    timeoutRef.current = setTimeout(() => {
      setThinking(false);
      setMessages(m => [...m, {
        role: "ai",
        text: cannedArticleReply(userText, article),
        cites: [article.title.length > 36 ? article.title.slice(0, 36) + "…" : article.title],
      }]);
    }, 1100);
  }

  return (
    <>
      {!open && (
        <button className="asst-pill" onClick={() => setOpen(true)}>
          <span className="ai-orb"></span> Ask about this article
        </button>
      )}
      {open && (
        <div className="asst-panel">
          <div className="asst-head">
            <span className="ai-orb"></span>
            <div style={{ flex: 1 }}>
              <div className="title">Press Assistant</div>
              <div className="sub">grounded in this article</div>
            </div>
            <button className="btn" data-variant="ghost" data-size="icon-sm" onClick={() => setOpen(false)}><Icon name="x" size={16} /></button>
          </div>
          <div className="asst-scope">
            <Icon name="doc" size={13} />
            <span style={{ color: "var(--foreground)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {article.title}
            </span>
          </div>
          <ChatThread messages={messages} thinking={thinking} />
          <Composer onSend={reply} placeholder="Ask about this article…"
            suggestions={messages.length <= 1 ? ["Summarise this", "Key takeaways", "What should I remember?"] : null}
            onSuggest={reply} />
        </div>
      )}
    </>
  );
}

/* ---- canned responses ---- */
function cannedArticleReply(q, a) {
  const ql = q.toLowerCase();
  if (/summ|tl;?dr|short/.test(ql))
    return `In short: ${a.excerpt} The piece is from ${window.SOURCES[a.src].name} and runs about ${a.readMins} minutes.`;
  if (/takeaway|key|point|remember/.test(ql))
    return `Three things worth keeping: (1) the core claim in the lede, (2) the supporting argument in the middle section, and (3) the practical implication at the end. Want me to expand any one of these with the exact passages?`;
  return `Good question. Based on this article, the relevant context is that ${a.excerpt.toLowerCase()} I'm answering only from this source — switch to the Notebook if you want me to reason across your whole archive.`;
}

Object.assign(window, { ArticleAssistant, ChatThread, Composer });
