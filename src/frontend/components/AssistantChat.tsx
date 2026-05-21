import type { UIMessage } from "ai";

import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import { useEffect, useRef, useState } from "react";

/** Concatenates the text parts of a UI message. */
function messageText(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** Names any tools the assistant invoked in a message. */
function toolNames(message: UIMessage): string[] {
  return message.parts
    .filter((part) => part.type.startsWith("tool-"))
    .map((part) => part.type.replace(/^tool-/, ""));
}

/**
 * Full-page chat backed by the NewsAgent Durable Object. Connects over the
 * agents WebSocket protocol — no SSR (mount with `client:only`).
 */
export function AssistantChat() {
  const agent = useAgent({ agent: "NewsAgent", name: "global" });
  const { messages, sendMessage, status } = useAgentChat({ agent });
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex h-full w-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-xs uppercase tracking-wider">
            Ask the agent about your archived articles.
          </p>
        )}
        {messages.map((message) => {
          const tools = toolNames(message);
          return (
            <div key={message.id} className="space-y-1">
              <p className="text-muted-foreground text-[10px] uppercase tracking-widest">
                {message.role}
              </p>
              <p className="whitespace-pre-wrap text-sm">{messageText(message)}</p>
              {tools.length > 0 && (
                <p className="text-muted-foreground text-[10px]">used: {tools.join(", ")}</p>
              )}
            </div>
          );
        })}
        {status === "submitted" && <p className="text-muted-foreground text-xs">Thinking…</p>}
      </div>

      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="bg-background border-input flex-1 rounded-none border px-3 py-2 font-mono text-xs focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-1"
        />
        <button
          type="submit"
          disabled={busy}
          className="bg-primary text-primary-foreground rounded-none px-4 py-2 text-xs font-medium uppercase tracking-widest disabled:opacity-30"
        >
          Send
        </button>
      </form>
    </div>
  );
}
