"use client";
import { useConfig } from "@/components/ConfigContext";
import ChatBox from "@/components/ChatBox";

// Messages page: displays all chat messages from all channels using the ChatBox component with tabs

export default function MessagesPage() {
  const { config } = useConfig();

  return (
    <div className="max-w-none mx-auto py-8 px-4">
      {/* ChatBox component with all messages tab enabled and expanded behavior */}
      <div className="flex justify-center">
        <ChatBox showAllMessagesTab={true} startExpanded={true} className="w-[100vw] md:w-[80vw] min-h-[600px]" />
      </div>
    </div>
  );
} 