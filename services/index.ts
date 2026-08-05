import "server-only";

import type { Site, Website } from "@/types";
import { movementRange, previousRange } from "@/lib/date-range";
import { dataSourceKind } from "@/lib/env";
import { cached } from "@/lib/cache";
import {
  activeWebsitesWithBindings,
  requireWebsiteWithBindings,
} from "@/lib/websites.server";
import { runTechnicalScan } from "@/lib/technical/scan";
import type { TechnicalAudit } from "@/lib/technical/types";
import { runContentScan } from "@/lib/content/scan";
import type { ContentHealthReport } from "@/lib/content/types";
import { runGeoScan } from "@/lib/geo/scan";
import type { GeoReport } from "@/lib/geo/types";
import { runCompetitorScan } from "@/lib/competitors/scan";
import type { CompetitorReport } from "@/lib/competitors/types";
import { getProvider, type ProviderContext } from "./providers";
import { sumMetrics } from "./providers/mock/generate";
import {
  ServiceError,
  type AnalyticsInsightsData,
  type KeywordMovementData,
  type LandingPagesData,
  type MovementParams,
  type OverviewData,
  type SearchBreakdownsData,
  type PortfolioData,
  type PortfolioParams,
  type QueriesData,
  type ResponseMeta,
  type ServiceParams,
  type ServiceResponse,
  type SiteReportData,
  type TrafficData,
} from "./types";

/**
 * The service layer — the only thing Route Handlers call.
 *
 * Every function takes `{ websiteId, dateRange, comparePreviousPeriod }`,
 * resolves the site once, delegates to the active provider, and wraps the
 * result in a `ServiceResponse` envelope. Providers never build envelopes and
 * never resolve website ids; that shared work lives here so both providers stay
 * focused on fetching.
 */

/** Cache key for a request — everything that changes the answer. */
function cacheKey(fn: string, params: ServiceParams | PortfolioParams): string {
  const site = "websiteId" in params ? params.websiteId : "all";
  return `${fn}:${site}:${params.dateRange.from}:${params.dateRange.to}:${dataSourceKind()}`;
}

/**
 * Keyword movement over its own fixed window.
 *
 * The one service function whose windows do **not** come from the request's
 * date range — `movementRange` derives them from the reporting anchor instead,
 * so "what moved yesterday" stays answerable while the page shows 12 months.
 * The cache key therefore keys on the window, not on `dateRange`.
 */
export async function getKeywordMovement(
  params: MovementParams,
): Promise<ServiceResponse<KeywordMovementData>> {
  const { range, previous } = movementRange(params.window);

  return cached(
    `getKeywordMovement:${params.websiteId}:${params.window}:${range.to}:${dataSourceKind()}`,
    async () => {
      const site = resolveSite(params.websiteId);
      const [data, resolved] = await Promise.all([
        getProvider().getKeywordMovement({ site, range, previous }),
        toSite(site),
      ]);

      return {
        data: { site: resolved, window: params.window, range, previous, ...data },
        // The envelope still reports the page's range so the header and the
        // export filename stay consistent with the rest of the dashboard.
        meta: meta(params),
      };
    },
    { bypass: params.refresh },
  );
}

/**
 * Deep Analytics reporting for the Analytics page.
 *
 * Its own cache entry rather than part of `getSiteReport`: this fans out to a
 * dozen GA4 reports, and folding it into the shared report would make every
 * page in the app wait for data only one of them uses.
 */
export async function getAnalyticsInsights(
  params: ServiceParams,
): Promise<ServiceResponse<AnalyticsInsightsData>> {
  return cached(
    cacheKey("getAnalyticsInsights", params),
    async () => {
      const ctx = await context(params.websiteId, params);
      const [data, site] = await Promise.all([
        getProvider().getAnalyticsInsights(ctx),
        toSite(ctx.site),
      ]);
      return { data: { site, ...data }, meta: meta(params) };
    },
    { bypass: params.refresh },
  );
}

/**
 * Technical SEO audit.
 *
 * Cached far longer than the analytics reports and never refreshed implicitly:
 * this one fetches the customer's live pages and spends Search Console's
 * URL Inspection quota, so it runs only when somebody asks for it.
 */
export async function getTechnicalAudit(
  params: ServiceParams,
): Promise<ServiceResponse<TechnicalAudit>> {
  return cached(
    cacheKey("getTechnicalAudit", params),
    async () => {
      const website = resolveSite(params.websiteId);
      const [site, pages] = await Promise.all([
        toSite(website),
        getLandingPages(params),
      ]);

      const audit = await runTechnicalScan({
        site,
        website,
        // Ranked by clicks, so the sample is the part of the site that earns
        // traffic rather than whatever a crawler happens to reach first.
        topPages: pages.data.pages.map((p) => p.page),
      });

      return { data: audit, meta: meta(params) };
    },
    { bypass: params.refresh, ttlSeconds: TECHNICAL_AUDIT_TTL_SECONDS },
  );
}

/**
 * One hour.
 *
 * Technical configuration changes on the timescale of deploys, not minutes, and
 * every miss costs the customer's server a burst of requests plus a slice of a
 * 2,000/day inspection quota.
 */
