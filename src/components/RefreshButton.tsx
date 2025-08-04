import React from "react";

interface RefreshButtonProps {
  onClick: () => void;
  loading: boolean;
  autoRefreshing?: boolean;
  title?: string;
  ariaLabel?: string;
  small?: boolean;
  disabled?: boolean;
}

export default function RefreshButton({
  onClick,
  loading,
  autoRefreshing = false,
  title = "Refresh",
  ariaLabel = "Refresh",
  small = false,
  disabled = false,
}: RefreshButtonProps) {
  const size = small ? 24 : 40;
  const iconSize = small ? 14 : 22;
  return (
    <>
      <button
        onClick={onClick}
        disabled={loading || disabled}
        style={{
          border: "none",
          borderRadius: "50%",
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: "0 2px 8px rgba(0,0,0,0.10)",
          opacity: loading ? 0.7 : 1,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.2s, opacity 0.2s",
          fontSize: iconSize,
          padding: 0,
        }}
        className="text-blue-600 dark:text-white bg-white dark:bg-blue-600"
        aria-label={ariaLabel}
        title={title}
      >
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={(loading || autoRefreshing) ? { animation: 'spin 1s linear infinite' } : {}}
        >
          <polyline points="23 4 23 10 17 10"/>
          <path d="M1 20v-6h6"/>
          <path d="M3.51 9a9 9 0 0 1 14.13-3.36L23 10M1 14l4.36 4.36A9 9 0 0 0 20.49 15"/>
        </svg>
      </button>
      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
} 