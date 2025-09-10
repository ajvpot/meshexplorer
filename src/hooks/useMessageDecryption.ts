import { useQuery } from '@tanstack/react-query';
import { decryptMeshcoreGroupMessage } from '@/lib/meshcore';
import { useMemo } from 'react';

export interface MessageDecryptionParams {
  encrypted_message: string;
  mac: string;
  channel_hash: string;
  knownKeys: string[];
  parse?: boolean;
}

export interface DecryptedMessage {
  timestamp: number;
  msgType: number;
  sender: string;
  text: string;
  rawText: string;
}

export interface MessageDecryptionResult {
  decrypted: DecryptedMessage | null;
  error: string | null;
}

interface UseMessageDecryptionParams extends MessageDecryptionParams {
  enabled?: boolean;
}

export function useMessageDecryption({
  encrypted_message,
  mac,
  channel_hash,
  knownKeys,
  parse = true,
  enabled = true
}: UseMessageDecryptionParams) {
  // Stabilize the known keys to prevent unnecessary re-renders
  const knownKeysString = useMemo(() => knownKeys.join(','), [knownKeys]);

  return useQuery<MessageDecryptionResult, Error>({
    queryKey: ['message-decryption', encrypted_message, mac, channel_hash, knownKeysString, parse],
    queryFn: async (): Promise<MessageDecryptionResult> => {
      try {
        const result = await decryptMeshcoreGroupMessage({
          encrypted_message,
          mac,
          channel_hash,
          knownKeys,
          parse,
        });

        if (result === null) {
          return {
            decrypted: null,
            error: "Could not decrypt message with any known key."
          };
        }

        return {
          decrypted: result as DecryptedMessage,
          error: null
        };
      } catch (err) {
        return {
          decrypted: null,
          error: err instanceof Error ? err.message : "Decryption error occurred."
        };
      }
    },
    enabled: enabled && !!encrypted_message && !!mac && !!channel_hash && knownKeys.length > 0,
    staleTime: Infinity, // Never consider decrypted messages stale
    gcTime: Infinity, // Never garbage collect decrypted messages
    retry: false, // Don't retry decryption failures
    refetchOnWindowFocus: false, // Don't refetch on focus - decryption is deterministic
    refetchOnMount: false, // Don't refetch on mount if we have cached data
    refetchOnReconnect: false, // Don't refetch on network reconnect
  });
}
