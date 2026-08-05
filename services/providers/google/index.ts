import "server-only";

import type {
  AcquisitionRow,
  AudienceSplitRow,
  BreakdownSlice,
  ConversionEventRow,
  ConversionSummary,
  DateRange,
  DropOffRow,
  EngagementSnapshot,
  JourneyStage,
  MetricValue,
  Metrics,
  PagePerformanceRow,
  PageRow,
  PreviousRowMetrics,
  QueryRow,
  SearchBreakdownRow,
  TimeseriesPoint,
  Website,
} from "@/types";
import {
  GA4_DIMENSIONS,
  GA4_INSIGHT_METRICS,
  GA4_METRICS,
  parseGa4Date,
  runReport,
  type Ga4Row,
} from "@/lib/google-analytics";
import { searchAnalyticsQuery, toPagePath, type GscRow } from "@/lib/search-console";
import { addDays, eachDay } from "@/lib/date-range";
import { countryName, deviceName } from "@/lib/countries";
import type { DataProvider, ProviderContext } from "../types";
import { absenceIsProvable, classifyMovement, type MovementInputRow } from "../movement";

/**
 * The live provider: Google Analytics 4 + Search Console.
 *
 * Each method issues the current-window and previous-window requests together
 * via `Promise.all`, because the dashboard always shows a delta and two serial
 * round trips would double the latency for no benefit.
 *
 * The two APIs are queried independently and joined here on the page path —
 * Search Console owns clicks/impressions/CTR/position, GA4 owns
 * users/sessions/engagement. That join is the whole point of this dashboard,
 * and it is the one piece of logic the mock provider fakes rather than models.
 *
 * The client functions currently throw `not_configured`, so these methods do
 * too. The mapping below is written against the real response shapes, so once
 * the clients are wired this provider works without further changes.
 */

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function change(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 1;
  return (current - previous) / previous;
}

/** Rows requested per Search Console call. Also the truncation threshold. */
const ROW_LIMIT = 250;

/**
 * Decide whether "missing from the previous window" means "new".
 *
 * Delegates to the shared implementation so this and keyword movement can never
 * disagree about what counts as a genuine appearance — the reasoning is
 * documented there.
 */
function newRowTest(previous: readonly GscRow[]): (row: GscRow) => boolean {
  return absenceIsProvable(previous, ROW_LIMIT);
}

/**
 * Project a previous-window Search Console row onto the shared `prev*` fields.
 *
 * `undefined` means the query or page did not come back in the previous window,
 * which zeroes every field — including `prevPosition`, whose `0` is a sentinel
 * rather than a rank. Consumers must gate on `prevImpressions > 0`.
 */
function previousMetrics(
  before: GscRow | undefined,
  current: GscRow,
  isNewRow: (row: GscRow) => boolean,
): PreviousRowMetrics {
  return {
    prevClicks: before?.clicks ?? 0,
    prevImpressions: before?.impressions ?? 0,
    prevCtr: before?.ctr ?? 0,
    prevPosition: before ? Number(before.position.toFixed(1)) : 0,
    isNew: !before && isNewRow(current),
  };
}

/** Country and device tables are short — no need to pull a thousand rows. */
const BREAKDOWN_ROW_LIMIT = 100;

/** Adapt a Search Console row to the shared movement classifier's shape. */
function toMovementRow(row: GscRow): MovementInputRow {
  return {
    key: row.keys[0] ?? "",
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.ctr,
    position: Number(row.position.toFixed(1)),
  };
}

/**
 * Join a current and previous Search Console breakdown into display rows.
 *
 * `share` is computed against the sum of the returned rows rather than the
 * property's true total. Those differ: Search Console anonymises long-tail
 * rows, so dimensioned results never quite add up to the undimensioned total.
 * Sharing against the visible rows keeps the column summing to 100%, which is
 * what a reader checks first.
 */
