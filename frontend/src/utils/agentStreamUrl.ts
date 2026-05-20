/**
 * Absolute URL for agent progress SSE when VITE_API_URL points at the backend host.
 * EventSource does not use axios baseURL; use this for cross-origin dev (e.g. Vite :3000 → API :5000).
 */
export function getAgentProgressStreamUrl(sessionId: string): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  const base = raw?.replace(/\/$/, '') ?? '';
  if (base) {
    return `${base}/api/agents/sessions/${encodeURIComponent(sessionId)}/stream`;
  }
  return `/api/agents/sessions/${encodeURIComponent(sessionId)}/stream`;
}
