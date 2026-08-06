import type { DateRange, MovementWindow, RangeKey } from "@/types";

/**
 * How many days back the reporting window ends when nothing better is known.
 *
 * A guess of last resort. The real answer is measured — see
 * `resolveReportingAnchor` in `lib/reporting-anchor.ts`, which asks Search
 * Console where its finalised data actually ends. This value is what stands in
 * before that answer arrives, and whenever it cannot be obtained at all: mock
 * mode, absent credentials, or an upstream failure.
 *
 * Three days because that is the far edge of Search Console's usual 2–3 day
 * finalisation lag, and erring long is the safer error. A window that ends
 * before the data does simply omits a day; one that ends after it requests days
 * Google will not return, and the daily series charts absent days as zero — so
 * every chart would end in a cliff that is an artefact of the request rather
 * than a drop in traffic.
 *
 * Paired with `dataState: "final"` on the Search Console side; the two are a
 * matched set and changing one without the other reintroduces the mismatch.
 * Measured on 29 Jul 2026 across all four properties:
 *
 *   dataState: "all"    last day with data = 28 Jul  (today − 1)
 *   dataState: "final"  last day with data = 26 Jul  (today − 3)
 *   Search Console UI   chart ends         = 26 Jul
 *
 * Days present in both states carried identical figures, so `final` is not a
 * different measurement — it is the same one with the unsettled tail withheld.
 *
 * The cost of all this falls on Analytics, whose data settles faster than
 * Search Console's. GA4 figures are exact for the dates shown, but its own UI
 * would offer a day or two this window does not reach. A single window cannot
 * end in two places at once, and pinning both sources to the slower one is what
 * keeps a Search Console number and an Analytics number on the same screen
 * comparable.
 */
export const REPORTING_LAG_FALLBACK_DAYS = 3;

/**
 * Today, in UTC.
 *
 * UTC (not local time) on purpose: the server may run in a different zone from
 * the browser, and both must derive the same window or the range shown in the
 * header won't match the data underneath it.
 *
 * There is a one-render hydration risk if a page renders either side of UTC
 * midnight. That's a far smaller problem than the alternative this replaced —
 * a hardcoded date, which silently froze every range at a fixed day and drifted
 * further from reality every day the app stayed up.
 */
export function todayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The assumed end of the reporting window, for callers that cannot await one.
 *
 * Prefer `resolveReportingAnchor()` (server) or `useFilters().anchor` (client),
 * both of which carry the measured frontier. This is the synchronous stand-in
 * they fall back to, and it is deliberately the only thing in this module that
 * decides a date on its own.
 */
export function fallbackAnchor(): string {
  return addDays(todayUTC(), -REPORTING_LAG_FALLBACK_DAYS);
}

export const MOVEMENT_WINDOW_DAYS: Record<MovementWindow, number> = {
  day: 1,
  week: 7,
  month: 28,
};

export const MOVEMENT_WINDOW_LABELS: Record<MovementWindow, string> = {
  day: "Day over day",
  week: "Week over week",
  month: "Month over month",
};

/**
 * The two windows keyword movement compares.
 *
 * Anchored to the reporting anchor rather than the page's date range: movement
 * asks "what changed recently", which is a fixed-length question. A user
 * looking at a 12-month chart still wants to know what moved yesterday.
 *
 * Note the day-over-day window is a single settled day, so it is the noisiest
 * of the three — one weekend is enough to swing it.
 */
export function movementRange(
  window: MovementWindow,
  anchor: string = fallbackAnchor(),
): {
  range: DateRange;
  previous: DateRange;
} {
  const days = MOVEMENT_WINDOW_DAYS[window];
  const to = anchor;
  const from = addDays(to, -(days - 1));

  return {
    range: { from, to },
    previous: { from: addDays(from, -days), to: addDays(from, -1) },
  };
}

export const RANGE_LABELS: Record<RangeKey, string> = {
  "7d": "Last 7 days",
  "28d": "Last 28 days",
  "3m": "Last 3 months",
  "12m": "Last 12 months",
  custom: "Custom range",
};

export const RANGE_DAYS: Record<Exclude<RangeKey, "custom">, number> = {
  "7d": 7,
  "28d": 28,
  "3m": 90,
  "12m": 365,
};

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = (
  ["7d", "28d", "3m", "12m", "custom"] as RangeKey[]
).map((value) => ({ value, label: RANGE_LABELS[value] }));

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseISODate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function addDays(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function daysBetween(from: string, to: string): number {
  const ms = parseISODate(to).getTime() - parseISODate(from).getTime();
  return Math.round(ms / 86_400_000) + 1; // inclusive
}

/**
 * Resolve a range key (plus optional custom window) to concrete dates.
 *
 * `anchor` is where the window ends. Callers pass the measured one; the default
 * exists so this stays usable before it has been fetched. Server and client
 * must be given the same anchor or the header will describe a window the data
 * underneath it does not cover.
 */
export function resolveRange(
  range: RangeKey,
  custom?: DateRange,
  anchor: string = fallbackAnchor(),
): DateRange {
  if (range === "custom" && custom) return custom;
  const days = RANGE_DAYS[(range === "custom" ? "28d" : range) as Exclude<RangeKey, "custom">];
  return { from: addDays(anchor, -(days - 1)), to: anchor };
}

/** The equal-length window immediately preceding `range`. */
export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.from, range.to);
  return { from: addDays(range.from, -len), to: addDays(range.from, -1) };
}

export function eachDay(range: DateRange): string[] {
  const out: string[] = [];
  const len = daysBetween(range.from, range.to);
  for (let i = 0; i < len; i++) out.push(addDays(range.from, i));
  return out;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "Jul 17" — short, locale-independent so SSR and client agree. */
export function formatShortDate(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "Jul 17, 2026" */
export function formatLongDate(iso: string): string {
  const d = parseISODate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function formatRange(range: DateRange): string {
  return `${formatLongDate(range.from)} – ${formatLongDate(range.to)}`;
}
