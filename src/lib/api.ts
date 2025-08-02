/**
 * Get the base API URL for the application.
 * If NEXT_PUBLIC_API_URL is set, it will be used as the base URL.
 * Otherwise, relative URLs will be used (default behavior).
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL || '';
}

/**
 * Get the application name.
 * If NEXT_PUBLIC_APP_NAME is set, it will be used as the application name.
 * Otherwise, "MeshExplorer" will be used as the default.
 */
export function getAppName(): string {
  return process.env.NEXT_PUBLIC_APP_NAME || 'MeshExplorer';
}

/**
 * Build a full API URL by combining the base URL with the endpoint path.
 * @param endpoint - The API endpoint path (e.g., '/api/stats/total-nodes')
 * @returns The full URL to use for API calls
 */
export function buildApiUrl(endpoint: string): string {
  const baseUrl = getApiBaseUrl();
  if (!baseUrl) {
    return endpoint;
  }
  
  // Ensure the base URL doesn't end with a slash and the endpoint starts with one
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  return `${cleanBaseUrl}${cleanEndpoint}`;
} 