"use client";
import MapView from "./MapView";
import ChatBox from "./ChatBox";

type NodePosition = {
  from_node_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  last_seen?: string;
};

interface MapWithChatProps {
  nodePositions: NodePosition[];
}

export default function MapWithChat({ nodePositions }: MapWithChatProps) {
  return (
    <div className="flex flex-col h-[100dvh] w-screen overflow-hidden">
      <div className="flex-1 relative">
        <MapView nodePositions={nodePositions} />
        <div className="absolute bottom-6 right-6 z-30">
          <ChatBox />
        </div>
      </div>
    </div>
  );
} 