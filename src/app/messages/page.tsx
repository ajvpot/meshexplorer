"use client";
import { useConfig } from "@/components/ConfigContext";
import ChatBox from "@/components/ChatBox";

// Messages page: displays all chat messages from all channels using the ChatBox component with tabs

export default function MessagesPage() {
  const { config } = useConfig();

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      {/* Header row with title */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">MeshCore Messages</h1>
      </div>
      
      {/* ChatBox component with all messages tab enabled and expanded behavior */}
      <div className="flex justify-center">
        <ChatBox showAllMessagesTab={true} expanded={true} className="w-full max-w-2xl min-h-[600px]" />
      </div>
    </div>
  );
} 