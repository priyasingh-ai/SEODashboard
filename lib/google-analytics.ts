import "server-only";

import { BetaAnalyticsDataClient } from "@google-analytics/data";
import { googleCredentials } from "./env";
import { mapGoogleError } from "./google-errors";
import { ServiceError } from "@/services/types";
import type { DateRange } from "@/types";

/**
 * Google Analytics 4 Data API client.
 *
 * Server-only — `server-only` makes importing this from a client component a
 * build error, so a service-account key can never reach the browser.
 *
 * ## Setup
 *
 * 1. Share each GA4 property with the service-account email (Viewer is enough).
 * 2. Set `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY`, the `GA4_PROPERTY_*`
 *    ids, and `DATA_SOURCE=google`.
 *
 * See the README for the full walkthrough.
 */

/** Mirrors the GA4 `runReport` request, narrowed to what this dashboard uses. */
export interface Ga4ReportRequest {
  propertyId: string;
  dateRanges: DateRange[];
  /** e.g. `["date"]`, `["sessionDefaultChannelGroup"]`, `["deviceCategory"]`. */
  dimensions: string[];
  /** e.g. `["totalUsers", "sessions", "screenPageViews"]`. */
  metrics: string[];
  limit?: number;
  orderBy?: { metric: string; desc?: boolean };
}

/**
 * A decoded GA4 row.
 *
 * GA4 returns every value as a string; the decoder coerces metrics to numbers
 * once here so no caller has to remember to parse them.
 */
export interface Ga4Row {
  dimensions: string[];
  metrics: number[];
}

export interface Ga4Report {
  rows: Ga4Row[];
  /** Row count before `limit` was applied — GA4 reports this separately. */
  rowCount: number;
}

/** The GA4 metric names this dashboard reads, in one place. */
export const GA4_METRICS = {
  users: "totalUsers",
  newUsers: "newUsers",
  sessions: "sessions",
  engagedSessions: "engagedSessions",
  views: "screenPageViews",
  avgEngagementTime: "averageSessionDuration",
} as const;

/**
 * Metrics used only by the analytics-insights report.
 *
 * Deliberately a separate object from `GA4_METRICS`. That one is consumed by
 * `Object.values(...)` and destructured **positionally** in `ga4Totals`, so
 * inserting a name into it silently mis-assigns every metric after the
 * insertion point — with no type error. Keeping the new names here means the
 * existing overview path cannot break.
 */
export const GA4_INSIGHT_METRICS = {
  bounceRate: "bounceRate",
  engagementRate: "engagementRate",
  viewsPerSession: "screenPageViewsPerSession",
  sessionsPerUser: "sessionsPerUser",
  engagementDuration: "userEngagementDuration",
  /**
   * Google renamed "conversions" to "key events" in 2024. `conversions` still
   * resolves as a deprecated alias but is on a removal clock, so this uses the
   * current name.
   */
  keyEvents: "keyEvents",
  keyEventRate: "sessionKeyEventRate",
  revenue: "totalRevenue",
  eventCount: "eventCount",
  avgSessionDuration: "averageSessionDuration",
} as const;

/**
 * Hard limit from the API: a single request may carry at most 10 metrics.
 * Exceeding it fails with `INVALID_ARGUMENT`, so wide reports are split.
 */
export const GA4_MAX_METRICS_PER_REQUEST = 10;

export const GA4_DIMENSIONS = {
  date: "date",
  channel: "sessionDefaultChannelGroup",
  device: "deviceCategory",
  landingPage: "landingPagePlusQueryString",
  sourceMedium: "sessionSourceMedium",
  pagePath: "pagePath",
  eventName: "eventName",
  newVsReturning: "newVsReturning",
} as const;

/**
 * The client is cached across invocations.
 *
 * It holds a JWT that's valid for an hour; rebuilding it per request would mean
 * a fresh token exchange with Google on every single API call — roughly
 * doubling latency and burning quota for nothing.
 */
let cachedClient: BetaAnalyticsDataClient | undefined;

function getClient(): BetaAnalyticsDataClient {
  const credentials = googleCredentials();
  if (!credentials) {
    throw new ServiceError(
      "not_configured",
      "Google Analytics credentials are not set. Add GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, or run with DATA_SOURCE=mock.",
      503,
    );
  }

  if (!cachedClient) {
    cachedClient = new BetaAnalyticsDataClient({
      credentials: {
        client_email: credentials.clientEmail,
        private_key: credentials.privateKey,
      },
      projectId: credentials.projectId,
    });
  }
  return cachedClient;
}

/** Execute a GA4 report. */
export async function runReport(request: Ga4ReportRequest): Promise<Ga4Report> {
  if (!request.propertyId) {
    throw new ServiceError(
      "not_configured",
      "This website has no GA4 property id. Set the matching GA4_PROPERTY_* environment variable.",
      503,
    );
  }

  try {
    const [response] = await getClient().runReport({
      property: `properties/${request.propertyId}`,
      dateRanges: request.dateRanges.map((r) => ({ startDate: r.from, endDate: r.to })),
      dimensions: request.dimensions.map((name) => ({ name })),
      metrics: request.metrics.map((name) => ({ name })),
      limit: request.limit,
      ...(request.orderBy
        ? {
            orderBys: [
              {
                metric: { metricName: request.orderBy.metric },
                desc: request.orderBy.desc ?? true,
              },
            ],
          }
        : {}),
    });

    return decodeReport(response);
  } catch (error) {
    throw mapGoogleError(error, { api: "GA4", target: request.propertyId });
  }
}

/**
 * Convert a raw GA4 response into `Ga4Report`.
 *
 * Kept separate from `runReport` so it is unit-testable against a recorded
 * fixture without any network or credentials.
 */
export function decodeReport(response: {
  // Every level is nullable because the GA4 SDK genuinely returns `null` for
  // empty collections rather than omitting them — a property with no traffic in
  // the window comes back as `rows: null`, not `rows: []`.
  rows?:
    | {
        dimensionValues?: { value?: string | null }[] | null;
        metricValues?: { value?: string | null }[] | null;
      }[]
    | null;
  rowCount?: number | null;
}): Ga4Report {
  const rows = (response.rows ?? []).map((row) => ({
    dimensions: (row.dimensionValues ?? []).map((d) => d.value ?? ""),
    metrics: (row.metricValues ?? []).map((m) => Number(m.value ?? 0)),
  }));
  return { rows, rowCount: response.rowCount ?? rows.length };
}

/** GA4 returns dates as `YYYYMMDD`; the rest of the app speaks `YYYY-MM-DD`. */
export function parseGa4Date(compact: string): string {
  if (!/^\d{8}$/.test(compact)) return compact;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}
