import type { DateRange, MovementWindow, RangeKey, Site } from "@/types";
// Type-only, like every other import here — no server code reaches the browser.
import type { TechnicalAudit } from "@/lib/technical/types";
import type { ContentHealthReport } from "@/lib/content/types";
import type { GeoReport } from "@/lib/geo/types";
import type { CompetitorReport } from "@/lib/competitors/types";
import type {
  AnalyticsInsightsData,
  ApiErrorBody,
  KeywordMovementData,
  LandingPagesData,
  OverviewData,
  PortfolioData,
  QueriesData,
  SearchBreakdownsData,
  ServiceErrorCode,
  ServiceResponse,
  SiteReportData,
  TrafficData,
} from "@/services/types";

/**
 * The browser's view of the data layer.
 *
 * This is the *only* module client code fetches through. It knows nothing about
 * Google, mock generators or credentials — just URLs and response shapes. That
 * boundary is what keeps API keys server-side by construction rather than by
 * discipline.
 *
 * Note this file imports only *types* from `@/services`, never values — type
 * imports are erased at compile time, so no server code is pulled into the
 * browser bundle.
 */

/** A failed request, carrying the server's error code so the UI can branch. */
export class ApiError extends Error {
  readonly code: ServiceErrorCode;
  readonly status: number;

  constructor(code: ServiceErrorCode, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }

  /** True when the site simply isn't wired to Google yet. */
  get isNotConfigured(): boolean {
    return this.code === "not_configured";
  }
}

export interface QueryOptions {
  websiteId?: string;
  range: RangeKey;
  dateRange: DateRange;
  comparePreviousPeriod: boolean;
  /** Force a fresh upstream read, bypassing the server cache. */
  refresh?: boolean;
  signal?: AbortSignal;
}

function toSearchParams(options: QueryOptions): string {
  const params = new URLSearchParams();
  if (options.websiteId) params.set("websiteId", options.websiteId);
  params.set("range", options.range);
  // Custom windows need explicit dates; presets are re-derived server-side so
  // the two never disagree about what "last 28 days" means.
  if (options.range === "custom") {
    params.set("from", options.dateRange.from);
    params.set("to", options.dateRange.to);
  }
  if (!options.comparePreviousPeriod) params.set("compare", "0");
  if (options.refresh) params.set("refresh", "1");
  return params.toString();
}

async function request<T>(
  endpoint: string,
  options: QueryOptions,
  /** Endpoint-specific params appended to the shared filter set. */
  extra?: Record<string, string>,
): Promise<ServiceResponse<T>> {
  const query = new URLSearchParams(toSearchParams(options));
  for (const [k, v] of Object.entries(extra ?? {})) query.set(k, v);

  const response = await fetch(`/api/${endpoint}?${query.toString()}`, {
    signal: options.signal,
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    // Prefer the server's structured error; fall back if the body isn't JSON
    // (a proxy 502, say), so the UI still gets something intelligible.
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(
      body?.error.code ?? "upstream_error",
      body?.error.message ?? `Request failed (${response.status}).`,
      response.status,
    );
  }

  return (await response.json()) as ServiceResponse<T>;
}

/* -------------------------------------------------------------------------- */
/*  Endpoints                                                                  */
/* -------------------------------------------------------------------------- */

export const api = {
  getOverview: (o: QueryOptions) => request<OverviewData>("overview", o),
  getTraffic: (o: QueryOptions) => request<TrafficData>("traffic", o),
  getTopQueries: (o: QueryOptions) => request<QueriesData>("top-queries", o),
  getKeywordPerformance: (o: QueryOptions) =>
    request<QueriesData>("keyword-performance", o),
  getLandingPages: (o: QueryOptions) => request<LandingPagesData>("landing-pages", o),
  getSiteReport: (o: QueryOptions) => request<SiteReportData>("site-report", o),
  getPortfolio: (o: QueryOptions) => request<PortfolioData>("portfolio", o),
  getSearchBreakdowns: (o: QueryOptions) =>
    request<SearchBreakdownsData>("search-breakdowns", o),
  getAnalyticsInsights: (o: QueryOptions) =>
    request<AnalyticsInsightsData>("analytics-insights", o),
  getTechnicalAudit: (o: QueryOptions) => request<TechnicalAudit>("technical-audit", o),
  getContentHealth: (o: QueryOptions) => request<ContentHealthReport>("content-health", o),
  getGeoReport: (o: QueryOptions) => request<GeoReport>("geo", o),
  getCompetitorReport: (o: QueryOptions & { competitors: string[] }) =>
    request<CompetitorReport>("competitors", o, { competitors: o.competitors.join(",") }),

  /**
   * Keyword movement. The window is its own parameter because movement is
   * anchored to a fixed recent period rather than the page's date range.
   */
  getKeywordMovement: (o: QueryOptions & { window: MovementWindow }) =>
    request<KeywordMovementData>(`keyword-movement`, o, { window: o.window }),

  async listWebsites(
    signal?: AbortSignal,
  ): Promise<{ sites: Site[]; source: "mock" | "google" }> {
    const response = await fetch("/api/websites", { signal });
    if (!response.ok) throw new ApiError("upstream_error", "Couldn't load websites.", response.status);
    const body = (await response.json()) as { data: Site[]; source: "mock" | "google" };
    return { sites: body.data, source: body.source };
  },
};

export type {
  AnalyticsInsightsData,
  KeywordMovementData,
  LandingPagesData,
  OverviewData,
  PortfolioData,
  QueriesData,
  SearchBreakdownsData,
  ServiceResponse,
  SiteReportData,
  TrafficData,
};
