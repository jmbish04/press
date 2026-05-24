import { useState } from "react";

import { AssistantChat } from "./AssistantChat";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "./ui/card";
import { Textarea } from "./ui/textarea";

/**
 * Home-page dashboard: paste-URLs ingestion + the news-archive assistant chat.
 * Both panels are shadcn Card primitives; the assistant chat is rendered via
 * the assistant-ui Thread component inside the AssistantChat island.
 */
export function Dashboard() {
  const [urls, setUrls] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<null | { kind: "ok" | "err"; text: string }>(null);

  const handleIngest = async () => {
    const text = urls.trim();
    if (!text || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlsString: text }),
      });
      if (res.ok) {
        const data = (await res.json()) as { status?: string };
        setStatus({ kind: "ok", text: data.status ?? "Accepted." });
        setUrls("");
      } else if (res.status === 401) {
        setStatus({
          kind: "err",
          text: "Ingest requires a Bearer token (env.WORKER_API_KEY).",
        });
      } else {
        setStatus({ kind: "err", text: `Failed (${res.status}).` });
      }
    } catch (err) {
      setStatus({
        kind: "err",
        text: err instanceof Error ? err.message : "Request failed.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Ingest URLs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Paste a block of URLs — share-sheet dumps, newlines, mixed punctuation are all fine."
            className="min-h-[140px] font-mono text-xs"
          />
          {status && (
            <p
              className={
                status.kind === "ok" ? "text-muted-foreground text-xs" : "text-destructive text-xs"
              }
            >
              {status.text}
            </p>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleIngest} disabled={busy || urls.trim().length === 0}>
            {busy ? "Processing…" : "Process URLs"}
          </Button>
        </CardFooter>
      </Card>

      <Card className="flex h-[600px] flex-col overflow-hidden">
        <CardHeader>
          <CardTitle>Archive assistant</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col p-0">
          <AssistantChat />
        </CardContent>
      </Card>
    </div>
  );
}
