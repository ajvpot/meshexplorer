import { createConnectTransport } from "@connectrpc/connect-web";
import { getApiBaseUrl } from "@/lib/api";

// ConnectRPC services are served under the `/api` prefix (see
// src/pages/api/[[...connect]].ts), alongside the legacy REST routes.
// Honors NEXT_PUBLIC_API_URL the same way buildApiUrl() does.
export const transport = createConnectTransport({
  baseUrl: `${getApiBaseUrl()}/api`,
});
