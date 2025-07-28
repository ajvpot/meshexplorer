import React from 'react';
import moment from "moment";

type NodePosition = {
  node_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  last_seen?: string;
  type?: string;
  short_name?: string;
  name?: string | null;
};

interface NodeMarkerProps {
  node: NodePosition;
  showNodeNames?: boolean;
}

interface ClusterMarkerProps {
  children: any[];
}

interface PopupContentProps {
  node: NodePosition;
}

// Individual node marker component
export function NodeMarker({ node, showNodeNames = true }: NodeMarkerProps) {
  const getMarkerClass = () => {
    if (node.type === "meshtastic") {
      return "custom-node-marker custom-node-marker--green";
    } else if (node.type === "meshcore") {
      return "custom-node-marker custom-node-marker--blue custom-node-marker--top";
    }
    return "custom-node-marker";
  };

  return (
    <div className="custom-node-marker-container">
      {showNodeNames && node.short_name && (
        <div className="custom-node-label">{node.short_name}</div>
      )}
      <div className={getMarkerClass()}></div>
    </div>
  );
}

// Cluster marker component with pie chart
export function ClusterMarker({ children }: ClusterMarkerProps) {
  let meshtasticCount = 0;
  let meshcoreCount = 0;

  // Convert children to array if it's not already
  const childrenArray = Array.isArray(children) ? children : [children];

  childrenArray.forEach((marker: any) => {
    const node = marker.options && marker.options.nodeData;
    if (node?.type === 'meshtastic') meshtasticCount++;
    else if (node?.type === 'meshcore') meshcoreCount++;
  });

  const total = meshtasticCount + meshcoreCount;
  const percentMeshcore = total ? meshcoreCount / total : 0;
  const percentMeshtastic = total ? meshtasticCount / total : 0;

  // Pie chart SVG calculations
  const r = 18;
  const c = 2 * Math.PI * r;
  const meshcoreArc = percentMeshcore * c;
  const meshtasticArc = percentMeshtastic * c;

  return (
    <div style={{
      position: "relative",
      width: "40px",
      height: "40px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: "transparent"
    }}>
      <svg width="40" height="40" viewBox="0 0 40 40" style={{
        borderRadius: "50%",
        background: "transparent"
      }}>
        <circle
          r="18"
          cx="20"
          cy="20"
          fill="#fff"
          stroke="#fff"
          strokeWidth="4"
          opacity="0.7"
        />
        <circle
          r="18"
          cx="20"
          cy="20"
          fill="transparent"
          stroke="#2563eb"
          strokeWidth="36"
          strokeDasharray={`${meshcoreArc} ${c - meshcoreArc}`}
          strokeDashoffset="0"
          transform="rotate(-90 20 20)"
          opacity="0.7"
        />
        <circle
          r="18"
          cx="20"
          cy="20"
          fill="transparent"
          stroke="#22c55e"
          strokeWidth="36"
          strokeDasharray={`${meshtasticArc} ${c - meshtasticArc}`}
          strokeDashoffset={`-${meshcoreArc}`}
          transform="rotate(-90 20 20)"
          opacity="0.7"
        />
      </svg>
      <span style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        color: "#111",
        fontWeight: "bold",
        fontSize: "15px",
        lineHeight: "1",
        textShadow: "0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff, 0 0 2px #fff",
        background: "none",
        opacity: "1",
        zIndex: "200",
        pointerEvents: "none"
      }}>
        {total}
      </span>
    </div>
  );
}

// Popup content component
export function PopupContent({ node }: PopupContentProps) {
  return (
    <div>
      <div><b>ID:</b> {node.node_id}</div>
      <div><b>Full Name:</b> {node.name ?? "-"}</div>
      <div><b>Short Name:</b> {node.short_name ?? "-"}</div>
      <div><b>Type:</b> {node.type ?? "-"}</div>
      <div><b>Lat:</b> {node.latitude}</div>
      <div><b>Lng:</b> {node.longitude}</div>
      <div><b>Alt:</b> {node.altitude !== undefined ? node.altitude : "-"}</div>
      {node.last_seen ? (
        <div>
          <b>Last seen:</b> {moment.utc(node.last_seen).format('YYYY-MM-DD HH:mm:ss')} <span style={{color: '#888'}}>(UTC)</span><br/>
          <span style={{color: '#888'}}>{moment.utc(node.last_seen).local().fromNow()}</span>
        </div>
      ) : (
        <div><b>Last seen:</b> -</div>
      )}
    </div>
  );
}

 