import type {
  AnalyticsInsights,
  BreakdownSlice,
  DateRange,
  KeywordMovement,
  Metrics,
  MovementWindow,
  PageRow,
  PortfolioRow,
  QueryRow,
  SearchBreakdowns,
  Site,
  TimeseriesPoint,
} from "@/types";

/**
 * The service layer's public contract.
 *
 * Every dashboard component reads one of these shapes and nothing else. They
 * are deliberately provider-agnostic: the mock provider and the Google provider
 * both produce exactly these, so swapping sources changes no UI type.
 */

/* -------------------------------------------------------------------------- */
/*  Requests                                                                   */
/* -------------------------------------------------------------------------- */

/** The parameters every service function accepts. */
export interface ServiceParams {
  websiteId: string;
  dateRange: DateRange;
  /**
   * When true, responses carry the equal-length preceding window so the UI can
   * render deltas. When false the previous-period fields are still populated
   * (the numbers are cheap) but the UI hides them — keeping the shape stable
   * means no conditional types downstream.
   */
  comparePreviousPeriod: boolean;
  /**
   * Bypass the server cache and re-query Google.
   *
   * Set only by the header's Refresh button. Without it that button would
   * return the cached copy and read as "nothing happened".
   */
  refresh?: boolean;
}

/** Portfolio roll-ups span every site, so they take no `websiteId`. */
export type PortfolioParams = Omit<ServiceParams, "websiteId">;

/* -------------------------------------------------------------------------- */
/*  Responses                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Every response carries its own envelope.
 *
 * `source` and `fetchedAt` make it possible to tell mock data from live data at
 * a glance in the network tab, and `partial` flags a response that succeeded
 * overall but lost one upstream — e.g. Search Console answered and GA4 timed
 * out. Without that flag a half-empty dashboard is indistinguishable from a
 * genuinely quiet week.
 */
export interface ResponseMeta {
  source: DataSourceKind;
  /** ISO timestamp of when the upstream was actually queried. */
  fetchedAt: string;
  range: DateRange;
  /** The compared window, when `comparePreviousPeriod` was requested. */
  previousRange?: DateRange;
  /** Names of upstreams that failed while others succeeded. */
  degraded?: string[];
}

export type DataSourceKind = "mock" | "google";

export interface ServiceResponse<T> {
  data: T;
  meta: ResponseMeta;
}

/** `getOverview` — the metric cards. */
export interface OverviewData {
  site: Site;
  metrics: Metrics;
  /** Week-over-week click growth, independent of the selected range. */
  weeklyGrowth: number;
}

/** `getTraffic` — everything time-shaped, plus the two GA4 breakdowns. */
export interface TrafficData {
  site: Site;
  timeseries: TimeseriesPoint[];
  trafficSources: BreakdownSlice[];
  devices: BreakdownSlice[];
}

/** `getTopQueries` / `getKeywordPerformance` — Search Console query dimension. */
export interface QueriesData {
  site: Site;
  queries: QueryRow[];
}

export interface KeywordMovementData extends KeywordMovement {
  site: Site;
}

export interface SearchBreakdownsData extends SearchBreakdowns {
  site: Site;
}

export interface AnalyticsInsightsData extends AnalyticsInsights {
  site: Site;
}

/** `ServiceParams` plus the movement window, which has its own date arithmetic. */
export interface MovementParams extends ServiceParams {
  window: MovementWindow;
}

/** `getLandingPages` — the GSC page dimension joined with GA4 engagement. */
export interface LandingPagesData {
  site: Site;
  pages: PageRow[];
}

/** `getPortfolio` — every site side by side, plus the weighted roll-up. */
export interface PortfolioData {
  rows: PortfolioRow[];
  totals: Metrics;
}

/** The composed payload behind a single website dashboard. */
export interface SiteReportData {
  site: Site;
  metrics: Metrics;
  timeseries: TimeseriesPoint[];
  queries: QueryRow[];
  pages: PageRow[];
  trafficSources: BreakdownSlice[];
  devices: BreakdownSlice[];
}

/* -------------------------------------------------------------------------- */
/*  Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type ServiceErrorCode =
  | "unknown_website"
  | "not_configured"
  | "upstream_error"
  | "rate_limited"
  | "unauthorized"
  | "invalid_request";

/** The JSON body every Route Handler returns on failure. */
export interface ApiErrorBody {
  error: {
    code: ServiceErrorCode;
    message: string;
    /** Present when the failure is retryable, in seconds. */
    retryAfter?: number;
  };
}

/**
 * Thrown by the service layer; converted to `ApiErrorBody` at the route
 * boundary. Carrying a code (not just a message) is what lets the UI tell
 * "this site isn't connected yet" apart from "Google is down".
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;
  readonly retryAfter?: number;

  constructor(
    code: ServiceErrorCode,
    message: string,
    status = 500,
    retryAfter?: number,
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

export const HTTP_STATUS_BY_CODE: Record<ServiceErrorCode, number> = {
  unknown_website: 404,
  not_configured: 503,
  upstream_error: 502,
  rate_limited: 429,
  unauthorized: 401,
  invalid_request: 400,
};
