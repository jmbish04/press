import { Thread } from "@assistant-ui/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import React from "react";

export function AssistantChat() {
  // Integrates the official Cloudflare hook with assistant-ui
  const agentChat = useAgentChat({
    api: "/api/chat",
  });

  return (
    <div className="flex-1 h-full w-full">
      <Thread runtime={agentChat} />
    </div>
  );
}
