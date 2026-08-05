import type { Website } from "@/types";
import { reportingAnchor, parseISODate } from "@/lib/date-range";
import { ServiceError } from "../../types";
import type { DataProvider, ProviderContext } from "../types";
import { getProfile } from "./profiles";
import { classifyMovement } from "../movement";
import {
  buildAnalyticsInsights,
  buildDevices,
  buildMetrics,
  buildMovementRows,
  buildPages,
  buildQueries,
  buildSearchBreakdowns,
  buildTimeseries,
  buildTrafficSources,
  buildWeeklyGrowth,
} from "./generate";

/**
 * Row cap handed to the movement classifier.
 *
 * Far above any mock keyword list, so mock data is never treated as truncated
 * and "new"/"lost" are always provable — the generator controls presence
 * directly, so there is no real cut-off to reason about.
 */
const MOCK_ROW_LIMIT = 10_000;

/**
 * Deterministic mock provider.
 *
 * Generation is pure, so results are memoised per (website, window) and repeat
 * navigation is free. The artificial latency exists so loading skeletons are
 * exercised in development rather than being dead code whose first real run is
 * against a slow Google API in production.
 */

const LATENCY_MS = Number(process.env.MOCK_LATENCY ?? 120);

const cache = new Map<string, unknown>();

function memo<T>(key: string, build: () => T): T {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key) as T;
}

function delay<T>(value: T): Promise<T> {
  if (LATENCY_MS <= 0) return Promise.resolve(value);
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

function profileFor(site: Website) {
  const profile = getProfile(site.id);
  if (!profile) {
    // A site configured in websites.ts with no mock profile would otherwise
    // render as zeros, which reads as "no traffic" rather than "not set up".
    throw new ServiceError(
      "not_configured",
      `No mock traffic profile for "${site.id}". Add one in services/providers/mock/profiles.ts, or set DATA_SOURCE=google.`,
      503,
    );
  }
  return profile;
}

function key(site: Website, ctx: ProviderContext, part: string) {
  return `${part}:${site.id}:${ctx.range.from}_${ctx.range.to}`;
}

export const mockProvider: DataProvider = {
  kind: "mock",

  async getOverview(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "overview"), () => ({
        metrics: buildMetrics(profile, ctx.range, ctx.previous),
        weeklyGrowth: buildWeeklyGrowth(profile),
      })),
    );
  },

  async getTraffic(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "traffic"), () => ({
        timeseries: buildTimeseries(profile, ctx.range, ctx.previous),
        trafficSources: buildTrafficSources(profile, ctx.range),
        devices: buildDevices(profile, ctx.range),
      })),
    );
  },

  async getQueries(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "queries"), () => ({
        queries: buildQueries(profile, ctx.range, ctx.previous),
      })),
    );
  },

  async getLandingPages(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "pages"), () => ({
        pages: buildPages(profile, ctx.range, ctx.previous),
      })),
    );
  },

  async getAnalyticsInsights(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "ga-insights"), () =>
        buildAnalyticsInsights(profile, ctx.range, ctx.previous),
      ),
    );
  },

  async getKeywordMovement(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "movement"), () => {
        const { now, previous } = buildMovementRows(profile, ctx.range, ctx.previous);
        // Same classifier as the live provider — see the note in generate.ts.
        return classifyMovement(now, previous, MOCK_ROW_LIMIT);
      }),
    );
  },

  async getSearchBreakdowns(ctx) {
    const profile = profileFor(ctx.site);
    return delay(
      memo(key(ctx.site, ctx, "breakdowns"), () =>
        buildSearchBreakdowns(profile, ctx.range, ctx.previous),
      ),
    );
  },

  async lastSync(site) {
    const profile = getProfile(site.id);
    // Derived from the fixed anchor, never `Date.now()` — a moving timestamp
    // would differ between the server render and hydration.
    const anchor = parseISODate(reportingAnchor()).getTime() + 8 * 3_600_000;
    const hours = profile?.syncedHoursAgo ?? 3;
    return new Date(anchor - hours * 3_600_000).toISOString();
  },
};
