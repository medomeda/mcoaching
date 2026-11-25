/** Limiteur en mémoire (une seule instance de `site/` : suffisant). `allow(clé)` renvoie false au-delà du maximum dans la fenêtre. */
export function createRateLimiter({ max, windowMs }: { max: number; windowMs: number }): (key: string, now?: number) => boolean {
  const hits = new Map<string, number[]>();
  return (key, now = Date.now()) => {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
    return true;
  };
}
