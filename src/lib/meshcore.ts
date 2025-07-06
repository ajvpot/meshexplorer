import { createHash } from "crypto";

// Module-level cache for channel IDs
const channelIdCache: Record<string, string> = {};

// Add a helper to decode base64 or hex
function decodeKeyString(key: string): Buffer {
  // Try base64 first
  try {
    const b = Buffer.from(key, 'base64');
    if (b.length === 16) return b;
  } catch {}
  // Try hex (with or without 0x)
  let hex = key.trim();
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    try {
      const b = Buffer.from(hex, 'hex');
      if (b.length === 16) return b;
    } catch {}
  }
  throw new Error('Invalid key format: must be 16 bytes, base64 or hex');
}

/**
 * Returns the channel id for a given base64-encoded key.
 * Decodes the key, hashes it with SHA-256, and returns the first byte as hex.
 * Results are cached for performance.
 */
export function getChannelIdFromKey(key: string): string {
  if (channelIdCache[key]) return channelIdCache[key];
  const keyBytes = decodeKeyString(key);
  const hash = createHash('sha256').update(keyBytes).digest();
  const id = hash[0].toString(16).padStart(2, '0');
  channelIdCache[key] = id;
  return id;
} 