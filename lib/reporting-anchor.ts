import "server-only";

import { addDays, REPORTING_LAG_FALLBACK_DAYS, todayUTC } from "./date-range";
import { cached } from "./cache";
import { isGoogleReady } from "./env";
import { searchAnalyticsQuery } from "./search-console";
import { activeWebsitesWithBindings } from "./websites.server";

/**
 * Where the reporting window ends, asked of Search Console rather than assumed.
 *
 * ## Why this is not a constant
 *
 * Search Console finalises a day's data after a delay, and that delay is not
 * fixed. Measured against the live API:
 *
 *   29 Jul 2026 — last finalised day = 26 Jul  (3 days back)
 *   06 Aug 2026 — last finalised day = 04 Aug  (2 days back)
 *
 * A hardcoded offset is therefore right on some days and wrong on others, and
 * being wrong by one day is exactly the failure this dashboard cannot afford:
 * the console shows a seven-day total ending 4 Aug while the dashboard shows
 * one ending 3 Aug, and the two totals disagree with no visible reason. That is
 * read as broken data, not as a different window.
 *
 * So the frontier is measured, not assumed: query the `date` dimension with
 * `dataState: "final"` and take the newest day Google actually returns.
 *
 * ## Why the newest day across *all* properties
 *
 * A day with no rows means no traffic, not no data — so a quiet property looks
 * behind a busy one even though both are processed on the same schedule.
 * Finalisation is Google-wide, so the busiest property reveals the true
 * frontier, and taking the maximum is what lets the quiet ones ride on it.
 * Without that, FWDPod (single-digit impressions, and whole days at zero) would
 * drag the whole portfolio's window backwards.
 */

/** How far back the probe looks. Wide enough to survive a quiet week. */
const PROBE_DAYS = 14;

/**
 * The probe's answer is trusted only inside this band.
 *
 * Google never finalises today, so an answer newer than yesterday is
 * impossible and is clamped. An answer older than a week means every property
 * was silent for that long — the probe is then measuring absence of traffic,
 * not absence of data, and the static fallback is the better guess.
 */
const MIN_LAG_DAYS = 1;
const MAX_LAG_DAYS = 7;

/**
 * How long an answer is reused.
 *
 * The frontier moves once a day, but not at midnight — Search Console's own UI
 * reports "last update" some hours into the day. Thirty minutes keeps the probe
 * off the hot path (it costs one API call per property) while picking up the
 * new day within half an hour of it landing. The key includes today's date, so
 * a UTC day boundary invalidates it regardless.
 */
const TTL_SECONDS = 1_800;

/**
 * The last answer the probe actually measured, kept across TTLs and days.
 *
 * The frontier only ever moves forward, and it moves by a day at a time. So
 * yesterday's measurement is a far better guess during an outage than a static
 * offset — it is off by at most a day, where the offset can be off by one in
 * either direction on any given date.
 *
 * Deliberately not written when the probe fails: this must only ever hold
 * something Search Console said.
 */
let lastMeasured: string | undefined;

/** Thrown when the probe has nothing usable, so the failure isn't cached. */
class ProbeFailed extends Error {}

/**
 * The most recent day with settled Search Console data.
 *
 * Degrades rather than throws — a stale window beats a failed page — but a
 * degraded answer is never cached. That distinction is load-bearing: a single
 * transient token failure once pinned the whole dashboard to the fallback
 * window for the full cache TTL, which looks exactly like the bug this module
 * exists to fix. Rejections evict, so the next request re-probes.
 */
export async function resolveReportingAnchor(): Promise<string> {
  const today = todayUTC();
  const oldestAllowed = addDays(today, -MAX_LAG_DAYS);
  const degraded = () =>
    lastMeasured && lastMeasured > oldestAllowed
      ? lastMeasured
      : addDays(today, -REPORTING_LAG_FALLBACK_DAYS);

  if (!isGoogleReady()) return degraded();

  const properties = [
    ...new Set(
      activeWebsitesWithBindings()
        .map((w) => w.searchConsoleProperty)
        .filter(Boolean),
    ),
  ];
  if (properties.length === 0) return degraded();

  return cached(
    `reporting-anchor:${today}`,
    async () => {
      const range = { from: addDays(today, -PROBE_DAYS), to: today };

      // One property failing must not lose the answer the others hold, so a
      // rejection contributes "" rather than rejecting the batch.
      const latestPerProperty = await Promise.all(
        properties.map((property) =>
          searchAnalyticsQuery({
            property,
            range,
            dimensions: ["date"],
            dataState: "final",
            rowLimit: PROBE_DAYS + 1,
          })
            .then(({ rows }) =>
              rows.reduce((newest, row) => (row.keys[0] > newest ? row.keys[0] : newest), ""),
            )
            .catch(() => ""),
        ),
      );

      const latest = latestPerProperty.reduce((a, b) => (b > a ? b : a), "");
      if (!latest || latest < oldestAllowed) {
        throw new ProbeFailed("Search Console returned no finalised day.");
      }

      // Google never finalises today, so anything newer is a bad read.
      const newestAllowed = addDays(today, -MIN_LAG_DAYS);
      lastMeasured = latest > newestAllowed ? newestAllowed : latest;
      return lastMeasured;
    },
    { ttlSeconds: TTL_SECONDS },
  ).catch(() => degraded());
}
