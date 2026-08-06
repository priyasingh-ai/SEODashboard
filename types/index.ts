/**
 * Domain types for the SEO Portfolio Dashboard.
 *
 * These describe the *shape the UI consumes*, deliberately decoupled from any
 * upstream API. The mock layer and (later) the GA4 / Search Console layers both
 * produce these types, so swapping the source never touches a component.
 */

export type RangeKey = "7d" | "28d" | "3m" | "12m" | "custom";

export interface DateRange {
  /** ISO date (yyyy-MM-dd), inclusive. */
  from: string;
  /** ISO date (yyyy-MM-dd), inclusive. */
  to: string;
}

export interface Filters {
  siteId: string;
  range: RangeKey;
  /** Only meaningful when `range === "custom"`. */
  custom?: DateRange;
  compare: boolean;
}

/**
 * A configured property's public identity, as declared in `lib/websites.ts`.
 *
 * Safe to import from client components — it carries no Google bindings.
 */
export interface WebsiteConfig {
  id: string;
  name: string;
  /**
   * Display hostname, e.g. `thedocmirror.com`. Cosmetic only — this is the
   * label under the site name on cards and in the switcher, so it drops the
   * `www.` that nobody wants to read.
   */
  domain: string;
  /**
   * The canonical origin the site actually serves from, e.g.
   * `https://www.thedocmirror.com` — **including `www.` when the site uses it.**
   *
   * This one is functional, not cosmetic. Search Console returns fully-qualified
   * URLs on its `page` dimension, and `toPagePath()` strips exactly this prefix
   * to get the `/pricing` path that GA4's landing-page dimension is keyed by.
   * Get the `www.` wrong and the strip silently no-ops: the Landing Pages table
   * shows full URLs and every GA4 engagement column joins to zero.
   */
  url: string;
  /** Favicon URL for the property. */
  favicon: string;
  /** Two-letter monogram rendered in the site avatar. */
  initials: string;
  /**
   * Suffix for this site's Google env vars — `TDM` reads `GA4_PROPERTY_TDM`
   * and `GSC_PROPERTY_TDM`.
   *
   * Explicit rather than derived from `id` because the two answer to different
   * owners: `id` is the URL slug (`/site/doc-mirror`) and changing it is a
   * routing decision, while this is a deployment secret name that lives in
   * Vercel/CI. Renaming a route should never force an env var rename in
   * production, and vice versa.
   */
  envKey: string;
  /** Disabled sites are hidden from the entire dashboard. */
  enabled: boolean;
}

/**
 * A property joined with its Google bindings, assembled server-side by
 * `lib/websites.server.ts`. Never constructed on the client.
 */
export interface Website extends WebsiteConfig {
  /** GA4 numeric property id, e.g. `"493812345"`. Empty when unconfigured. */
  analyticsPropertyId: string;
  /** GSC property, e.g. `sc-domain:example.com` or `https://example.com/`. */
  searchConsoleProperty: string;
}

/**
 * The client-facing shape of a property.
 *
 * Deliberately a subset of `Website`: it carries no Google bindings, so it is
 * safe to serialise into an API response. `lastSync` is runtime state (when the
 * data was actually fetched), not configuration, which is why it lives here and
 * not on `Website`.
 */
export interface Site {
  id: string;
  name: string;
  domain: string;
  url: string;
  favicon: string;
  /** Two-letter monogram rendered in the site avatar. */
  initials: string;
  /** ISO timestamp of the last successful data sync. */
  lastSync: string;
}

/** A single measure with its previous-period counterpart. */
export interface MetricValue {
  current: number;
  previous: number;
  /** Signed fractional change vs. previous period. 0.12 === +12%. */
  change: number;
  /** Sparkline series for the current period. */
  spark: number[];
}

export type MetricKey =
  | "clicks"
  | "impressions"
  | "ctr"
  | "position"
  | "users"
  | "newUsers"
  | "sessions"
  | "engagedSessions"
  | "views"
  | "avgEngagementTime";

export type Metrics = Record<MetricKey, MetricValue>;

/** Everything the portfolio grid + summary table needs for one site. */
export interface PortfolioRow {
  site: Site;
  metrics: Metrics;
  /** Week-over-week change in clicks — the headline "is it growing?" number. */
  weeklyGrowth: number;
}