function toBreakdown(
  now: readonly GscRow[],
  previous: readonly GscRow[],
  label: (key: string) => string,
): SearchBreakdownRow[] {
  const prevByKey = new Map(previous.map((r) => [r.keys[0] ?? "", r.clicks]));
  const total = now.reduce((sum, r) => sum + r.clicks, 0);

  return now
    .map((r) => {
      const key = r.keys[0] ?? "";
      const prevClicks = prevByKey.get(key) ?? 0;

      return {
        key,
        label: label(key),
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr,
        position: Number(r.position.toFixed(1)),
        share: total === 0 ? 0 : r.clicks / total,
        prevClicks,
        trend: change(r.clicks, prevClicks),
      };
    })
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions);
}

/* -------------------------------------------------------------------------- */
/*  Analytics insights                                                         */
/* -------------------------------------------------------------------------- */

/*
 * Metric lists for the insights report.
 *
 * Every list is at or under GA4's hard cap of 10 metrics per request. The
 * engagement and conversion sets are deliberately separate calls for that
 * reason — combined they are 13 and the API rejects the request outright.
 *
 * Order matters: every decoder below reads `row.metrics` positionally.
 */
const ENGAGEMENT_METRICS = [
  GA4_METRICS.users,
  GA4_METRICS.newUsers,
  GA4_METRICS.sessions,
  GA4_METRICS.engagedSessions,
  GA4_METRICS.views,
  GA4_INSIGHT_METRICS.bounceRate,
  GA4_INSIGHT_METRICS.engagementRate,
  GA4_INSIGHT_METRICS.viewsPerSession,
  GA4_INSIGHT_METRICS.sessionsPerUser,
  GA4_INSIGHT_METRICS.engagementDuration,
];

const CONVERSION_METRICS = [
  GA4_INSIGHT_METRICS.keyEvents,
  GA4_INSIGHT_METRICS.keyEventRate,
  GA4_INSIGHT_METRICS.revenue,
];

const ACQUISITION_METRICS = [
  GA4_METRICS.sessions,
  GA4_METRICS.users,
  GA4_METRICS.engagedSessions,
  GA4_INSIGHT_METRICS.engagementRate,
  GA4_INSIGHT_METRICS.keyEvents,
];

const EVENT_METRICS = [GA4_INSIGHT_METRICS.eventCount, GA4_INSIGHT_METRICS.keyEvents];

const PAGE_METRICS = [
  GA4_METRICS.views,
  GA4_METRICS.users,
  GA4_INSIGHT_METRICS.engagementDuration,
  GA4_INSIGHT_METRICS.engagementRate,
  GA4_INSIGHT_METRICS.bounceRate,
];

const LANDING_METRICS = [
  GA4_METRICS.sessions,
  GA4_INSIGHT_METRICS.bounceRate,
  GA4_INSIGHT_METRICS.engagementRate,
  GA4_INSIGHT_METRICS.avgSessionDuration,
];

const AUDIENCE_METRICS = [
  GA4_METRICS.users,
  GA4_METRICS.sessions,
  GA4_INSIGHT_METRICS.engagementRate,
];

/** Rows below this carry too little traffic to rank or to judge engagement on. */
const MIN_PAGE_VIEWS = 30;
const MIN_LANDING_SESSIONS = 20;

/** Thousands separator for figures embedded in provider-side strings. */
function formatCount(n: number): string {
  return n.toLocaleString("en-US");
}

/**
 * Reject rows that are not real pages.
 *
 * Two kinds of noise show up here and both crowd out genuine findings:
 * `(not set)`, which is GA4's placeholder when it cannot attribute a hit, and
 * injected tracking frames — Shopify's `/web-pixels@…/sandbox/…` in particular —
 * which record views and engagement but are not pages anyone can visit or
 * improve. Left in, they take the top slot in the drop-off table and the bottom
 * slot in page performance, where they read as urgent problems.
 */
function isRealPage(path: string): boolean {
  if (!path) return false;
  const normalised = path.trim().toLowerCase();
  if (normalised === "(not set)" || normalised === "(other)") return false;
  if (normalised.startsWith("/web-pixels@")) return false;
  if (normalised.includes("/sandbox/modern")) return false;
  return true;
}

