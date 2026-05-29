import React from 'react';
import moment from "moment";
import { formatPublicKey } from '@/lib/meshcore';
import { getNameIconLabel } from '@/lib/meshcore-map-nodeutils';
import { NodePosition } from '@/types/map';

interface NodeMarkerProps {
  node: NodePosition;
  showNodeNames?: boolean;
  isSelected?: boolean;
  isLoadingNeighbors?: boolean;
}

interface ClusterMarkerProps {
  children: any[];
}

interface PopupContentProps {
  node: NodePosition;
  target?: '_blank' | '_self' | '_parent' | '_top';
}

// Individual node marker component
export function NodeMarker({ node, showNodeNames = true, isSelected = false, isLoadingNeighbors = false }: NodeMarkerProps) {
  const getMarkerClass = () => {
    let baseClass = "custom-node-marker custom-node-marker--blue custom-node-marker--top";

    // Only add loading class when actually loading neighbors
    if (isLoadingNeighbors) {
      baseClass += " custom-node-marker--loading";
    }

    return baseClass;
  };

  return (
    <div className="custom-node-marker-container">
      {showNodeNames && node.short_name && (
        <div className="custom-node-label">
          {getNameIconLabel(node.name || node.short_name)}
        </div>
      )}
      <div className={getMarkerClass()}></div>
    </div>
  );
}

// Cluster marker component
export function ClusterMarker({ children }: ClusterMarkerProps) {
  // Convert children to array if it's not already
  const childrenArray = Array.isArray(children) ? children : [children];
  const total = childrenArray.length;

  return (
    <div style={{
      position: "relative",
      width: "30px",
      height: "30px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: "transparent"
    }}>
      <svg width="30" height="30" viewBox="0 0 30 30" style={{
        borderRadius: "50%",
        background: "transparent"
      }}>
        <circle
          r="13.5"
          cx="15"
          cy="15"
          fill="#2563eb"
          stroke="#fff"
          strokeWidth="3"
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
        fontSize: "11px",
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
export function PopupContent({ node, target = '_self' }: PopupContentProps) {
  return (
    <div>
      <div><b>ID:</b> {formatPublicKey(node.node_id)}</div>
      <div><b>Full Name:</b> {node.name ?? "-"}</div>
      <div><b>Short Name:</b> {node.short_name ? getNameIconLabel(node.name || node.short_name) : "-"}</div>
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
      {node.first_seen ? (
        <div>
          <b>First seen:</b> {moment.utc(node.first_seen).format('YYYY-MM-DD HH:mm:ss')} <span style={{color: '#888'}}>(UTC)</span><br/>
          <span style={{color: '#888'}}>{moment.utc(node.first_seen).local().fromNow()}</span>
        </div>
      ) : (
        <div><b>First seen:</b> -</div>
      )}
      <div style={{marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb'}}>
        <a
          href={`/meshcore/node/${node.node_id}`}
          target={target}
          style={{
            display: 'inline-block',
            padding: '4px 8px',
            backgroundColor: '#3b82f6',
            color: 'white',
            textDecoration: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#2563eb'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#3b82f6'}
        >
          View Node Details →
        </a>
      </div>
    </div>
  );
}