export interface TimeseriesPoint {
  /** ISO date (yyyy-MM-dd). */
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  users: number;
  sessions: number;
  /** Same-shaped value from the previous period, aligned to this index. */
  prevClicks: number;
  prevImpressions: number;
  prevUsers: number;
  prevSessions: number;
  prevCtr: number;
  prevPosition: number;
}

/**
 * Previous-period metrics for a single query or page.
 *
 * Search Console is already queried for both windows in order to compute
 * `trend`, so carrying the rest of the previous row costs nothing — no extra
 * request, no extra quota. It is what makes regression detection possible.
 *
 * `prevImpressions === 0` is the canonical "this row did not exist in the
 * previous window" test. Do not test `prevPosition` for absence: position is
 * lower-is-better, so an absent row's `0` reads as a perfect rank.
 */
export interface PreviousRowMetrics {
  prevClicks: number;
  prevImpressions: number;
  prevCtr: number;
  /** `0` when the row was absent last period — always gate on `prevImpressions`. */
  prevPosition: number;
  /**
   * The row genuinely appeared for the first time this period.
   *
   * Deliberately *not* the same as `prevImpressions === 0`. Search Console
   * returns a capped number of rows per request, so a row missing from the
   * previous window may simply have fallen below that cap rather than being
   * new. Only the provider knows whether the previous response was truncated,
   * so only the provider can tell the two apart — consumers must use this flag
   * rather than re-deriving it.
   */
  isNew: boolean;
}

export interface QueryRow extends PreviousRowMetrics {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Signed fractional change in clicks vs. previous period. */
  trend: number;
  /** 7-point sparkline for the keyword trend cell. */
  spark: number[];
}

export interface PageRow extends PreviousRowMetrics {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  users: number;
  sessions: number;
  /** Seconds. */
  avgEngagementTime: number;
  trend: number;
}

/* -------------------------------------------------------------------------- */
/*  Search Console intelligence                                                */
/* -------------------------------------------------------------------------- */

/**
 * The comparison window for keyword movement.
 *
 * Independent of the page's date range on purpose: "what moved yesterday" and
 * "what moved this month" are different questions, and tying movement to the
 * range picker would make the fast one unavailable whenever you were looking at
 * a long window.
 */
export type MovementWindow = "day" | "week" | "month";

/** The four buckets the headline counts. Every one of them is a change. */
export type MovementKind = "improved" | "dropped" | "new" | "lost";

/**
 * How a row is classified, including the absence of movement.
 *
 * `stable` is every keyword that ranked in the current window without earning a
 * bucket — it held its position, or it is too quiet to judge. Those rows are
 * carried so the table can answer "where is this keyword?" for anything visible
 * in Top Queries. Without them the search box reports "no keywords match" for a
 * term the same page lists a few rows above, which reads as a broken table
 * rather than as a keyword that simply did not move.
 *
 * Deliberately outside `MovementKind`: it is not counted, not badged as a
 * change, and never becomes a Copilot finding.
 */
export type MovementRowKind = MovementKind | "stable";

export interface KeywordMovementRow {
  keyword: string;
  kind: MovementRowKind;
  clicks: number;
  prevClicks: number;
  impressions: number;
  prevImpressions: number;
  ctr: number;
  /** `0` when the keyword no longer ranks (kind === "lost"). */
  position: number;
  /** `0` when the keyword did not rank before (kind === "new"). */
  prevPosition: number;
  /**
   * Signed rank change. Negative means it moved toward position 1, i.e. better.
   * `0` for new and lost rows, where a delta would be meaningless.
   */
  positionDelta: number;
  clickDelta: number;
}