/**
 * `undefined` when GA4 returned no rows at all.
 *
 * A property with no data — an unfired tag, or a metric with nothing to report —
 * comes back with an empty row set rather than a row of zeros, so every decoder
 * has to tolerate that rather than indexing into nothing.
 */
function toEngagement(row: Ga4Row | undefined): EngagementSnapshot {
  const m = row?.metrics ?? [];
  return {
    users: m[0] ?? 0,
    newUsers: m[1] ?? 0,
    sessions: m[2] ?? 0,
    engagedSessions: m[3] ?? 0,
    views: m[4] ?? 0,
    bounceRate: m[5] ?? 0,
    engagementRate: m[6] ?? 0,
    viewsPerSession: m[7] ?? 0,
    sessionsPerUser: m[8] ?? 0,
    engagementDuration: m[9] ?? 0,
  };
}

function toConversions(
  now: Ga4Row | undefined,
  previous: Ga4Row | undefined,
  eventsNow: readonly Ga4Row[],
  eventsPrev: readonly Ga4Row[],
): ConversionSummary {
  const keyEvents = now?.metrics[0] ?? 0;
  const prevKeyEvents = previous?.metrics[0] ?? 0;

  const prevByEvent = new Map(eventsPrev.map((r) => [r.dimensions[0] ?? "", r.metrics[1] ?? 0]));

  const events: ConversionEventRow[] = eventsNow
    .map((r) => {
      const eventName = r.dimensions[0] ?? "";
      const count = r.metrics[1] ?? 0;
      const before = prevByEvent.get(eventName) ?? 0;
      return {
        eventName,
        eventCount: r.metrics[0] ?? 0,
        keyEvents: count,
        prevKeyEvents: before,
        trend: change(count, before),
      };
    })
    .filter((e) => e.keyEvents > 0)
    .sort((a, b) => b.keyEvents - a.keyEvents);

  return {
    keyEvents,
    prevKeyEvents,
    keyEventRate: now?.metrics[1] ?? 0,
    revenue: now?.metrics[2] ?? 0,
    events,
    // Nothing is marked as a key event in GA4 — a setup gap, not a zero result.
    notConfigured: keyEvents === 0 && prevKeyEvents === 0 && events.length === 0,
  };
}

function toAcquisition(now: readonly Ga4Row[], previous: readonly Ga4Row[]): AcquisitionRow[] {
  const prevByLabel = new Map(previous.map((r) => [r.dimensions[0] ?? "", r.metrics[0] ?? 0]));
  const total = now.reduce((sum, r) => sum + (r.metrics[0] ?? 0), 0);

  return now
    .map((r) => {
      const label = r.dimensions[0] || "(not set)";
      const sessions = r.metrics[0] ?? 0;
      const prevSessions = prevByLabel.get(r.dimensions[0] ?? "") ?? 0;

      return {
        label,
        sessions,
        users: r.metrics[1] ?? 0,
        engagedSessions: r.metrics[2] ?? 0,
        engagementRate: r.metrics[3] ?? 0,
        keyEvents: r.metrics[4] ?? 0,
        prevSessions,
        trend: change(sessions, prevSessions),
        share: total === 0 ? 0 : sessions / total,
      };
    })
    .sort((a, b) => b.sessions - a.sessions);
}

/**
 * Rank a page on engagement quality, not on traffic.
 *
 * Volume is deliberately excluded: ranking by views would make "top performing"
 * a restatement of "most visited", which the table above already shows. This
 * blends engagement rate, the inverse of bounce, and time on page — so a modest
 * page that holds attention can outrank a busy one that does not.
 *
 * Time is normalised against two minutes and capped, so one outlier page cannot
 * dominate the scale.
 */
function pageScore(engagementRate: number, bounceRate: number, avgSeconds: number): number {
  const attention = Math.min(1, avgSeconds / 120);
  const blended = engagementRate * 0.45 + (1 - bounceRate) * 0.3 + attention * 0.25;
  return Math.round(Math.max(0, Math.min(1, blended)) * 100);
}

