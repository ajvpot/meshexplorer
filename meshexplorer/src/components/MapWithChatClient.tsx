"use client";
import dynamic from "next/dynamic";

const MapView = dynamic(
  () => import("./MapView"),
  { ssr: false }
);
const ChatBox = dynamic(() => import("./ChatBox"), { ssr: false });

export default function MapWithChat() {
  return (
    <div
      className="flex flex-col w-screen overflow-hidden"
      style={{ height: 'calc(100dvh - var(--header-height))' }}
    >
      <div className="flex-1 relative">
        <MapView />
        {/* ChatBox temporarily disabled - infinite scroll is broken in reverse view
        <div className="absolute bottom-6 right-6 z-30">
          <div className="w-80">
            <ChatBox showAllMessagesTab={false} startExpanded={false} className="w-full" />
          </div>
        </div>
        */}
      </div>
    </div>
  );
} 