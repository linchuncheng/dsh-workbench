export function dockSessionId(session: unknown): string {
  if (typeof session === 'string') return session;
  if (typeof session === 'object' && session !== null) {
    const id = (session as { sessionId?: unknown }).sessionId;
    if (typeof id === 'string') return id;
  }
  return '';
}
