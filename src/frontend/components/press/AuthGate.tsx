/**
 * @fileoverview AuthGate — global access-key prompt.
 *
 * Mounted on every page. On mount it checks for the `press_api_key` cookie; if
 * it's missing, it renders a blocking modal asking for the access key. The key
 * is verified against `/api/auth/check` and, on success, stored in a same-origin
 * cookie so the user is never prompted again (and so authenticated API calls —
 * e.g. submitting articles — work automatically, since the cookie is sent with
 * every same-origin request).
 *
 * The input is deliberately a `type="text"` field masked with
 * `-webkit-text-security` rather than `type="password"`, so Chrome's password
 * manager doesn't pop its (annoying) save/autofill dropdown.
 */
import React, { useEffect, useState } from "react";

const COOKIE = "press_api_key";

/** True if the access-key cookie is present. */
function hasKeyCookie(): boolean {
  if (typeof document === "undefined") return true; // SSR: don't flash the modal
  return document.cookie
    .split("; ")
    .some((c) => c.startsWith(`${COOKIE}=`) && c.slice(COOKIE.length + 1).length > 0);
}

export default function AuthGate() {
  const [needKey, setNeedKey] = useState(false);
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!hasKeyCookie()) setNeedKey(true);
  }, []);

  const submit = async () => {
    const k = key.trim();
    if (!k || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/check", { headers: { "X-API-Key": k } });
      if (res.ok) {
        // Persist for a year. SameSite=Lax keeps the key off cross-site POSTs
        // (CSRF-safe) while still sending it on the app's own requests.
        document.cookie = `${COOKIE}=${encodeURIComponent(k)}; path=/; max-age=31536000; samesite=lax; secure`;
        setNeedKey(false);
        setKey("");
      } else {
        setError("That key wasn't accepted. Double-check it and try again.");
      }
    } catch {
      setError("Couldn't reach the server to verify the key.");
    } finally {
      setChecking(false);
    }
  };

  if (!needKey) return null;

  const overlay: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    zIndex: 9999,
    display: "grid",
    placeItems: "center",
    background: "color-mix(in oklab, var(--background, #0f0f14) 70%, transparent)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    padding: 20,
  };

  const card: React.CSSProperties = {
    width: "min(420px, 100%)",
    background: "var(--card, #16161c)",
    border: "1px solid var(--border, #2a2a33)",
    borderRadius: "var(--radius-lg, 14px)",
    boxShadow: "var(--shadow-xl, 0 24px 60px rgba(0,0,0,.5))",
    padding: "26px 24px",
    color: "var(--foreground, #e9e9ee)",
  };

  // type=text + -webkit-text-security masks input WITHOUT triggering Chrome's
  // password manager. Cast because the property isn't in React's CSS typings.
  const input: React.CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    fontSize: 14,
    fontFamily: "var(--font-mono, ui-monospace, monospace)",
    letterSpacing: "0.15em",
    background: "var(--surface, #1d1d24)",
    border: `1px solid ${error ? "var(--err, #e5484d)" : "var(--border, #2a2a33)"}`,
    borderRadius: "var(--radius-md, 8px)",
    color: "var(--foreground, #e9e9ee)",
    outline: "none",
    ...({ WebkitTextSecurity: "disc" } as unknown as React.CSSProperties),
  };

  return (
    <div style={overlay} role="dialog" aria-modal="true" aria-label="Access key required">
      <div style={card}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted-foreground, #9a9aa6)", marginBottom: 8 }}>
          Press · Archive
        </div>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: "0 0 6px" }}>Enter your access key</h2>
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "var(--muted-foreground, #9a9aa6)", margin: "0 0 16px" }}>
          This unlocks adding and processing articles. It's stored in this browser so you won't be asked again.
        </p>

        <input
          type="text"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="access key"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          name="press-access-key"
          data-1p-ignore=""
          data-lpignore="true"
          data-form-type="other"
          style={input}
        />

        {error && (
          <div style={{ fontSize: 12.5, color: "var(--err, #e5484d)", marginTop: 8 }}>{error}</div>
        )}

        <button
          onClick={submit}
          disabled={checking || !key.trim()}
          style={{
            marginTop: 16,
            width: "100%",
            height: 40,
            fontSize: 14,
            fontWeight: 600,
            cursor: checking || !key.trim() ? "not-allowed" : "pointer",
            opacity: checking || !key.trim() ? 0.6 : 1,
            background: "var(--brand, #6366f1)",
            color: "#fff",
            border: "none",
            borderRadius: "var(--radius-md, 8px)",
          }}
        >
          {checking ? "Verifying…" : "Unlock"}
        </button>
      </div>
    </div>
  );
}