const TECHNICAL_AUDIT_TTL_SECONDS = 3600;

/**
 * Content health.
 *
 * Same contract as the technical audit — bounded, on demand, long-cached —
 * because it too fetches live pages and spends URL Inspection quota.
 */
export async function getContentHealth(
  params: ServiceParams,
): Promise<ServiceResponse<ContentHealthReport>> {
  return cached(
    cacheKey("getContentHealth", params),
    async () => {
      const website = resolveSite(params.websiteId);
      const [site, landing] = await Promise.all([toSite(website), getLandingPages(params)]);

      const report = await runContentScan({
        site,
        website,
        pages: landing.data.pages,
        range: params.dateRange,
      });

      return { data: report, meta: meta(params) };
    },
    { bypass: params.refresh, ttlSeconds: TECHNICAL_AUDIT_TTL_SECONDS },
  );
}

/**
 * GEO monitoring.
 *
 * On demand and long-cached like the other scans, with one extra reason: when
 * AI provider keys are configured, every run bills real API calls to the key
 * owner. Nothing here may fire implicitly.
 */
export async function getGeoReport(
  params: ServiceParams,
): Promise<ServiceResponse<GeoReport>> {
  return cached(
    cacheKey("getGeoReport", params),
    async () => {
      const website = resolveSite(params.websiteId);
      const [site, landing, queries] = await Promise.all([
        toSite(website),
        getLandingPages(params),
        getTopQueries(params),
      ]);

      const report = await runGeoScan({
        site,
        website,
        pages: landing.data.pages.map((p) => p.page),
        queries: queries.data.queries,
        range: params.dateRange,
      });

      return { data: report, meta: meta(params) };
    },
    { bypass: params.refresh, ttlSeconds: TECHNICAL_AUDIT_TTL_SECONDS },
  );
}

/**
 * Competitor intelligence.
 *
 * `competitors` is part of the cache key: changing the comparison set must
 * produce a new scan rather than serving the previous set's results.
 */
export async function getCompetitorReport(
  params: ServiceParams & { competitors: string[] },
): Promise<ServiceResponse<CompetitorReport>> {
  const key = `${cacheKey("getCompetitorReport", params)}:${[...params.competitors].sort().join(",")}`;

  return cached(
    key,
    async () => {
      const website = resolveSite(params.websiteId);
      const [site, landing, queries] = await Promise.all([
        toSite(website),
        getLandingPages(params),
        getTopQueries(params),
      ]);

      const report = await runCompetitorScan({
        site,
        competitorDomains: params.competitors,
        ownPaths: landing.data.pages.map((p) => p.page),
        queries: queries.data.queries,
      });

      return { data: report, meta: meta(params) };
    },
    { bypass: params.refresh, ttlSeconds: TECHNICAL_AUDIT_TTL_SECONDS },
  );
}

export async function getSearchBreakdowns(
  params: ServiceParams,
): Promise<ServiceResponse<SearchBreakdownsData>> {
  return cached(
    cacheKey("getSearchBreakdowns", params),
    async () => {
      const ctx = await context(params.websiteId, params);
      const [data, site] = await Promise.all([
        getProvider().getSearchBreakdowns(ctx),
        toSite(ctx.site),
      ]);
      return { data: { site, ...data }, meta: meta(params) };
    },
    { bypass: params.refresh },
  );
}

/** Resolve the site + both windows once per request. */
async function context(websiteId: string, params: ServiceParams) {
  const site = resolveSite(websiteId);
  const ctx: ProviderContext = {
    site,
    range: params.dateRange,
    previous: previousRange(params.dateRange),
  };
  return ctx;
}

function resolveSite(websiteId: string): Website {
  // Throws a typed `unknown_website` / `not_configured` ServiceError, which the
  // route layer maps to the right status code.
  return requireWebsiteWithBindings(websiteId);
}

/** The client-facing projection of a website — no Google bindings. */
async function toSite(website: Website): Promise<Site> {
  return {
    id: website.id,
    name: website.name,
    domain: website.domain,
    url: website.url,
    favicon: website.favicon,
    initials: website.initials,
    lastSync: await getProvider().lastSync(website),
  };
}

