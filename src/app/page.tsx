import MapWithChat from "../components/MapWithChat";
import { clickhouse } from "../lib/clickhouse";

// --- Server action ---
export async function getNodePositions() {
  const rows = await clickhouse.query(
    "SELECT from_node_id, latitude, longitude, altitude, last_seen FROM meshtastic_position_latest"
  ).toPromise();
  return rows as Array<{
    from_node_id: string;
    latitude: number;
    longitude: number;
    altitude?: number;
    last_seen?: string;
  }>;
}

export default async function Home() {
  const nodePositions = await getNodePositions();
  return <MapWithChat nodePositions={nodePositions} />;
}
