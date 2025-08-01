import { createHash } from "crypto";
import aesjs from "aes-js";

// Module-level cache for channel IDs
const channelIdCache: Record<string, string> = {};

// Helper: Convert hex string to Uint8Array
function hexToBytes(hex: string): Uint8Array {
  if (hex.startsWith("0x")) hex = hex.slice(2);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

// Helper: Convert base64 to Uint8Array
function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// Add a helper to decode base64 or hex
export function decodeKeyString(key: string): Uint8Array {
  // Try base64 first
  try {
    const b = base64ToBytes(key);
    if (b.length === 16) return b;
  } catch {}
  // Try hex (with or without 0x)
  let hex = key.trim();
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    try {
      const b = hexToBytes(hex);
      if (b.length === 16) return b;
    } catch {}
  }
  throw new Error('Invalid key format: must be 16 bytes, base64 or hex');
}

/**
 * Returns the channel id for a given base64-encoded key.
 * Decodes the key, hashes it with SHA-256, and returns the first byte as hex.
 * Results are cached for performance.
 * Returns "00" for invalid/empty keys.
 */
export function getChannelIdFromKey(key: string): string {
  if (channelIdCache[key]) return channelIdCache[key];
  
  // Handle empty or invalid keys gracefully
  if (!key || key.trim() === '') {
    channelIdCache[key] = "00";
    return "00";
  }
  
  try {
    const keyBytes = decodeKeyString(key);
    const hash = createHash('sha256').update(Buffer.from(keyBytes)).digest();
    const id = hash[0].toString(16).padStart(2, '0');
    channelIdCache[key] = id;
    return id;
  } catch (error) {
    // Return fallback for invalid keys
    channelIdCache[key] = "00";
    return "00";
  }
}

// Helper: HMAC-SHA256, returns Uint8Array
async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  if (window.crypto?.subtle) {
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const sig = await window.crypto.subtle.sign("HMAC", cryptoKey, data);
    return new Uint8Array(sig);
  } else {
    // Fallback: use a JS polyfill if needed (not implemented here)
    throw new Error("No WebCrypto support for HMAC-SHA256");
  }
}

// Parse decrypted MeshCore group message
export function parseMeshcoreGroupMessage(decrypted: Uint8Array | string): {
  timestamp: number;
  msgType: number;
  sender: string;
  text: string;
  rawText: string;
} | null {
  let buf: Uint8Array;
  if (typeof decrypted === "string") {
    buf = new TextEncoder().encode(decrypted);
  } else {
    buf = decrypted;
  }
  if (buf.length < 6) return null;
  // 1. Timestamp (4 bytes, little-endian)
  const timestamp = buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24);
  // 2. MsgType (1 byte)
  const msgType = buf[4];
  // 3. Message text (null-terminated)
  let end = 5;
  while (end < buf.length && buf[end] !== 0) end++;
  const rawText = new TextDecoder().decode(buf.slice(5, end));
  // Try to split sender and text
  let sender = "";
  let text = rawText;
  const sepIdx = rawText.indexOf(": ");
  if (sepIdx !== -1) {
    sender = rawText.slice(0, sepIdx);
    text = rawText.slice(sepIdx + 2);
  }
  return { timestamp, msgType, sender, text, rawText };
}

// Main decryption function
export async function decryptMeshcoreGroupMessage({
  encrypted_message, // hex string or Uint8Array
  mac, // hex string or Uint8Array (2 bytes)
  channel_hash, // hex string (1 byte)
  knownKeys, // array of base64 strings
  parse = false,
}: {
  encrypted_message: string | Uint8Array,
  mac: string | Uint8Array,
  channel_hash: string,
  knownKeys: string[],
  parse?: boolean,
}): Promise<string | ReturnType<typeof parseMeshcoreGroupMessage> | null> {
  // Normalize inputs
  const ciphertext = typeof encrypted_message === "string" ? hexToBytes(encrypted_message) : encrypted_message;
  const macBytes = typeof mac === "string" ? hexToBytes(mac) : mac;
  const chash = channel_hash.toLowerCase();

  const failures: { key: string, reason: string }[] = [];

  for (const base64Key of knownKeys) {
    let keyBytes: Uint8Array;
    try {
      keyBytes = decodeKeyString(base64Key);
    } catch (e) {
      console.warn("Skipping invalid base64 meshcore key:", base64Key, e);
      failures.push({ key: base64Key, reason: `base64 decode error: ${e}` });
      continue;
    }
    const candidateHash = getChannelIdFromKey(base64Key);
    if (candidateHash !== chash) {
      failures.push({ key: base64Key, reason: `channel hash mismatch (expected ${chash}, got ${candidateHash})` });
      continue;
    }

    // MAC check
    let hmac;
    try {
      hmac = await hmacSha256(keyBytes, ciphertext);
    } catch (e) {
      failures.push({ key: base64Key, reason: `HMAC error: ${e}` });
      continue;
    }
    if (macBytes.length !== 2 || hmac[0] !== macBytes[0] || hmac[1] !== macBytes[1]) {
      failures.push({ key: base64Key, reason: `MAC mismatch (expected ${Array.from(macBytes).map(b=>b.toString(16).padStart(2,'0')).join('')}, got ${Array.from(hmac.slice(0,2)).map(b=>b.toString(16).padStart(2,'0')).join('')})` });
      continue;
    }

    // AES-128-ECB decrypt
    try {
      const aesEcb = new aesjs.ModeOfOperation.ecb(keyBytes);
      const decrypted = aesEcb.decrypt(ciphertext);
      // Remove trailing nulls/zeros
      let end = decrypted.length;
      while (end > 0 && decrypted[end - 1] === 0) end--;
      const plainBytes = decrypted.slice(0, end);
      if (parse) {
        return parseMeshcoreGroupMessage(plainBytes);
      } else {
        return new TextDecoder().decode(plainBytes);
      }
    } catch (e) {
      failures.push({ key: base64Key, reason: `AES decryption error: ${e}` });
      continue;
    }
  }
  if (failures.length > 0) {
    console.info("Meshcore decryption failed for message", {
      channel_hash: chash,
      mac: Array.from(macBytes).map(b=>b.toString(16).padStart(2,'0')).join(''),
      knownKeysTried: knownKeys,
      failures,
    });
  }
  return null;
} 

export function formatPublicKey(pubKey: string): string {
    // Take the first 8 characters, add ellipsis, and then the last 8 characters
    const formattedKey = `<${pubKey.slice(0, 8)}...${pubKey.slice(-8)}>`;
    return formattedKey;
} 