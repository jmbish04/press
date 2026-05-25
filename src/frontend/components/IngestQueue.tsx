import { useAgent } from "agents/react";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";

import type { IngestAgent, IngestItem, IngestState } from "../../backend/ai/agents/ingestAgent";

import { cn } from "../lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./ui/alert-dialog";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Textarea } from "./ui/textarea";

/* ── URL parsing (robust extraction with whitespace/newline handling) ──── */

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]})]+/gi;
const TRAILING_JUNK = /[.,;:!?)\]}'"]+$/;

/**
 * Extracts URLs from free-form text with robust parsing:
 * - Splits on whitespace and newlines to isolate tokens
 * - Applies regex matching for http(s) URLs
 * - Trims trailing punctuation
 * - Normalizes and deduplicates via URL constructor
 */
function extractUrls(text: string): string[] {
  const seen = new Set<string>();

  // First, try regex extraction (primary method)
  for (const raw of text.match(URL_PATTERN) ?? []) {
    const cleaned = raw.replace(TRAILING_JUNK, "").trim();
    if (!cleaned) continue;
    try {
      seen.add(new URL(cleaned).toString());
    } catch {
      // ignore malformed URLs
    }
  }

  // Additionally, split by whitespace/newlines and check each token
  // This handles cases where URLs might be on separate lines without surrounding text
  const tokens = text.split(/[\s\n\r]+/).filter(Boolean);
  for (const token of tokens) {
    const cleaned = token.replace(TRAILING_JUNK, "").trim();
    if (!cleaned || seen.has(cleaned)) continue;
    // Only process if it looks like a URL
    if (/^https?:\/\//i.test(cleaned)) {
      try {
        seen.add(new URL(cleaned).toString());
      } catch {
        // ignore malformed URLs
      }
    }
  }

  return [...seen];
}

interface DomainGroup {
  domain: string;
  urls: string[];
}

function groupByDomain(urls: string[]): DomainGroup[] {
  const groups = new Map<string, string[]>();
  for (const url of urls) {
    let domain: string;
    try {
      domain = new URL(url).hostname;
    } catch {
      domain = url;
    }
    const list = groups.get(domain) ?? [];
    list.push(url);
    groups.set(domain, list);
  }
  return [...groups.entries()]
    .map(([domain, urls]) => ({ domain, urls: [...urls].sort() }))
    .sort((a, b) => a.domain.localeCompare(b.domain));
}

/* ── per-URL status badge (emerald accent for success) ───────────────── */

const STATUS_LABELS: Record<IngestItem["status"], string> = {
  queued: "Queued",
  processing: "Processing",
  archived: "Archived",
  skipped: "Skipped",
  failed: "Failed",
};