export interface KeywordMovement {
  window: MovementWindow;
  range: DateRange;
  previous: DateRange;
  /** Movers first, then `stable` rows. See `MovementRowKind`. */
  rows: KeywordMovementRow[];
  /** Counts the four movement buckets only — `stable` is not a change. */
  counts: Record<MovementKind, number>;
  /**
   * Either window came back at the API row cap, so "new" and "lost" cannot be
   * proven for the long tail. The UI must disclose this rather than present
   * truncation artefacts as discoveries and disappearances.
   */
  truncated: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Analytics intelligence                                                     */
/* -------------------------------------------------------------------------- */

/** Site-wide engagement quality for one window. */
export interface EngagementSnapshot {
  users: number;
  newUsers: number;
  sessions: number;
  engagedSessions: number;
  views: number;
  bounceRate: number;
  engagementRate: number;
  viewsPerSession: number;
  sessionsPerUser: number;
  /** Total seconds of engagement across all sessions. */
  engagementDuration: number;
}

/** A traffic source — either a channel group or a source/medium pair. */
export interface AcquisitionRow {
  label: string;
  sessions: number;
  users: number;
  engagedSessions: number;
  engagementRate: number;
  keyEvents: number;
  prevSessions: number;
  /** Signed fractional change in sessions. */
  trend: number;
  /** Share of total sessions, 0–1. */
  share: number;
}

export interface ConversionEventRow {
  eventName: string;
  keyEvents: number;
  eventCount: number;
  prevKeyEvents: number;
  trend: number;
}

export interface ConversionSummary {
  keyEvents: number;
  prevKeyEvents: number;
  /** Share of sessions with at least one key event, 0–1. */
  keyEventRate: number;
  revenue: number;
  events: ConversionEventRow[];
  /**
   * The property reports no key events at all.
   *
   * Distinct from "zero conversions this period": it means nothing has been
   * marked as a key event in GA4, so there is nothing to measure. Showing a
   * confident "0 conversions" would misrepresent a configuration gap as a
   * performance result.
   */
  notConfigured: boolean;
}

/**
 * One stage of the aggregate journey funnel.
 *
 * Stages, not a path. The GA4 Data API exposes no page-to-page sequence data —
 * path exploration exists only in the UI and in the unstable v1alpha funnel
 * endpoint — so this narrows users to sessions to engagement to key events
 * rather than pretending to trace routes through the site.
 */
export interface JourneyStage {
  stage: string;
  value: number;
  /** Share of the first stage, 0–1. */
  share: number;
  /** Fraction retained from the previous stage, 0–1. `1` for the first. */
  stepRate: number;
  description: string;
}

/** A page, with the engagement metrics GA4 will report against `pagePath`. */
export interface PagePerformanceRow {
  page: string;
  views: number;
  users: number;
  engagementRate: number;
  bounceRate: number;
  /** Mean seconds of engagement per view. */
  avgEngagementTime: number;
  /** Composite 0–100 used to rank best and worst. */
  score: number;
}

/**
 * A landing page ranked by how often sessions end there without engaging.
 *
 * The closest honest answer to "exit pages": GA4's Data API has no `exits` or
 * `exitRate` metric — both return `INVALID_ARGUMENT` — so this uses bounce rate
 * on session-scoped landing pages, which measures sessions that arrived and
 * left without engaging.
 */
export interface DropOffRow {
  page: string;
  sessions: number;
  bounceRate: number;
  engagementRate: number;
  avgSessionDuration: number;
  /** Sessions estimated to have ended here without engaging. */
  lostSessions: number;
}

export interface AudienceSplitRow {
  label: string;
  users: number;
  sessions: number;
  engagementRate: number;
  share: number;
}

export interface AnalyticsInsights {
  engagement: EngagementSnapshot;
  previousEngagement: EngagementSnapshot;
  channels: AcquisitionRow[];
  sources: AcquisitionRow[];
  conversions: ConversionSummary;
  journey: JourneyStage[];
  pages: PagePerformanceRow[];
  dropOff: DropOffRow[];
  audience: AudienceSplitRow[];
}

/** One row of a Search Console breakdown by country or device. */
export interface SearchBreakdownRow {
  /** Raw dimension value: `ind`, `usa`, `MOBILE`. */
  key: string;
  /** Display name: `India`, `Mobile`. */
  label: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  /** Share of total clicks, 0–1. */
  share: number;
  prevClicks: number;
  /** Signed fractional change in clicks. */
  trend: number;
}

export interface SearchBreakdowns {
  countries: SearchBreakdownRow[];
  devices: SearchBreakdownRow[];
}

export interface BreakdownSlice {
  label: string;
  value: number;
  /** Share of total, 0–1. */
  share: number;
}

/**
 * NOTE: the composed report shapes (`SiteReportData`, `PortfolioData`) and the
 * request/response envelopes live in `services/types.ts`, alongside the service
 * functions that produce them. This file holds only the primitive domain types
 * that both the providers and the UI share.
 */
