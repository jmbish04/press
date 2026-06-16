/* global React, Icon, Button, window, ARTICLES, PROC_JOBS */
const { useState: useStateS } = React;

const NAV = [
  { id: "ingest",  label: "Add to archive", icon: "inbox" },
  { id: "stand",   label: "Newsstand",      icon: "stand" },
  { id: "notebook",label: "Notebook",       icon: "book" },
  { id: "studio",  label: "Studio",         icon: "studio" },
  { id: "processing", label: "Processing",  icon: "activity" },
];

function Sidebar({ route, go, collapsed, errorCount, savedViews, onAccount }) {
  const views = (savedViews || []).filter(v => !v.deleted);
  return (
    <aside className="rail">
      <div className="rail-brand">
        <div className="rail-mark">P</div>
        <div className="rail-brand-text">
          <div className="rail-brand-name">Press</div>
          <div className="rail-brand-sub">archive</div>
        </div>
      </div>

      <button className="rail-quick" onClick={() => go("ingest")}>
        <Icon name="plus" size={15} /><span>Add links</span>
      </button>

      <nav className="rail-nav">
        {NAV.map(n => (
          <button key={n.id} className={`rail-item ${route === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
            <Icon name={n.icon} size={17} />
            <span>{n.label}</span>
            {n.id === "stand" && <span className="count">{ARTICLES.length}</span>}
            {n.id === "processing" && errorCount > 0 && (
              <span className="count" style={{ background: "oklch(0.66 0.2 22 / 18%)", color: "oklch(0.8 0.16 22)" }}>{errorCount}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="rail-sec">Saved views</div>
      <nav className="rail-nav">
        {views.map(v => (
          <button key={v.id} className="rail-item" onClick={() => go("stand", { view: v })}>
            <span className="dot" style={{ background: `oklch(0.7 0.16 ${v.hue})`, marginLeft: 4, marginRight: 1 }}></span>
            <span>{v.name}</span>
          </button>
        ))}
        <button className="rail-item" style={{ color: "var(--muted-foreground)" }} onClick={() => onAccount("views")}>
          <Icon name="plus" size={15} />
          <span>New view</span>
        </button>
      </nav>

      <div className="rail-foot">
        <button className={`rail-item rail-settings ${route === "settings" ? "active" : ""}`} onClick={() => onAccount()}>
          <Icon name="settings" size={17} />
          <span>Settings &amp; config</span>
        </button>
      </div>
    </aside>
  );
}

function TopBar({ title, icon, onToggle, onMenu, onSearch, onBell, unread, right }) {
  return (
    <header className="topbar">
      <button className="tb-toggle mobileonly" onClick={onMenu} title="Menu"><Icon name="menu" size={18} /></button>
      <button className="tb-toggle deskonly" onClick={onToggle} title="Toggle sidebar"><Icon name="sidebar" size={17} /></button>
      <div className="tb-title">
        {icon && <span className="pageicon"><Icon name={icon} size={17} /></span>}
        {title}
      </div>
      <div className="tb-spacer"></div>
      {right}
      <button className="tb-search" onClick={onSearch}>
        <Icon name="search" size={14} />
        <span className="tb-search-text">Search the archive…</span>
        <span className="kbd">⌘K</span>
      </button>
      <button className="btn bell-btn" data-variant="ghost" data-size="icon-sm" onClick={onBell} title="Notifications">
        <Icon name="bell" size={17} />
        {unread > 0 && <span className="bell-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>
    </header>
  );
}

function MobileTabBar({ route, go }) {
  return (
    <nav className="mobile-tabbar">
      {NAV.map(n => (
        <button key={n.id} className={`mt-item ${route === n.id ? "active" : ""}`} onClick={() => go(n.id)}>
          <Icon name={n.icon} size={20} />
          {n.label.split(" ")[0]}
        </button>
      ))}
    </nav>
  );
}

Object.assign(window, { Sidebar, TopBar, MobileTabBar, NAV });
