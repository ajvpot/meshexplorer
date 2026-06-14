import { useQuery } from '@connectrpc/connect-query';
import { Code, ConnectError } from '@connectrpc/connect';
import { NodeService } from '@/gen/meshexplorer/v1/node_pb';

interface UseNodeDataParams {
  publicKey: string | null;
  limit?: number;
  enabled?: boolean;
}

// Maps a ConnectError to the string code the node page uses to pick an
// error icon/title/description. (Error-code mapping, not a proto-type mirror.)
export function nodeErrorCode(err: ConnectError | null): string | null {
  if (!err) return null;
  switch (err.code) {
    case Code.NotFound:
      return 'NODE_NOT_FOUND';
    case Code.InvalidArgument:
      return 'INVALID_PUBLIC_KEY';
    case Code.Unavailable:
      return 'DATABASE_ERROR';
    default:
      return 'INTERNAL_ERROR';
  }
}

export function useNodeData({ publicKey, limit = 50, enabled = true }: UseNodeDataParams) {
  return useQuery(
    NodeService.method.getNode,
    { publicKey: publicKey ?? '', limit },
    {
      enabled: enabled && !!publicKey,
      staleTime: 15 * 60 * 1000, // 15 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
      retry: (failureCount, error) => {
        // Don't retry client errors (bad key / not found).
        if (error.code === Code.NotFound || error.code === Code.InvalidArgument) {
          return false;
        }
        return failureCount < 1;
      },
    },
  );
}