function meta(params: ServiceParams | PortfolioParams, degraded?: string[]): ResponseMeta {
  return {
    source: dataSourceKind(),
    fetchedAt: new Date().toISOString(),
    range: params.dateRange,
    previousRange: params.comparePreviousPeriod
      ? previousRange(params.dateRange)
      : undefined,
    degraded: degraded?.length ? degraded : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*  The five core functions                                                    */
/* -------------------------------------------------------------------------- */

/** Overview metrics — the ten cards at the top of a dashboard. */
export async function getOverview(
  params: ServiceParams,
): Promise<ServiceResponse<OverviewData>> {
  return cached(
    cacheKey("getOverview", params),
    async () => {
      const ctx = await context(params.websiteId, params);
      const [data, site] = await Promise.all([
        getProvider().getOverview(ctx),
        toSite(ctx.site),
      ]);
      return { data: { site, ...data }, meta: meta(params) };
    },
    { bypass: params.refresh },
  );
}

/** Time series plus the traffic-source and device breakdowns. */
export async function getTraffic(
  params: ServiceParams,
): Promise<ServiceResponse<TrafficData>> {
  return cached(
    cacheKey("getTraffic", params),
    async () => {
      const ctx = await context(params.websiteId, params);
      const [data, site] = await Promise.all([
        getProvider().getTraffic(ctx),
        toSite(ctx.site),
      ]);
      return { data: { site, ...data }, meta: meta(params) };
    },
    { bypass: params.refresh },
  );
}

/** Search Console query dimension, ranked by clicks. */
export async function getTopQueries(
  params: ServiceParams,
): Promise<ServiceResponse<QueriesData>> {
  return cached(
    cacheKey("getTopQueries", params),
    async () => {
      const ctx = await context(params.websiteId, params);
      const [data, site] = await Promise.all([
        getProvider().getQueries(ctx),
        toSite(ctx.site),
      ]);
      return { data: { site, ...data }, meta: meta(params) };
    },
    { bypass: params.refresh },
  );
}

/**
 * Keyword performance.
 *
 * Same upstream dimension as `getTopQueries` — the distinction is intent, not
 * data: the Keywords page sorts, searches and paginates the full set, while
 * "top queries" is the truncated card on a dashboard. Kept as separate exports
 * so the two can diverge (per-keyword history, position buckets) without a
 * caller change.
 */
export async function getKeywordPerformance(
  params: ServiceParams,
): Promise<ServiceResponse<QueriesData>> {
  return getTopQueries(params);
}

/** Landing pages — Search Console joined with GA4 engagement, per page. */
export async function getLandingPages(
  params: ServiceParams,
): Promise<ServiceResponse<LandingPagesData>> {
  return cached(
    cacheKey("getLandingPages", params),
    async () => {
      const ctx = await context(params.websiteId, params);
      const [data, site] = await Promise.all([
        getProvider().getLandingPages(ctx),
        toSite(ctx.site),
      ]);
      return { data: { site, ...data }, meta: meta(params) };
    },
    { bypass: params.refresh },
  );
}

/* -------------------------------------------------------------------------- */
/*  Composed views                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The whole portfolio.
 *
 * Sites are fetched concurrently — four sequential round trips would make the
 * home page four times slower than it needs to be. One site failing does not
 * fail the page: it drops out of the results and is reported in `meta.degraded`,
 * so three healthy sites still render.
 */
export async function getPortfolio(
  params: PortfolioParams,
): Promise<ServiceResponse<PortfolioData>> {
  // Resolved once — the `degraded` mapping below indexes into the same array,
  // so re-reading it would risk the two lists disagreeing.
  const websites = activeWebsitesWithBindings();

  const settled = await Promise.allSettled(
    websites.map((website) =>
      getOverview({ ...params, websiteId: website.id }).then((r) => r.data),
    ),
  );

  const rows = settled
    .filter(
      (r): r is PromiseFulfilledResult<OverviewData> => r.status === "fulfilled",
    )
    .map((r) => ({
      site: r.value.site,
      metrics: r.value.metrics,
      weeklyGrowth: r.value.weeklyGrowth,
    }));

  const degraded = settled
    .map((r, i) => (r.status === "rejected" ? websites[i].name : null))
    .filter((n): n is string => n !== null);

  if (rows.length === 0) {
    const first = settled.find((r) => r.status === "rejected");
    const reason = first && "reason" in first ? first.reason : undefined;
    if (reason instanceof ServiceError) throw reason;
    throw new ServiceError(
      "upstream_error",
      "No website returned data for this period.",
      502,
    );
  }

  return {
    data: { rows, totals: sumMetrics(rows.map((r) => r.metrics)) },
    meta: meta(params, degraded),
  };
}

/**
 * Everything one website dashboard needs, in a single call.
 *
 * The four sections are independent upstream requests, so they run concurrently
 * rather than serially.
 */
export async function getSiteReport(
  params: ServiceParams,
): Promise<ServiceResponse<SiteReportData>> {
  // Composed from the four cached section functions rather than calling the
  // provider directly. That way a visit here warms the same cache entries the
  // Landing Pages / Keywords / Analytics pages read, so navigating between them
  // costs nothing — and vice versa. Calling the provider straight through would
  // duplicate every upstream request.
  const [overview, traffic, queries, pages] = await Promise.all([
    getOverview(params),
    getTraffic(params),
    getTopQueries(params),
    getLandingPages(params),
  ]);

  return {
    data: {
      site: overview.data.site,
      metrics: overview.data.metrics,
      timeseries: traffic.data.timeseries,
      queries: queries.data.queries,
      pages: pages.data.pages,
      trafficSources: traffic.data.trafficSources,
      devices: traffic.data.devices,
    },
    meta: meta(params),
  };
}

/** The configured properties, as the client sees them. */
export async function listWebsites(): Promise<Site[]> {
  return Promise.all(activeWebsitesWithBindings().map(toSite));
}

export * from "./types";