function toPagePerformance(rows: readonly Ga4Row[]): PagePerformanceRow[] {
  return rows
    .filter((r) => (r.metrics[0] ?? 0) >= MIN_PAGE_VIEWS && isRealPage(r.dimensions[0] ?? ""))
    .map((r) => {
      const views = r.metrics[0] ?? 0;
      const engagementRate = r.metrics[3] ?? 0;
      const bounceRate = r.metrics[4] ?? 0;
      // GA4 returns total engagement seconds; per-view is the comparable figure.
      const avgEngagementTime = views === 0 ? 0 : (r.metrics[2] ?? 0) / views;

      return {
        page: r.dimensions[0] || "/",
        views,
        users: r.metrics[1] ?? 0,
        engagementRate,
        bounceRate,
        avgEngagementTime,
        score: pageScore(engagementRate, bounceRate, avgEngagementTime),
      };
    })
    .sort((a, b) => b.score - a.score || b.views - a.views);
}

function toDropOff(rows: readonly Ga4Row[]): DropOffRow[] {
  return rows
    .filter((r) => (r.metrics[0] ?? 0) >= MIN_LANDING_SESSIONS && isRealPage(r.dimensions[0] ?? ""))
    .map((r) => {
      const sessions = r.metrics[0] ?? 0;
      const bounceRate = r.metrics[1] ?? 0;
      return {
        page: r.dimensions[0] || "/",
        sessions,
        bounceRate,
        engagementRate: r.metrics[2] ?? 0,
        avgSessionDuration: r.metrics[3] ?? 0,
        lostSessions: Math.round(sessions * bounceRate),
      };
    })
    // Most sessions actually lost, not the highest percentage — a 100% bounce
    // on 21 sessions matters far less than 40% on 4,000.
    .sort((a, b) => b.lostSessions - a.lostSessions);
}

function toAudience(rows: readonly Ga4Row[]): AudienceSplitRow[] {
  const total = rows.reduce((sum, r) => sum + (r.metrics[0] ?? 0), 0);
  return rows
    .map((r) => ({
      label: r.dimensions[0] === "new" ? "New" : r.dimensions[0] === "returning" ? "Returning" : "Unknown",
      users: r.metrics[0] ?? 0,
      sessions: r.metrics[1] ?? 0,
      engagementRate: r.metrics[2] ?? 0,
      share: total === 0 ? 0 : (r.metrics[0] ?? 0) / total,
    }))
    .sort((a, b) => b.users - a.users);
}

/**
 * The aggregate journey funnel.
 *
 * Four stages rather than a page path: the Data API exposes no sequence data,
 * so this is where visitors fall away in the abstract, not which routes they
 * took. The last stage is omitted entirely when no key events are configured —
 * a stage that is structurally always zero teaches nothing.
 */
function toJourney(e: EngagementSnapshot, conversions: ConversionSummary): JourneyStage[] {
  // Starts at sessions, not users.
  //
  // A funnel must narrow, and users → sessions does the opposite: one person
  // can start many visits, so sessions routinely exceed users and the "retained
  // from previous stage" figure comes out above 100%. Sessions, engaged
  // sessions and key events are genuinely nested subsets of one another, so
  // they are the only stages that belong here. Users are reported alongside as
  // context instead — they are a different unit, not an earlier stage.
  const stages: { stage: string; value: number; description: string }[] = [
    {
      stage: "Sessions",
      value: e.sessions,
      description: `Visits from ${formatCount(e.users)} distinct users.`,
    },
    {
      stage: "Engaged sessions",
      value: e.engagedSessions,
      description: "Lasted over 10s, or had 2+ views, or triggered a key event.",
    },
  ];

  if (!conversions.notConfigured) {
    stages.push({
      stage: "Key events",
      value: conversions.keyEvents,
      description: "Sessions that completed an action marked as a key event.",
    });
  }

  const first = stages[0]?.value ?? 0;
  return stages.map((s, i) => {
    const before = i === 0 ? s.value : stages[i - 1].value;
    return {
      ...s,
      share: first === 0 ? 0 : s.value / first,
      stepRate: i === 0 ? 1 : before === 0 ? 0 : s.value / before,
    };
  });
}

