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

/* ── URL parsing (mirrors backend extractUrls) ────────────────────────── */

const URL_PATTERN = /https?:\/\/[^\s<>"'`\]})]+/gi;
const TRAILING_JUNK = /[.,;:!?)\]}'"]+$/;

function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.match(URL_PATTERN) ?? []) {
    const cleaned = raw.replace(TRAILING_JUNK, "").trim();
    if (!cleaned) continue;
    try {
      seen.add(new URL(cleaned).toString());
    } catch {
      // ignore malformed URLs
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

/* ── per-URL status badge ────────────────────────────────────────────── */

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
  return (
    <Badge variant={variant} className="gap-1">
      {Icon && <Icon className={cn("size-3", status === "processing" && "animate-spin")} />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/* ── progress bar (green = success, red = failed) ─────────────────────── */

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
      <div className="text-muted-foreground flex justify-between text-xs">
        <span>
          {counts.done + counts.failed} of {total} processed
        </span>
        <span>
          {counts.done} done · {counts.failed} failed
        </span>
      </div>
      <div className="bg-secondary relative h-2 w-full overflow-hidden rounded-full">
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
    <div className="border-border rounded-md border">
      <div className="bg-muted/30 flex items-center justify-between gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="hover:text-foreground flex min-w-0 items-center gap-2 text-left"
        >
          {open ? (
            <ChevronDown className="text-muted-foreground size-4 shrink-0" />
          ) : (
            <ChevronRight className="text-muted-foreground size-4 shrink-0" />
          )}
          <span className="truncate text-sm font-medium">{group.domain}</span>
          <Badge variant="outline" className="ml-1">
            {group.urls.length}
          </Badge>
        </button>
        {!readOnly && onRemoveGroup && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemoveGroup(group)}
            aria-label={`Delete all ${group.domain} links`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
      {open && (
        <ul className="divide-border divide-y">
          {group.urls.map((url) => {
            const item = itemsByUrl?.get(url);
            return (
              <li key={url} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-muted-foreground min-w-0 truncate font-mono text-xs">
                  {url}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {item && <StatusBadge status={item.status} />}
                  {item?.error && (
                    <span
                      className="text-destructive max-w-[200px] truncate text-xs"
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
   */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const dt = e.clipboardData;
    const text = dt.getData("text/plain") || dt.getData("text/uri-list") || dt.getData("text");
    if (!text) return;

    e.preventDefault();
    const target = e.currentTarget;
    const start = target.selectionStart ?? paste.length;
    const end = target.selectionEnd ?? paste.length;
    const next = paste.slice(0, start) + text + paste.slice(end);
    setPaste(next);

    // Restore the caret to just after the pasted block on the next frame.
    const caret = start + text.length;
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
              <CardTitle>
                Review queue{" "}
                <span className="text-muted-foreground font-normal">{urls.length} link(s)</span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={askResetPaste}>
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
              <Button onClick={submitForProcessing} disabled={submitting}>
                {submitting ? "Submitting…" : `Process ${urls.length} link(s)`}
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
          <CardTitle>Paste article URLs</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onPaste={handlePaste}
            placeholder={`Paste anything — a share-sheet dump, a notes export, an email…
URLs are auto-extracted, deduplicated, and grouped by domain on the next step.`}
            className="min-h-[200px] font-mono text-xs"
          />
        </CardContent>
        <CardFooter className="justify-end gap-2">
          <Button variant="ghost" onClick={() => setPaste("")} disabled={paste.length === 0}>
            Clear
          </Button>
          <Button onClick={parsePaste} disabled={paste.trim().length === 0}>
            Parse links
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
