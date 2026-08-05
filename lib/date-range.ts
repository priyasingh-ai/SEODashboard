import type { DateRange, MovementWindow, RangeKey } from "@/types";

/**
 * How many days back the reporting window ends.
 *
 * Three days — where Search Console's finalised data ends, so this dashboard
 * and the Search Console UI describe the same window. Paired with
 * `dataState: "final"` on the Search Console side; the two settings are a
 * matched pair and changing one without the other reintroduces the mismatch.
 *
 * Measured against the live API on 29 Jul 2026, across all four properties:
 *
 *   dataState: "all"    last day with data = 28 Jul  (today − 1)
 *   dataState: "final"  last day with data = 26 Jul  (today − 3)
 *   Search Console UI   chart ends         = 26 Jul
 *
 * Days present in both states carried identical figures, so `final` is not a
 * different measurement — it is the same one with the unsettled tail withheld.
 *
 * This replaces a deliberate choice to run one day back on `dataState: "all"`,
 * which surfaced the freshest data Google had but put this dashboard two days
 * ahead of the console it is meant to mirror. Fresher was not worth the cost:
 * a number here that no Search Console screen can reproduce reads as a bug, and
 * the fresh tail is provisional anyway — Google revises it for roughly 48h.
 *
 * Why not one or two: those days exist only under `dataState: "all"`. Requesting
 * them as `final` returns nothing, and the daily series fills absent days with
 * zero, so every chart would end in a cliff that is an artefact of the request
 * rather than a drop in traffic.
 *
 * The cost falls on Analytics, whose data settles faster than Search Console's.
 * GA4 figures are exact for the dates shown, but its own UI would offer two or
 * three days this window does not reach. A single window cannot end in two
 * places at once, and pinning both sources to the slower one is what keeps a
 * Search Console number and an Analytics number on the same screen comparable.
 */
export const REPORTING_LAG_DAYS = 3;

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

/** The most recent day with settled data — where every range ends. */
export function reportingAnchor(): string {
  return addDays(todayUTC(), -REPORTING_LAG_DAYS);
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
 * Anchored to `reportingAnchor()` rather than the page's date range: movement
 * asks "what changed recently", which is a fixed-length question. A user
 * looking at a 12-month chart still wants to know what moved yesterday.
 *
 * Note the day-over-day window is a single settled day, so it is the noisiest
 * of the three — one weekend is enough to swing it.
 */
export function movementRange(window: MovementWindow): {
  range: DateRange;
  previous: DateRange;
} {
  const days = MOVEMENT_WINDOW_DAYS[window];
  const to = reportingAnchor();
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

/** Resolve a range key (plus optional custom window) to concrete dates. */
export function resolveRange(range: RangeKey, custom?: DateRange): DateRange {
  if (range === "custom" && custom) return custom;
  const days = RANGE_DAYS[(range === "custom" ? "28d" : range) as Exclude<RangeKey, "custom">];
  const anchor = reportingAnchor();
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
