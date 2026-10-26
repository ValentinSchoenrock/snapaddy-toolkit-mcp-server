export const MAX_EVENTS = 100;
export const EVENT_CONCURRENCY = 3;
export const MAX_MATCHES = 50;
export const MAX_REPORTS_PER_EVENT = 50;

export async function mapLimited<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i] as T) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function capMatches<T>(items: T[], max = MAX_MATCHES) {
  return { items: items.slice(0, max), truncated: items.length > max, totalMatches: items.length };
}

export function normalizeStatus(status: unknown): string {
  return String(status ?? "").toLowerCase().trim() || "unknown";
}