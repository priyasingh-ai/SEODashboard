"use client";

import { api, type QueryOptions } from "@/lib/api";
import type {
  AnalyticsInsightsData,
  KeywordMovementData,
  LandingPagesData,
  OverviewData,
  PortfolioData,
  QueriesData,
  SearchBreakdownsData,
  SiteReportData,
  TrafficData,
} from "@/lib/api";
import type { MovementWindow } from "@/types";
import { useAsync, type AsyncState } from "./use-async";
import { useFilters } from "./use-filters";

/**
 * The hooks every page reads from.
 *
 * Each one turns the current filter state into a request against the service
 * layer's Route Handlers. No component builds a URL, and none of them knows
 * whether the numbers came from the mock generator or from Google — swapping
 * `DATA_SOURCE` changes nothing here or above.
 */

/** Current filters as API query options, plus the cache key they imply. */
function useQueryOptions(websiteId?: string): { options: QueryOptions; key: string } {
  const { siteId, range, dateRange, compare, anchorResolved } = useFilters();
  const id = websiteId ?? siteId;

  return {
    options: {
      websiteId: id,
      range,
      dateRange,
      comparePreviousPeriod: compare,
    },
    // Empty until the reporting window is known, which `useAsync` reads as
    // "nothing to ask for yet". On a first visit the window would otherwise be
    // guessed, fetched against, and immediately superseded — every hook on the
    // page paying for two round trips to render once.
    //
    // `compare` is part of the key because it changes the response envelope.
    key: anchorResolved
      ? `${id}:${range}:${dateRange.from}:${dateRange.to}:${compare ? 1 : 0}`
      : "",
  };
}

/** A hook's own cache key, or "" while `useQueryOptions` has nothing to key on. */
function scoped(prefix: string, key: string): string {
  return key ? `${prefix}:${key}` : "";
}

export function usePortfolio(): AsyncState<PortfolioData> {
  const { options, key } = useQueryOptions();
  return useAsync(scoped("portfolio", key), async (isRefresh, signal) => (await api.getPortfolio({ ...options, refresh: isRefresh, signal })).data);
}

export function useSiteReport(websiteId?: string): AsyncState<SiteReportData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("site-report", key), async (isRefresh, signal) => (await api.getSiteReport({ ...options, refresh: isRefresh, signal })).data);
}

export function useOverview(websiteId?: string): AsyncState<OverviewData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("overview", key), async (isRefresh, signal) => (await api.getOverview({ ...options, refresh: isRefresh, signal })).data);
}

export function useTraffic(websiteId?: string): AsyncState<TrafficData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("traffic", key), async (isRefresh, signal) => (await api.getTraffic({ ...options, refresh: isRefresh, signal })).data);
}

export function useTopQueries(websiteId?: string): AsyncState<QueriesData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("top-queries", key), async (isRefresh, signal) => (await api.getTopQueries({ ...options, refresh: isRefresh, signal })).data);
}

export function useKeywordPerformance(websiteId?: string): AsyncState<QueriesData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("keyword-performance", key),
    async (isRefresh, signal) => (await api.getKeywordPerformance({ ...options, refresh: isRefresh, signal })).data,
  );
}

export function useAnalyticsInsights(websiteId?: string): AsyncState<AnalyticsInsightsData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("analytics-insights", key),
    async (isRefresh, signal) => (await api.getAnalyticsInsights({ ...options, refresh: isRefresh, signal })).data,
  );
}

export function useSearchBreakdowns(websiteId?: string): AsyncState<SearchBreakdownsData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("search-breakdowns", key),
    async (isRefresh, signal) => (await api.getSearchBreakdowns({ ...options, refresh: isRefresh, signal })).data,
  );
}

/**
 * Keyword movement for a fixed recent window.
 *
 * The cache key intentionally omits the page's date range — movement is
 * anchored to the reporting anchor, so changing the range picker must not
 * refetch it or invalidate what is already on screen.
 */
export function useKeywordMovement(
  window: MovementWindow,
  websiteId?: string,
): AsyncState<KeywordMovementData> {
  const { options } = useQueryOptions(websiteId);
  const id = websiteId ?? options.websiteId;

  return useAsync(
    `keyword-movement:${id}:${window}`,
    async (isRefresh, signal) =>
      (await api.getKeywordMovement({ ...options, window, refresh: isRefresh, signal })).data,
  );
}

export function useLandingPages(websiteId?: string): AsyncState<LandingPagesData> {
  const { options, key } = useQueryOptions(websiteId);
  return useAsync(scoped("landing-pages", key),
    async (isRefresh, signal) => (await api.getLandingPages({ ...options, refresh: isRefresh, signal })).data,
  );
}
