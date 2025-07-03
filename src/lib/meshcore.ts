import { createHash } from "crypto";

// Module-level cache for channel IDs
const channelIdCache: Record<string, string> = {};

/**
 * Returns the channel id for a given base64-encoded key.
 * Decodes the key, hashes it with SHA-256, and returns the first byte as hex.
 * Results are cached for performance.
 */
export function getChannelIdFromKey(base64Key: string): string {
  if (channelIdCache[base64Key]) return channelIdCache[base64Key];
  const keyBytes = Buffer.from(base64Key, 'base64');
  const hash = createHash('sha256').update(keyBytes).digest();
  const id = hash[0].toString(16).padStart(2, '0');
  channelIdCache[base64Key] = id;
  return id;
} 