/** Downsample a daily series to at most `n` points for sparklines. */
function sparkline(values: number[], n = 24): number[] {
  if (values.length <= n) return values;
  const bucket = values.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const slice = values.slice(Math.floor(i * bucket), Math.floor((i + 1) * bucket));
    if (slice.length) out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}

function metric(current: number, previous: number, spark: number[]): MetricValue {
  return { current, previous, change: change(current, previous), spark };
}

/** GSC totals come from an *undimensioned* query — see the note in the client. */
async function gscTotals(property: string, range: DateRange) {
  const { rows } = await searchAnalyticsQuery({ property, range, dimensions: [] });
  const row = rows[0];
  return {
    clicks: row?.clicks ?? 0,
    impressions: row?.impressions ?? 0,
    ctr: row?.ctr ?? 0,
    position: row?.position ?? 0,
  };
}

async function gscDaily(property: string, range: DateRange) {
  const { rows } = await searchAnalyticsQuery({
    property,
    range,
    dimensions: ["date"],
    rowLimit: 1000,
  });
  return new Map(rows.map((r) => [r.keys[0], r]));
}

async function ga4Totals(propertyId: string, range: DateRange) {
  const { rows } = await runReport({
    propertyId,
    dateRanges: [range],
    dimensions: [],
    metrics: Object.values(GA4_METRICS),
  });
  const m = rows[0]?.metrics ?? [];
  const [users = 0, newUsers = 0, sessions = 0, engagedSessions = 0, views = 0, avgEngagementTime = 0] = m;
  return { users, newUsers, sessions, engagedSessions, views, avgEngagementTime };
}

async function ga4Daily(propertyId: string, range: DateRange) {
  const { rows } = await runReport({
    propertyId,
    dateRanges: [range],
    dimensions: [GA4_DIMENSIONS.date],
    metrics: [GA4_METRICS.users, GA4_METRICS.sessions],
  });
  return new Map(
    rows.map((r) => [
      parseGa4Date(r.dimensions[0]),
      { users: r.metrics[0] ?? 0, sessions: r.metrics[1] ?? 0 },
    ]),
  );
}

function toSlices(
  rows: { dimensions: string[]; metrics: number[] }[],
): BreakdownSlice[] {
  const total = rows.reduce((t, r) => t + (r.metrics[0] ?? 0), 0);
  return rows
    .map((r) => ({
      label: r.dimensions[0] || "(not set)",
      value: r.metrics[0] ?? 0,
      share: total === 0 ? 0 : (r.metrics[0] ?? 0) / total,
    }))
    .sort((a, b) => b.value - a.value);
}

/* -------------------------------------------------------------------------- */
/*  Provider                                                                   */
/* -------------------------------------------------------------------------- */

