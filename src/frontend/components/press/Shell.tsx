/**
 * @fileoverview Press app shell — Sidebar, TopBar, and PressDock.
 */
import React from "react";
import { Icon } from "./PressIcon";
import { Dock, DockIcon } from "../ui/dock";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Route =
  | "ingest"
  | "stand"
  | "notebook"
  | "studio"
  | "processing"
  | "blocked"
  | "settings"
  | "article";

export interface SavedView {
  id: string;
  name: string;
  hue: number;
  deleted?: boolean;
}

const NAV: { id: Route; label: string; icon: string }[] = [
  { id: "ingest", label: "Add to archive", icon: "inbox" },
  { id: "stand", label: "Newsstand", icon: "stand" },
  { id: "notebook", label: "Notebook", icon: "book" },
  { id: "studio", label: "Studio", icon: "studio" },
  { id: "processing", label: "Processing", icon: "activity" },
  { id: "blocked", label: "Blocked", icon: "x" },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

interface SidebarProps {
  route: Route;
  go: (r: Route, opts?: Record<string, unknown>) => void;
  articleCount: number;
  errorCount: number;
  savedViews: SavedView[];
  onSettings: () => void;
}

export function Sidebar({ route, go, articleCount, errorCount, savedViews, onSettings }: SidebarProps) {
  const views = savedViews.filter((v) => !v.deleted);

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
        <Icon name="plus" size={15} />
        <span>Add links</span>
      </button>

      <nav className="rail-nav">
        {NAV.map((n) => (
          <button
            key={n.id}
            className={`rail-item ${route === n.id ? "active" : ""}`}
            onClick={() => go(n.id)}
          >
            <Icon name={n.icon} size={17} />
            <span>{n.label}</span>
            {n.id === "stand" && <span className="count">{articleCount}</span>}
            {n.id === "processing" && errorCount > 0 && (
              <span
                className="count"
                style={{ background: "oklch(0.66 0.2 22 / 18%)", color: "oklch(0.8 0.16 22)" }}
              >
                {errorCount}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="rail-sec">Saved views</div>
      <nav className="rail-nav">
        {views.map((v) => (
          <button
            key={v.id}
            className="rail-item"
            onClick={() => go("stand", { view: v })}
          >
            <span
              className="dot"
              style={{ background: `oklch(0.7 0.16 ${v.hue})`, marginLeft: 4, marginRight: 1 }}
            />
            <span>{v.name}</span>
          </button>
        ))}
        <button
          className="rail-item"
          style={{ color: "var(--muted-foreground)" }}
          onClick={() => onSettings()}
        >
          <Icon name="plus" size={15} />
          <span>New view</span>
        </button>
      </nav>

      <div className="rail-foot">
        <button
          className={`rail-item rail-settings ${route === "settings" ? "active" : ""}`}
          onClick={onSettings}
        >
          <Icon name="settings" size={17} />
          <span>Settings &amp; config</span>
        </button>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

interface TopBarProps {
  title: string;
  icon?: string;
  onToggle: () => void;
  onMenu: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  unread?: number;
  right?: React.ReactNode;
}

export function TopBar({ title, icon, onToggle, onMenu, onSearch, onBell, unread = 0, right }: TopBarProps) {
  return (
    <header className="topbar">
      <button className="tb-toggle mobileonly" onClick={onMenu} title="Menu">
        <Icon name="menu" size={18} />
      </button>
      <button className="tb-toggle deskonly" onClick={onToggle} title="Toggle sidebar">
        <Icon name="sidebar" size={17} />
      </button>
      <div className="tb-title">
        {icon && (
          <span className="pageicon">
            <Icon name={icon} size={17} />
          </span>
        )}
        {title}
      </div>
      <div className="tb-spacer" />
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

// ---------------------------------------------------------------------------
// PressDock — MacOS-style magnifying dock navigation
// ---------------------------------------------------------------------------

const DOCK_NAV: { id: Route; label: string; icon: string }[] = [
  { id: "ingest", label: "Add", icon: "inbox" },
  { id: "stand", label: "Newsstand", icon: "stand" },
  { id: "notebook", label: "Notebook", icon: "book" },
  { id: "studio", label: "Studio", icon: "studio" },
  { id: "processing", label: "Activity", icon: "activity" },
  { id: "blocked", label: "Blocked", icon: "x" },
  { id: "settings", label: "Settings", icon: "settings" },
];

interface PressDockProps {
  route: Route;
  go: (r: Route) => void;
}

export function PressDock({ route, go }: PressDockProps) {
  return (
    <div className="press-dock-container">
      <Dock
        iconSize={40}
        iconMagnification={58}
        iconDistance={120}
        direction="bottom"
        className="press-dock"
      >
        {DOCK_NAV.map((n) => (
          <DockIcon
            key={n.id}
            className={`press-dock-icon ${route === n.id ? "active" : ""}`}
            onClick={() => go(n.id)}
          >
            <div className="press-dock-icon-inner" data-tooltip={n.label}>
              <Icon name={n.icon} size={22} />
              {route === n.id && <span className="press-dock-dot" />}
            </div>
          </DockIcon>
        ))}
      </Dock>
    </div>
  );
}

// Keep legacy MobileTabBar export for backwards compatibility, but it just renders PressDock.
export function MobileTabBar({ route, go }: PressDockProps) {
  return <PressDock route={route} go={go} />;
}

