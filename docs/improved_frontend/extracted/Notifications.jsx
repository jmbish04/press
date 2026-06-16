/* global React, Icon, Button, window, NOTIFICATIONS, useClickOutside */
const { useState: useStateNC, useRef: useRefNC, useMemo: useMemoNC } = React;

const NOTI_STYLE = {
  success: { icon: "check",   color: "var(--ok)",   bg: "oklch(0.72 0.16 150 / 16%)" },
  error:   { icon: "alert",   color: "var(--err)",  bg: "oklch(0.66 0.2 22 / 16%)" },
  batch:   { icon: "inbox",   color: "var(--info)", bg: "oklch(0.62 0.19 260 / 18%)" },
  review:  { icon: "tag",     color: "var(--warn)", bg: "oklch(0.8 0.14 85 / 16%)" },
  digest:  { icon: "activity",color: "var(--brand)",bg: "var(--brand-soft)" },
  retry:   { icon: "refresh", color: "var(--info)", bg: "oklch(0.62 0.19 260 / 18%)" },
};

function NotificationCenter({ items, setItems, onClose, go }) {
  const [tab, setTab] = useStateNC("all"); // all | unread | errors
  const ref = useRefNC(null);
  useClickOutside(ref, onClose);

  const shown = useMemoNC(() => items.filter(n =>
    tab === "all" ? true : tab === "unread" ? !n.read : n.type === "error"
  ), [items, tab]);

  const today = shown.filter(n => n.when === "today");
  const earlier = shown.filter(n => n.when === "earlier");
  const unreadCount = items.filter(n => !n.read).length;
  const okCount = items.filter(n => n.type === "success").length;
  const errCount = items.filter(n => n.type === "error").length;
  const reviewCount = items.filter(n => n.type === "review").length;

  function markAll() { setItems(items.map(n => ({ ...n, read: true }))); }
  function open(n) {
    setItems(items.map(x => x.id === n.id ? { ...x, read: true } : x));
    if (n.type === "error" || n.type === "batch" || n.type === "retry") { go("processing"); onClose(); }
  }

  function Item({ n }) {
    const s = NOTI_STYLE[n.type];
    return (
      <div className={`noti-item ${n.read ? "" : "unread"}`} onClick={() => open(n)}>
        <div className="noti-ico" style={{ background: s.bg, color: s.color }}>
          <Icon name={s.icon} size={15} />
        </div>
        <div className="noti-body" style={{ flex: 1, minWidth: 0 }}>
          <div className="nt">{n.title}</div>
          <div className="nb">{n.body}</div>
          <div className="ntime">{n.t}</div>
        </div>
        {!n.read && <span className="noti-unread-dot"></span>}
      </div>
    );
  }

  return (
    <div className="noti-pop" ref={ref}>
      <div className="noti-head">
        <Icon name="bell" size={16} />
        <span className="t">Notifications</span>
        {unreadCount > 0 && <span className="badge badge-secondary" style={{ fontSize: 10.5 }}>{unreadCount} new</span>}
        <div style={{ flex: 1 }}></div>
        <Button variant="ghost" size="sm" onClick={markAll} disabled={unreadCount === 0}><Icon name="check" size={13} />Mark all read</Button>
      </div>

      <div className="noti-summary">
        <div className="noti-sum"><div className="v" style={{ color: "var(--ok)" }}>{okCount}</div><div className="l">processed today</div></div>
        <div className="noti-sum"><div className="v" style={{ color: "var(--err)" }}>{errCount}</div><div className="l">failed</div></div>
        <div className="noti-sum"><div className="v" style={{ color: "var(--warn)" }}>{reviewCount}</div><div className="l">need review</div></div>
      </div>

      <div className="noti-tabs">
        {[["all", "All"], ["unread", "Unread"], ["errors", "Errors"]].map(([id, label]) => (
          <button key={id} className={`chip ${tab === id ? "on" : ""}`} style={{ height: 28, fontSize: 12 }} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div className="noti-feed">
        {shown.length === 0 && (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--muted-foreground)" }}>
            <Icon name="check" size={22} style={{ opacity: .5 }} /><div style={{ marginTop: 8, fontSize: 13 }}>You're all caught up.</div>
          </div>
        )}
        {today.length > 0 && <div className="noti-group">Today</div>}
        {today.map(n => <Item key={n.id} n={n} />)}
        {earlier.length > 0 && <div className="noti-group">Earlier</div>}
        {earlier.map(n => <Item key={n.id} n={n} />)}
      </div>

      <div className="noti-foot">
        <Button variant="outline" size="sm" style={{ width: "100%" }} onClick={() => { go("processing"); onClose(); }}>
          <Icon name="activity" size={14} />View processing pipeline
        </Button>
      </div>
    </div>
  );
}

Object.assign(window, { NotificationCenter });