function StatusBadge({ status }: { status: IngestItem["status"] }) {
  const variant =
    status === "archived"
      ? "default"
      : status === "failed"
        ? "destructive"
        : status === "processing"
          ? "secondary"
          : "outline";
  const Icon =
    status === "processing"
      ? Loader2
      : status === "archived"
        ? CheckCircle2
        : status === "failed"
          ? AlertCircle
          : null;

  // Emerald accent for archived status
  const accentClass = status === "archived" ? "border-emerald-500 text-emerald-500" : "";

  return (
    <Badge variant={variant} className={cn("gap-1 rounded-none text-[10px] font-mono", accentClass)}>
      {Icon && <Icon className={cn("size-3", status === "processing" && "animate-spin")} />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/* ── progress bar (emerald = success, red = failed, monolith aesthetic) ─── */

function ProgressBar({ items }: { items: IngestItem[] }) {
  const total = items.length;
  if (total === 0) return null;

  const counts = items.reduce(
    (acc, item) => {
      if (item.status === "archived" || item.status === "skipped") acc.done += 1;
      else if (item.status === "failed") acc.failed += 1;
      else if (item.status === "processing") acc.active += 1;
      return acc;
    },
    { done: 0, failed: 0, active: 0 },
  );

  const pct = (n: number) => (n / total) * 100;

  return (
    <div className="space-y-1.5">
      <div className="text-zinc-400 flex justify-between font-mono text-[10px] tracking-tight">
        <span>
          {counts.done + counts.failed} of {total} processed
        </span>
        <span>
          {counts.done} done · {counts.failed} failed
        </span>
      </div>
      <div className="bg-zinc-900 relative h-1.5 w-full overflow-hidden rounded-none">
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500 transition-[width]"
          style={{ width: `${pct(counts.done)}%` }}
        />
        <div
          className="absolute inset-y-0 bg-red-500 transition-[width,left]"
          style={{ left: `${pct(counts.done)}%`, width: `${pct(counts.failed)}%` }}
        />
      </div>
    </div>
  );
}

/* ── domain-group block ───────────────────────────────────────────────── */

function DomainGroupBlock({
  group,
  itemsByUrl,
  onRemoveUrl,
  onRemoveGroup,
  readOnly,
}: {
  group: DomainGroup;
  itemsByUrl?: Map<string, IngestItem>;
  onRemoveUrl?: (url: string) => void;
  onRemoveGroup?: (group: DomainGroup) => void;
  readOnly?: boolean;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border-zinc-900 rounded-none border bg-zinc-950">
      <div className="bg-zinc-900/30 flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="hover:text-zinc-50 flex min-w-0 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="text-zinc-500 size-4 shrink-0" />
          ) : (
            <ChevronRight className="text-zinc-500 size-4 shrink-0" />
          )}
          <span className="text-[11px] truncate font-mono font-medium tracking-tight">{group.domain}</span>
          <Badge variant="outline" className="ml-1 rounded-none border-zinc-800 text-[10px]">
            {group.urls.length}
          </Badge>
        </button>
        {!readOnly && onRemoveGroup && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemoveGroup(group)}
            aria-label={`Delete all ${group.domain} links`}
            className="hover:bg-zinc-800"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <ul className="divide-zinc-900 divide-y">
          {group.urls.map((url) => {
            const item = itemsByUrl?.get(url);
            return (
              <li key={url} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-zinc-400 min-w-0 truncate font-mono text-[11px] tracking-tight">
                  {url}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {item && <StatusBadge status={item.status} />}
                  {item?.error && (
                    <span
                      className="text-destructive max-w-[200px] truncate font-mono text-[10px]"
                      title={item.error}
                    >
                      {item.error}
                    </span>
                  )}
                  {!readOnly && onRemoveUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveUrl(url)}
                      aria-label="Delete link"
                      className="hover:bg-zinc-800"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ── root ─────────────────────────────────────────────────────────────── */

interface PendingDelete {
  count: number;
  description: string;
  onConfirm: () => void;
}

export function IngestQueue() {
  const [paste, setPaste] = useState("");
  const [urls, setUrls] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<PendingDelete | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /**
   * iOS Safari can fire `onChange` on a controlled textarea with only a
   * fragment of a long paste, which then re-renders the textarea back to that
   * fragment and drops the rest. Reading `clipboardData` ourselves bypasses
   * the race — we also accept `text/uri-list` for multi-link clipboards
   * (e.g. the iOS share-sheet "Copy" of several Safari tabs).
   *
   * Enhanced with Async Clipboard API support to handle iOS multi-item clipboard
   * arrays natively via navigator.clipboard.read().
   */
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();

    const target = e.currentTarget;
    const start = target.selectionStart ?? paste.length;
    const end = target.selectionEnd ?? paste.length;

    let collectedText = "";

    // Try modern Async Clipboard API first (iOS multi-item support)
    if (navigator.clipboard && navigator.clipboard.read) {
      try {
        const clipboardItems = await navigator.clipboard.read();
        const textFragments: string[] = [];

        for (const item of clipboardItems) {
          // Check for text/plain in each ClipboardItem
          if (item.types.includes("text/plain")) {
            const blob = await item.getType("text/plain");
            const text = await blob.text();
            if (text.trim()) textFragments.push(text.trim());
          }
          // Also check for text/uri-list (Safari multi-tab copy)
          else if (item.types.includes("text/uri-list")) {
            const blob = await item.getType("text/uri-list");
            const text = await blob.text();
            if (text.trim()) textFragments.push(text.trim());
          }
        }

        if (textFragments.length > 0) {
          // Join multi-item clipboard with newlines
          collectedText = textFragments.join("\n");
        }
      } catch (err) {
        // Fall through to legacy clipboardData API
        console.warn("Async Clipboard API failed, falling back to clipboardData", err);
      }
    }

    // Fallback: legacy clipboardData API
    if (!collectedText) {
      const dt = e.clipboardData;
      collectedText =
        dt.getData("text/plain") || dt.getData("text/uri-list") || dt.getData("text") || "";
    }

    if (!collectedText) return;

    const next = paste.slice(0, start) + collectedText + paste.slice(end);
    setPaste(next);

    // Restore the caret to just after the pasted block on the next frame.
    const caret = start + collectedText.length;
    requestAnimationFrame(() => {
      target.setSelectionRange(caret, caret);
    });
  };

  const agent = useAgent<IngestAgent, IngestState>({
    agent: "IngestAgent",
    name: "main",
  });

  const remoteState = (agent.state ?? null) as IngestState | null;
  const remoteItems = remoteState?.items ?? [];
  const isRunning = remoteState?.busy ?? false;
  const hasRemoteRun = remoteItems.length > 0;

  const itemsByUrl = useMemo(
    () => new Map(remoteItems.map((item) => [item.url, item])),
    [remoteItems],
  );

  /** Switch to "queue" mode by extracting URLs from the pasted text. */
  const parsePaste = () => {
    const extracted = extractUrls(paste);
    setUrls(extracted);
  };

  const askDeleteUrl = (url: string) => {
    setConfirm({
      count: 1,
      description: url,
      onConfirm: () => setUrls((prev) => prev.filter((u) => u !== url)),
    });
  };

  const askDeleteGroup = (group: DomainGroup) => {
    setConfirm({
      count: group.urls.length,
      description: `all ${group.urls.length} link(s) from ${group.domain}`,
      onConfirm: () => {
        const drop = new Set(group.urls);
        setUrls((prev) => prev.filter((u) => !drop.has(u)));
      },
    });
  };

  const askResetPaste = () => {
    setConfirm({
      count: urls.length,
      description: `the ${urls.length} parsed link(s) (you can re-paste afterwards)`,
      onConfirm: () => {
        setUrls([]);
        setPaste("");
      },
    });
  };

  const submitForProcessing = async () => {
    if (urls.length === 0 || submitting || isRunning) return;
    setSubmitting(true);
    try {
      await agent.stub.enqueue(urls);
    } catch (err) {
      console.error("IngestAgent.enqueue failed", err);
    } finally {
      setSubmitting(false);
    }
  };

  const resetRun = async () => {
    try {
      await agent.stub.reset();
    } catch (err) {
      console.error("IngestAgent.reset failed", err);
    }
    setUrls([]);
    setPaste("");
  };

  /* ── render branches ───────────────────────────────────────────────── */

  // While a run is in progress (or just finished) show only the live queue.
  if (hasRemoteRun) {
    const remoteGroups = groupByDomain(remoteItems.map((item) => item.url));
    const finished = !isRunning;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>{finished ? "Ingestion complete" : "Ingestion in progress"}</CardTitle>
            </div>
            {finished && (
              <Button variant="outline" onClick={resetRun}>
                Process more
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <ProgressBar items={remoteItems} />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {remoteGroups.map((group) => (
            <DomainGroupBlock key={group.domain} group={group} itemsByUrl={itemsByUrl} readOnly />
          ))}
        </div>
      </div>
    );
  }

  // Queue review — URLs parsed, waiting for the user to submit.
  if (urls.length > 0) {
    const groups = groupByDomain(urls);

    return (
      <>
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="font-mono text-sm tracking-tight">
                Review queue{" "}
                <span className="text-zinc-400 font-normal">{urls.length} link(s)</span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={askResetPaste} className="rounded-none">
                Start over
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {groups.map((group) => (
                <DomainGroupBlock
                  key={group.domain}
                  group={group}
                  onRemoveUrl={askDeleteUrl}
                  onRemoveGroup={askDeleteGroup}
                />
              ))}
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                onClick={submitForProcessing}
                disabled={submitting}
                className="rounded-none bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
              >
                {submitting ? "Submitting…" : `Confirm & archive ${urls.length} article${urls.length === 1 ? "" : "s"}`}
              </Button>
            </CardFooter>
          </Card>
        </div>

        <DeleteConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
      </>
    );
  }

  // Paste mode — initial textarea.
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Paste article URLs
            <Badge variant="outline" className="rounded-none border-zinc-800 text-[10px] font-mono font-normal">
              Multi-item clipboard supported
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onPaste={handlePaste}
            placeholder={`Paste anything — iOS share-sheet dump, notes export, email, or plain URLs…
Multi-item clipboard arrays are automatically detected and parsed.
URLs are extracted, deduplicated, and grouped by domain on the next step.`}
            className="min-h-[200px] rounded-none border-zinc-800 bg-zinc-950 font-mono text-[11px] tracking-tight placeholder:text-zinc-600"
          />
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => setPaste("")}
            disabled={paste.length === 0}
            className="rounded-none"
          >
            Clear
          </Button>
          <Button
            onClick={parsePaste}
            disabled={paste.trim().length === 0}
            className="rounded-none bg-emerald-500 text-zinc-950 hover:bg-emerald-400"
          >
            Parse & review links
          </Button>
        </CardFooter>
      </Card>

      <DeleteConfirmDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

/* ── delete confirmation dialog ───────────────────────────────────────── */

function DeleteConfirmDialog({
  confirm,
  onClose,
}: {
  confirm: PendingDelete | null;
  onClose: () => void;
}) {
  return (
    <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {confirm?.count ?? 0} article link
            {(confirm?.count ?? 0) === 1 ? "" : "s"}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            You're about to remove {confirm?.description}. This only affects the local queue —
            nothing is processed yet.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              confirm?.onConfirm();
              onClose();
            }}
          >
            Yes, delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
