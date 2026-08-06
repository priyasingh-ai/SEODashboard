"use client";

import * as React from "react";
import { fallbackAnchor, todayUTC } from "@/lib/date-range";

/**
 * The measured end of the reporting window, fetched from the server.
 *
 * The browser cannot derive this. Where Search Console's finalised data ends
 * moves — two days back on one date, three on another — and only Search Console
 * knows, behind credentials that never reach a bundle. See
 * `lib/reporting-anchor.ts` for the measurement and why a constant was wrong.
 *
 * ## Why the client needs it at all
 *
 * The server already resolves presets itself, so the *data* is correct without
 * this. What the client owns is the window it *claims* to be showing — the
 * header label, the date picker's ceiling, and the request cache key. Left on
 * the static fallback, the dashboard would fetch a seven-day window ending 4
 * Aug and print "ending 3 Aug" above it.
 *
 * ## Staying current
 *
 * Re-checked on an interval and whenever the tab regains focus, so a dashboard
 * left open overnight moves to the new day on its own rather than showing
 * yesterday's window until someone reloads. A changed anchor changes every
 * hook's cache key, which is what makes the data follow it.
 */

const ENDPOINT = "/api/reporting-anchor";
const STORAGE_KEY = "seoboard:reporting-anchor";
const REFRESH_MS = 30 * 60 * 1000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Shared across every hook instance, so N components make one request. */
let current: string | undefined;
let inflight: Promise<string> | undefined;
const subscribers = new Set<(anchor: string) => void>();

function isUsable(value: string | null | undefined): value is string {
  // An anchor from the future is nonsense, and one older than a fortnight is
  // a stale cache from a laptop that was closed for a while — neither is a
  // better starting guess than the static fallback.
  if (!value || !ISO_DATE.test(value)) return false;
  const today = todayUTC();
  if (value >= today) return false;
  const floor = new Date(`${today}T00:00:00.000Z`);
  floor.setUTCDate(floor.getUTCDate() - 14);
  return value > floor.toISOString().slice(0, 10);
}

export interface ReportingAnchor {
  /** Always usable, so the header and date picker never render blank. */
  anchor: string;
  /**
   * Whether `anchor` is a known value rather than a blind guess.
   *
   * `false` only on a first visit, before the endpoint has answered. Callers
   * that spend a round trip on the window — every data hook — wait for `true`;
   * callers that merely display it do not.
   */
  resolved: boolean;
}

/**
 * The best anchor available without waiting.
 *
 * Reading the last known value from storage is what keeps a returning visitor
 * from fetching twice, and it counts as resolved: it is the last figure Search
 * Console actually reported, and the background refresh below corrects it if
 * the day has since rolled over.
 */
function initialAnchor(): ReportingAnchor {
  if (current) return { anchor: current, resolved: true };
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isUsable(stored)) {
        current = stored;
        return { anchor: stored, resolved: true };
      }
    } catch {
      // Private mode, or storage disabled. The fallback is still correct.
    }
  }
  return { anchor: fallbackAnchor(), resolved: false };
}

function publish(anchor: string) {
  if (anchor === current) return;
  current = anchor;
  try {
    window.localStorage.setItem(STORAGE_KEY, anchor);
  } catch {
    // Not being able to remember it only costs an extra fetch next time.
  }
  for (const notify of subscribers) notify(anchor);
}

function load(): Promise<string> {
  inflight ??= fetch(ENDPOINT, { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((body: { anchor?: string }) => {
      if (isUsable(body.anchor)) publish(body.anchor);
      return current ?? fallbackAnchor();
    })
    // Never surfaced: the fallback window is a degraded view, not a broken one,
    // and an error banner over the whole dashboard would be the worse outcome.
    .catch(() => current ?? fallbackAnchor())
    .finally(() => {
      inflight = undefined;
    });
  return inflight;
}

export function useReportingAnchor(): ReportingAnchor {
  const [state, setState] = React.useState(initialAnchor);

  React.useEffect(() => {
    const onPublish = (anchor: string) => setState({ anchor, resolved: true });
    subscribers.add(onPublish);

    // Resolved on settle, not on publish. `publish` only fires when the value
    // *changed*, so a first visit whose fetch returned the same date as the
    // fallback — or failed outright and degraded to it — would never flip the
    // flag, and every data hook would wait forever on a window that was already
    // as good as it was going to get.
    void load().then((anchor) => setState({ anchor, resolved: true }));

    const timer = window.setInterval(load, REFRESH_MS);
    // A tab woken after being asleep may be a day behind; check on return
    // rather than waiting out the rest of the interval.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);

    return () => {
      subscribers.delete(onPublish);
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return state;
}
