/** Saved timestamps are concurrency tokens and must advance even within one millisecond. */
export function nextSavedTimestamp(previous: string, now = Date.now()): string {
  const saved = Date.parse(previous);
  return new Date(Math.max(now, Number.isFinite(saved) ? saved + 1 : now)).toISOString();
}
