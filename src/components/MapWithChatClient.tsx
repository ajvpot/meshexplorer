"use client";
import dynamic from "next/dynamic";

type NodePosition = {
  from_node_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  last_seen?: string;
};

interface MapWithChatProps {
  nodePositions?: NodePosition[];
}

const MapView = dynamic<MapWithChatProps>(
  () => import("./MapView"),
  { ssr: false }
);
const ChatBox = dynamic(() => import("./ChatBox"), { ssr: false });

export default function MapWithChat({ nodePositions }: MapWithChatProps) {
  return (
    <div
      className="flex flex-col w-screen overflow-hidden"
      style={{ height: 'calc(100dvh - var(--header-height))' }}
    >
      <div className="flex-1 relative">
        <MapView />
        <div className="absolute bottom-6 right-6 z-30">
          <ChatBox showAllMessagesTab={false} expanded={false} className="w-80 h-96" />
        </div>
      </div>
    </div>
  );
} 