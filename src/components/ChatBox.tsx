"use client";
import { useState } from "react";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";

export default function ChatBox() {
  const [value, setValue] = useState("");
  const [minimized, setMinimized] = useState(true);
  return (
    <div
      className={`w-80 bg-white dark:bg-neutral-900 rounded-lg shadow-lg flex flex-col ${
        minimized ? "min-h-[2.5rem] px-4 py-2" : "h-96 px-4 py-4"
      }`}
    >
      <div className="flex items-center justify-between" style={{ minHeight: '2rem' }}>
        <span className="font-semibold text-gray-800 dark:text-gray-100">Chat</span>
        <button
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? "Maximize chat" : "Minimize chat"}
        >
          {minimized ? (
            <PlusIcon className="h-5 w-5" />
          ) : (
            <MinusIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      {!minimized && (
        <div className="flex-1 overflow-y-auto text-sm text-gray-700 dark:text-gray-200">
          <div className="text-gray-400 text-center mt-8">Chat coming soon...</div>
        </div>
      )}
    </div>
  );
} 