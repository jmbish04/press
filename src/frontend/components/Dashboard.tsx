import React, { useState } from "react";

import { AssistantChat } from "./AssistantChat";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function Dashboard() {
  const [urls, setUrls] = useState("");

  const handleIngest = async () => {
    if (!urls) return;
    await fetch("/api/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urlsString: urls }),
    });
    setUrls("");
    alert("Ingestion started via Browser Run.");
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <div className="p-6 border rounded-none bg-card text-card-foreground shadow-sm">
          <h2 className="text-lg font-semibold uppercase tracking-wider mb-4">
            Ingest Data Stream
          </h2>
          <Textarea
            value={urls}
            onChange={(e) => setUrls(e.target.value)}
            placeholder="Paste raw URL block here..."
            className="flex min-h-[120px] w-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring mb-4 rounded-none font-mono text-xs"
          />
          <Button
            onClick={handleIngest}
            className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/90 h-10 px-4 py-2 w-full uppercase tracking-widest rounded-none"
          >
            Process Tabs
          </Button>
        </div>
      </div>

      <div className="h-[600px] border rounded-none bg-card text-card-foreground shadow-sm overflow-hidden flex flex-col p-6 border-t-4 border-t-primary">
        <h2 className="text-lg font-semibold uppercase tracking-wider mb-4">Agent Interface</h2>
        <AssistantChat />
      </div>
    </div>
  );
}
