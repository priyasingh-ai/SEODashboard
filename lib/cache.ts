import "server-only";

import { cacheTtlSeconds } from "./env";

/**
 * A small TTL cache in front of the Google APIs.
 *
 * Without it every navigation re-runs the full upstream fan-out — the portfolio
 * alone is ~32 Google calls (4 sites × 8), which measured at ~10s. Google's
 * numbers only move once a day, so re-fetching them on every click buys nothing
 * and burns a per-property daily quota that is easy to exhaust.
 *
 * Two behaviours worth knowing:
 *
 * - **In-flight requests are shared.** The promise goes into the map, not the
 *   result. Four tabs opening the dashboard at once produce one upstream call,
 *   not four — which matters most on the portfolio, where a burst is exactly
 *   when you'd blow the quota.
 * - **Failures are never cached.** A rejected promise is evicted immediately, so
 *   a transient 429 doesn't pin an error in place for the whole TTL.
 *
 * This is per-process memory. On a single server or in dev that's the whole
 * story; on serverless each instance keeps its own copy, which is still correct
 * (just a lower hit rate). A shared Redis would slot in behind this same
 * function signature.
 */

interface Entry {
  value: Promise<unknown>;
  /** Epoch ms after which this entry is stale. */
  expires: number;
}

const store = new Map<string, Entry>();

/** Bound the map so a long-running server can't grow it without limit. */
const MAX_ENTRIES = 500;

function evictExpired(now: number) {
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key);
  }
  // Still oversized after clearing stale entries — drop oldest-inserted first
  // (Map preserves insertion order).
  if (store.size > MAX_ENTRIES) {
    const excess = store.size - MAX_ENTRIES;
    let i = 0;
    for (const key of store.keys()) {
      if (i++ >= excess) break;
      store.delete(key);
    }
  }
}

export interface CacheOptions {
  /** Skip the cached value and re-fetch. Used by the Refresh button. */
  bypass?: boolean;
  /** Override the default TTL, in seconds. */
  ttlSeconds?: number;
}

/**
 * Run `fetcher`, reusing a recent result for the same `key` when there is one.
 */
export function cached<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {},
): Promise<T> {
  const ttl = (options.ttlSeconds ?? cacheTtlSeconds()) * 1000;
  if (ttl <= 0) return fetcher();

  const now = Date.now();

  if (!options.bypass) {
    const hit = store.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
  }

  // Store the promise, not the resolved value — concurrent callers then share
  // one upstream request instead of racing to start their own.
  const value = fetcher().catch((error) => {
    store.delete(key);
    throw error;
  });

  store.set(key, { value, expires: now + ttl });
  evictExpired(now);

  return value;
}

/** Drop everything. Exposed for tests and for a future manual purge. */
export function clearCache(): void {
  store.clear();
}

export function cacheStats(): { entries: number; ttlSeconds: number } {
  return { entries: store.size, ttlSeconds: cacheTtlSeconds() };
}