export const googleProvider: DataProvider = {
  kind: "google",

  async getOverview(ctx: ProviderContext) {
    const { site, range, previous } = ctx;

    const [gscNow, gscPrev, gaNow, gaPrev, gscSeries, gaSeries, weekNow, weekPrev] =
      await Promise.all([
        gscTotals(site.searchConsoleProperty, range),
        gscTotals(site.searchConsoleProperty, previous),
        ga4Totals(site.analyticsPropertyId, range),
        ga4Totals(site.analyticsPropertyId, previous),
        gscDaily(site.searchConsoleProperty, range),
        ga4Daily(site.analyticsPropertyId, range),
        // Weekly growth is always the last 7 days vs the 7 before, regardless of
        // the selected range — it has to mean the same thing on every card.
        gscTotals(site.searchConsoleProperty, {
          from: addDays(range.to, -6),
          to: range.to,
        }),
        gscTotals(site.searchConsoleProperty, {
          from: addDays(range.to, -13),
          to: addDays(range.to, -7),
        }),
      ]);

    const days = eachDay(range);
    const clickSeries = days.map((d) => gscSeries.get(d)?.clicks ?? 0);
    const imprSeries = days.map((d) => gscSeries.get(d)?.impressions ?? 0);
    const ctrSeries = days.map((d) => gscSeries.get(d)?.ctr ?? 0);
    const posSeries = days.map((d) => gscSeries.get(d)?.position ?? 0);
    const userSeries = days.map((d) => gaSeries.get(d)?.users ?? 0);
    const sessionSeries = days.map((d) => gaSeries.get(d)?.sessions ?? 0);

    const metrics: Metrics = {
      clicks: metric(gscNow.clicks, gscPrev.clicks, sparkline(clickSeries)),
      impressions: metric(gscNow.impressions, gscPrev.impressions, sparkline(imprSeries)),
      ctr: metric(gscNow.ctr, gscPrev.ctr, sparkline(ctrSeries)),
      position: metric(gscNow.position, gscPrev.position, sparkline(posSeries)),
      users: metric(gaNow.users, gaPrev.users, sparkline(userSeries)),
      newUsers: metric(gaNow.newUsers, gaPrev.newUsers, sparkline(userSeries)),
      sessions: metric(gaNow.sessions, gaPrev.sessions, sparkline(sessionSeries)),
      engagedSessions: metric(
        gaNow.engagedSessions,
        gaPrev.engagedSessions,
        sparkline(sessionSeries),
      ),
      views: metric(gaNow.views, gaPrev.views, sparkline(sessionSeries)),
      avgEngagementTime: metric(
        gaNow.avgEngagementTime,
        gaPrev.avgEngagementTime,
        sparkline(sessionSeries),
      ),
    };

    return { metrics, weeklyGrowth: change(weekNow.clicks, weekPrev.clicks) };
  },

  async getTraffic(ctx: ProviderContext) {
    const { site, range, previous } = ctx;

    const [gscNow, gscPrev, gaNow, gaPrev, channels, devices] = await Promise.all([
      gscDaily(site.searchConsoleProperty, range),
      gscDaily(site.searchConsoleProperty, previous),
      ga4Daily(site.analyticsPropertyId, range),
      ga4Daily(site.analyticsPropertyId, previous),
      runReport({
        propertyId: site.analyticsPropertyId,
        dateRanges: [range],
        dimensions: [GA4_DIMENSIONS.channel],
        metrics: [GA4_METRICS.sessions],
      }),
      runReport({
        propertyId: site.analyticsPropertyId,
        dateRanges: [range],
        dimensions: [GA4_DIMENSIONS.device],
        metrics: [GA4_METRICS.users],
      }),
    ]);

    const days = eachDay(range);
    const prevDays = eachDay(previous);

    const timeseries: TimeseriesPoint[] = days.map((date, i) => {
      const g = gscNow.get(date);
      const a = gaNow.get(date);
      // Previous period aligns by index, not by date, so the two windows overlay.
      const pg = gscPrev.get(prevDays[i] ?? "");
      const pa = gaPrev.get(prevDays[i] ?? "");

      return {
        date,
        clicks: g?.clicks ?? 0,
        impressions: g?.impressions ?? 0,
        ctr: g?.ctr ?? 0,
        position: Number((g?.position ?? 0).toFixed(1)),
        users: a?.users ?? 0,
        sessions: a?.sessions ?? 0,
        prevClicks: pg?.clicks ?? 0,
        prevImpressions: pg?.impressions ?? 0,
        prevUsers: pa?.users ?? 0,
        prevSessions: pa?.sessions ?? 0,
        prevCtr: pg?.ctr ?? 0,
        prevPosition: Number((pg?.position ?? 0).toFixed(1)),
      };
    });

    return {
      timeseries,
      trafficSources: toSlices(channels.rows),
      devices: toSlices(devices.rows),
    };
  },

  async getQueries(ctx: ProviderContext) {
    const { site, range, previous } = ctx;

    const [now, prev] = await Promise.all([
      searchAnalyticsQuery({
        property: site.searchConsoleProperty,
        range,
        dimensions: ["query"],
        rowLimit: ROW_LIMIT,
      }),
      searchAnalyticsQuery({
        property: site.searchConsoleProperty,
        range: previous,
        dimensions: ["query"],
        rowLimit: ROW_LIMIT,
      }),
    ]);

    // Keep the whole previous row, not just its clicks. Both windows are already
    // on the wire to compute `trend`; retaining position/impressions/CTR is what
    // lets the Action Center detect rank drops and impression loss for free.
    const prevByKeyword = new Map(prev.rows.map((r) => [r.keys[0], r]));
    const isNewRow = newRowTest(prev.rows);

    const queries: QueryRow[] = now.rows.map((row) => {
      const keyword = row.keys[0] ?? "";
      const before = prevByKeyword.get(keyword);

      return {
        keyword,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: Number(row.position.toFixed(1)),
        trend: change(row.clicks, before?.clicks ?? 0),
        // Per-keyword daily history needs one query per keyword, which blows the
        // API quota. The cell degrades to a flat line rather than paying that.
        spark: [],
        ...previousMetrics(before, row, isNewRow),
      };
    });

    return { queries: queries.sort((a, b) => b.clicks - a.clicks) };
  },

  async getLandingPages(ctx: ProviderContext) {
    const { site, range, previous } = ctx;

    const [now, prev, ga] = await Promise.all([
      searchAnalyticsQuery({
        property: site.searchConsoleProperty,
        range,
        dimensions: ["page"],
        rowLimit: ROW_LIMIT,
      }),
      searchAnalyticsQuery({
        property: site.searchConsoleProperty,
        range: previous,
        dimensions: ["page"],
        rowLimit: ROW_LIMIT,
      }),
      runReport({
        propertyId: site.analyticsPropertyId,
        dateRanges: [range],
        dimensions: [GA4_DIMENSIONS.landingPage],
        metrics: [
          GA4_METRICS.users,
          GA4_METRICS.sessions,
          GA4_METRICS.avgEngagementTime,
        ],
        limit: ROW_LIMIT,
      }),
    ]);

    // Keyed by raw GSC URL, matching the raw `row.keys[0]` used at lookup time —
    // deliberately not the normalised path, so both sides of the join agree.
    const prevByPage = new Map(prev.rows.map((r) => [r.keys[0], r]));
    const isNewRow = newRowTest(prev.rows);

    // GA4 keys landing pages by path; GSC by absolute URL. Normalise to path so
    // the two sources can be joined.
    const gaByPath = new Map(
      ga.rows.map((r) => [
        r.dimensions[0] || "/",
        {
          users: r.metrics[0] ?? 0,
          sessions: r.metrics[1] ?? 0,
          avgEngagementTime: r.metrics[2] ?? 0,
        },
      ]),
    );

    const pages: PageRow[] = now.rows.map((row) => {
      const url = row.keys[0] ?? "";
      const path = toPagePath(url, site.url);
      const engagement = gaByPath.get(path);
      const before = prevByPage.get(url);

      return {
        page: path,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: Number(row.position.toFixed(1)),
        users: engagement?.users ?? 0,
        sessions: engagement?.sessions ?? 0,
        avgEngagementTime: Math.round(engagement?.avgEngagementTime ?? 0),
        trend: change(row.clicks, before?.clicks ?? 0),
        ...previousMetrics(before, row, isNewRow),
      };
    });

    return { pages: pages.sort((a, b) => b.clicks - a.clicks) };
  },

  async getAnalyticsInsights(ctx: ProviderContext) {
    const { site, range, previous } = ctx;
    const propertyId = site.analyticsPropertyId;
    const report = (
      dateRanges: DateRange[],
      dimensions: string[],
      metrics: string[],
      limit?: number,
    ) => runReport({ propertyId, dateRanges, dimensions, metrics, limit });

    const [
      totalsNow,
      totalsPrev,
      convNow,
      convPrev,
      channelsNow,
      channelsPrev,
      sourcesNow,
      sourcesPrev,
      eventsNow,
      eventsPrev,
      pages,
      landing,
      audience,
    ] = await Promise.all([
      report([range], [], ENGAGEMENT_METRICS),
      report([previous], [], ENGAGEMENT_METRICS),
      // Split from the engagement call: together they exceed GA4's hard limit
      // of 10 metrics per request, which fails with INVALID_ARGUMENT.
      report([range], [], CONVERSION_METRICS),
      report([previous], [], CONVERSION_METRICS),
      report([range], [GA4_DIMENSIONS.channel], ACQUISITION_METRICS, BREAKDOWN_ROW_LIMIT),
      report([previous], [GA4_DIMENSIONS.channel], ACQUISITION_METRICS, BREAKDOWN_ROW_LIMIT),
      report([range], [GA4_DIMENSIONS.sourceMedium], ACQUISITION_METRICS, BREAKDOWN_ROW_LIMIT),
      report([previous], [GA4_DIMENSIONS.sourceMedium], ACQUISITION_METRICS, BREAKDOWN_ROW_LIMIT),
      report([range], [GA4_DIMENSIONS.eventName], EVENT_METRICS, BREAKDOWN_ROW_LIMIT),
      report([previous], [GA4_DIMENSIONS.eventName], EVENT_METRICS, BREAKDOWN_ROW_LIMIT),
      report([range], [GA4_DIMENSIONS.pagePath], PAGE_METRICS, ROW_LIMIT),
      report([range], [GA4_DIMENSIONS.landingPage], LANDING_METRICS, ROW_LIMIT),
      report([range], [GA4_DIMENSIONS.newVsReturning], AUDIENCE_METRICS, 10),
    ]);

    const engagement = toEngagement(totalsNow.rows[0]);
    const previousEngagement = toEngagement(totalsPrev.rows[0]);
    const conversions = toConversions(convNow.rows[0], convPrev.rows[0], eventsNow.rows, eventsPrev.rows);

    return {
      engagement,
      previousEngagement,
      channels: toAcquisition(channelsNow.rows, channelsPrev.rows),
      sources: toAcquisition(sourcesNow.rows, sourcesPrev.rows),
      conversions,
      journey: toJourney(engagement, conversions),
      pages: toPagePerformance(pages.rows),
      dropOff: toDropOff(landing.rows),
      audience: toAudience(audience.rows),
    };
  },

  async getKeywordMovement(ctx: ProviderContext) {
    const { site, range, previous } = ctx;

    const [now, prev] = await Promise.all([
      searchAnalyticsQuery({
        property: site.searchConsoleProperty,
        range,
        dimensions: ["query"],
        rowLimit: ROW_LIMIT,
      }),
      searchAnalyticsQuery({
        property: site.searchConsoleProperty,
        range: previous,
        dimensions: ["query"],
        rowLimit: ROW_LIMIT,
      }),
    ]);

    return classifyMovement(now.rows.map(toMovementRow), prev.rows.map(toMovementRow), ROW_LIMIT);
  },

  async getSearchBreakdowns(ctx: ProviderContext) {
    const { site, range, previous } = ctx;
    const property = site.searchConsoleProperty;

    // Four calls, batched. Countries and devices each need both windows so the
    // tables can show a trend rather than a bare snapshot.
    const [countriesNow, countriesPrev, devicesNow, devicesPrev] = await Promise.all([
      searchAnalyticsQuery({ property, range, dimensions: ["country"], rowLimit: BREAKDOWN_ROW_LIMIT }),
      searchAnalyticsQuery({ property, range: previous, dimensions: ["country"], rowLimit: BREAKDOWN_ROW_LIMIT }),
      searchAnalyticsQuery({ property, range, dimensions: ["device"], rowLimit: BREAKDOWN_ROW_LIMIT }),
      searchAnalyticsQuery({ property, range: previous, dimensions: ["device"], rowLimit: BREAKDOWN_ROW_LIMIT }),
    ]);

    return {
      countries: toBreakdown(countriesNow.rows, countriesPrev.rows, countryName),
      devices: toBreakdown(devicesNow.rows, devicesPrev.rows, deviceName),
    };
  },

  async lastSync(_site: Website) {
    // Live data is as fresh as the request that fetched it.
    return new Date().toISOString();
  },
};
