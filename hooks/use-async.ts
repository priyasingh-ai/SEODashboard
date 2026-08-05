"use client";

import * as React from "react";

export interface AsyncState<T> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  /** True while re-fetching with stale data still on screen. */
  isRefreshing: boolean;
  refresh: () => void;
}

/**
 * Last-good result per key, shared across every hook instance and every mount.
 *
 * This is what makes back-navigation instant. Without it, unmounting a page
 * throws away its data, so returning to it shows a skeleton and re-fetches from
 * scratch even though the answer for that exact key hasn't changed. Seeding the
 * initial state from here renders the cached view immediately and revalidates
 * in the background — the server's own TTL cache usually makes that revalidation
 * a warm, sub-100ms round trip.
 *
 * Keyed by the same string the effect keys on, so two components asking for the
 * same data (the site report is read by several) share one entry. Values are
 * whatever the fetcher returned; each caller knows its own `T`.
 */
const resultCache = new Map<string, unknown>();

/** Bound it so a long session browsing many filter combinations can't grow it without limit. */
const MAX_CACHE_ENTRIES = 60;

function remember(key: string, value: unknown) {
  // Re-insert to mark as most-recently-used, then evict the oldest.
  resultCache.delete(key);
  resultCache.set(key, value);
  if (resultCache.size > MAX_CACHE_ENTRIES) {
    const oldest = resultCache.keys().next().value;
    if (oldest !== undefined) resultCache.delete(oldest);
  }
}

/**
 * Minimal fetch-with-key hook.
 *
 * Deliberately not TanStack Query: the whole data layer is one interface with
 * three methods, and this keeps the bundle small. It covers what the UI needs —
 * a stable key, stale-while-revalidate on key change, race protection on
 * out-of-order responses, a manual refresh for the toolbar button, and now two
 * more: it seeds from a shared cache so a revisited view paints instantly, and
 * it aborts the in-flight request when the key changes or the component
 * unmounts, so navigating away actually cancels the network call rather than
 * letting it finish and be discarded.
 */
export function useAsync<T>(
  key: string,
  // `isRefresh` is true only when the caller invoked refresh(), so the fetcher
  // can ask the server to bypass its cache. `signal` aborts when this render's
  // key is superseded or the component unmounts — fetchers that hit the network
  // should forward it so the request is genuinely cancelled.
  fetcher: (isRefresh: boolean, signal: AbortSignal) => Promise<T>,
): AsyncState<T> {
  // Seed synchronously from the shared cache so the first paint after a revisit
  // shows real data, not a skeleton. `undefined` when this key is unseen.
  const [data, setData] = React.useState<T | undefined>(
    () => resultCache.get(key) as T | undefined,
  );
  const [error, setError] = React.useState<Error>();
  const [isLoading, setLoading] = React.useState(true);
  const [nonce, setNonce] = React.useState(0);

  // Keep the latest fetcher without making it a dependency — callers pass an
  // inline closure, which would otherwise re-run this effect on every render.
  const fetcherRef = React.useRef(fetcher);
  fetcherRef.current = fetcher;

  const hasData = data !== undefined;

  React.useEffect(() => {
    const controller = new AbortController();

    // On a key change, re-seed from cache so the switch shows that key's last
    // known data immediately instead of blanking to a skeleton mid-navigation.
    const seeded = resultCache.get(key) as T | undefined;
    if (seeded !== undefined) setData(seeded);

    setLoading(true);
    setError(undefined);

    fetcherRef.current(nonce > 0, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return; // a newer key already won
        remember(key, result);
        setData(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        // An abort is not a failure — it's this hook cancelling its own stale
        // request. Swallow it silently so navigation never flashes an error.
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [key, nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  return {
    data,
    error,
    isLoading: isLoading && !hasData,
    isRefreshing: isLoading && hasData,
    refresh,
  };
}
