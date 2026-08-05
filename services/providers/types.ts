import type {
  AnalyticsInsights,
  DateRange,
  KeywordMovement,
  SearchBreakdowns,
  Website,
} from "@/types";
import type {
  LandingPagesData,
  OverviewData,
  QueriesData,
  TrafficData,
} from "../types";

/**
 * What a data provider must implement.
 *
 * Two providers exist: `mock` (deterministic generator) and `google` (GA4 +
 * Search Console). The service layer above talks only to this interface, so
 * adding a third source — a warehouse, a cache, a CSV import — means writing
 * one file and registering it, with no change anywhere else.
 *
 * Every method receives the resolved `Website` rather than an id: the provider
 * needs the Google bindings, and resolving the id once at the service layer
 * means providers never repeat the lookup or the not-found handling.
 *
 * `previous` is always supplied. Providers compute both windows even when the
 * UI has comparison switched off — for the mock that's free, and for Google the
 * two windows go out in one batched request anyway, so branching on it would
 * add code without saving a round trip.
 */
export interface DataProvider {
  readonly kind: "mock" | "google";

  getOverview(ctx: ProviderContext): Promise<Omit<OverviewData, "site">>;
  getTraffic(ctx: ProviderContext): Promise<Omit<TrafficData, "site">>;
  getQueries(ctx: ProviderContext): Promise<Omit<QueriesData, "site">>;
  getLandingPages(ctx: ProviderContext): Promise<Omit<LandingPagesData, "site">>;

  /**
   * Keyword movement between `ctx.range` and `ctx.previous`.
   *
   * The caller sets those two windows from the movement selector, not from the
   * page's date range — so this method needs no window parameter of its own and
   * stays a plain two-window comparison like every other method here.
   */
  getKeywordMovement(
    ctx: ProviderContext,
  ): Promise<Pick<KeywordMovement, "rows" | "counts" | "truncated">>;

  /** Search Console clicks broken down by country and by device. */
  getSearchBreakdowns(ctx: ProviderContext): Promise<SearchBreakdowns>;

  /**
   * Deep Google Analytics reporting: engagement, acquisition, conversions,
   * the aggregate journey funnel, page performance and drop-off.
   *
   * Kept separate from `getTraffic` because it is much heavier — a dozen GA4
   * reports — and only the Analytics page needs it. Folding it in would slow
   * every other page that reads a site report.
   */
  getAnalyticsInsights(ctx: ProviderContext): Promise<AnalyticsInsights>;

  /** ISO timestamp of the last successful sync for this property. */
  lastSync(site: Website): Promise<string>;
}

export interface ProviderContext {
  site: Website;
  range: DateRange;
  previous: DateRange;
}
