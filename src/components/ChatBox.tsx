"use client";
import { useState } from "react";

export default function ChatBox() {
  const [value, setValue] = useState("");
  return (
    <div className="w-80 bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-4 flex flex-col h-96">
      <div className="flex-1 overflow-y-auto mb-2 text-sm text-gray-700 dark:text-gray-200">
        <div className="text-gray-400 text-center mt-8">Chat coming soon...</div>
      </div>
      <form
        className="flex gap-2"
        onSubmit={e => {
          e.preventDefault();
          setValue("");
        }}
      >
        <input
          className="flex-1 border rounded px-2 py-1 bg-neutral-100 dark:bg-neutral-800 text-black dark:text-white"
          placeholder="Type a message..."
          value={value}
          onChange={e => setValue(e.target.value)}
          disabled
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-3 py-1 rounded disabled:opacity-50"
          disabled
        >
          Send
        </button>
      </form>
    </div>
  );
} 