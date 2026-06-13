/**
 * @fileoverview NotificationsPanel — floating popover anchored to the bell
 * button showing system notifications with mark-read actions.
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icon } from "./PressIcon";

interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  onCountChange: (count: number) => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function typeIcon(type: string): string {
  switch (type) {
    case "success":
      return "check";
    case "error":
      return "x";
    case "warning":
      return "alert";
    default:
      return "bell";
  }
}

function typeColor(type: string): string {
  switch (type) {
    case "success":
      return "oklch(0.72 0.18 155)";
    case "error":
      return "oklch(0.72 0.18 25)";
    case "warning":
      return "oklch(0.78 0.16 80)";
    default:
      return "var(--brand)";
  }
}

export default function NotificationsPanel({ open, onClose, onCountChange }: NotificationsPanelProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = (await res.json()) as { notifications: Notification[]; unreadCount: number };
        setNotifications(data.notifications ?? []);
        onCountChange(data.unreadCount ?? 0);
      }
    } catch {
      // Silent fail.
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close on click outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, onClose]);

  const markRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      onCountChange(notifications.filter((n) => !n.isRead && n.id !== id).length);
    } catch {
      // Silent fail.
    }
  };

  const markAllRead = async () => {
    try {
      await fetch("/api/notifications/read-all", { method: "PUT" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      onCountChange(0);
    } catch {
      // Silent fail.
    }
  };

  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div ref={panelRef} className="notif-panel">
      <div className="notif-header">
        <div className="notif-title">Notifications</div>
        {unreadCount > 0 && (
          <button
            className="btn"
            data-variant="ghost"
            data-size="sm"
            onClick={markAllRead}
            style={{ fontSize: 11 }}
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="notif-list">
        {loading && notifications.length === 0 && (
          <div className="notif-empty">Loading…</div>
        )}
        {!loading && notifications.length === 0 && (
          <div className="notif-empty">
            <Icon name="bell" size={24} style={{ opacity: 0.3, marginBottom: 8 }} />
            <div>No notifications yet</div>
          </div>
        )}
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`notif-item ${n.isRead ? "read" : "unread"}`}
            onClick={() => !n.isRead && markRead(n.id)}
          >
            <div
              className="notif-icon"
              style={{ color: typeColor(n.type) }}
            >
              <Icon name={typeIcon(n.type)} size={14} />
            </div>
            <div className="notif-body">
              <div className="notif-item-title">{n.title}</div>
              <div className="notif-msg">{n.message}</div>
              <div className="notif-time">{timeAgo(n.createdAt)}</div>
            </div>
            {!n.isRead && <div className="notif-dot" />}
          </div>
        ))}
      </div>
    </div>
  );
}
