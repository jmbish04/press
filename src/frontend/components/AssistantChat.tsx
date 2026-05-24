import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";

import { Thread } from "./assistant-ui/thread";

/**
 * Dashboard chat — connects to the NewsAgent Durable Object via the
 * Cloudflare Agents WebSocket protocol and renders the assistant-ui Thread.
 */
export function AssistantChat() {
  const agent = useAgent({ agent: "NewsAgent", name: "global" });
  const chat = useAgentChat({ agent });
  const runtime = useAISDKRuntime(chat as Parameters<typeof useAISDKRuntime>[0]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex h-full min-h-0 w-full flex-col">
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
