/** Fixed-window per-key rate limiter (in memory; fine for a single server instance). */
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, { start: number; count: number }>();
  return (key: string, nowMs: number): boolean => {
    const h = hits.get(key);
    if (!h || nowMs - h.start >= windowMs) {
      hits.set(key, { start: nowMs, count: 1 });
      return true;
    }
    if (h.count >= limit) return false;
    h.count++;
    return true;
  };
}
