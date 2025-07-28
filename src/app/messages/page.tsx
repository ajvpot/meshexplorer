"use client";
import { useConfig } from "@/components/ConfigContext";
import ChatBox from "@/components/ChatBox";

// Messages page: displays all chat messages from all channels using the ChatBox component with tabs

export default function MessagesPage() {
  const { config } = useConfig();

  return (
    <div className="w-full h-full flex flex-col">
      {/* ChatBox component with all messages tab enabled and expanded behavior */}
      <div className="flex-1 flex justify-center items-start p-4">
        <div className="w-full max-w-6xl h-full">
          <ChatBox showAllMessagesTab={true} startExpanded={true} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
} 