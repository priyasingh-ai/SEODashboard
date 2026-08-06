import "server-only";

import { google } from "googleapis";
import type { searchconsole_v1 } from "googleapis";
import { googleCredentials } from "./env";
import { mapGoogleError } from "./google-errors";
import { ServiceError } from "@/services/types";
import type { DateRange } from "@/types";

/**
 * Google Search Console API client.
 *
 * Server-only, for the same reason as the GA4 client — see `lib/env.ts`.
 *
 * ## Setup
 *
 * 1. Add the service-account email as a user on each Search Console property.
 * 2. Set `GOOGLE_CLIENT_EMAIL` / `GOOGLE_PRIVATE_KEY`, the `GSC_PROPERTY_*`
 *    values, and `DATA_SOURCE=google`.
 *
 * Two behaviours of this API are worth knowing before you trust the numbers:
 *
 * - **Data lags 2–3 days, and the exact figure moves.** A "last 7 days" window
 *   ending today will have empty or partial tail days. `lib/reporting-anchor.ts`
 *   measures where finalised data actually ends rather than assuming an offset,
 *   and every range is built backwards from that.
 * - **Totals are not the sum of rows.** Search Console anonymises long-tail
 *   queries, so summing the `query` dimension undercounts the true total. Always
 *   read totals from an undimensioned query — which is why `getOverview` does
 *   not derive its numbers from the query table.
 */

export interface GscQueryRequest {
  /** `sc-domain:example.com` or `https://example.com/`. */
  property: string;
  range: DateRange;
  /** e.g. `[]` for totals, `["date"]`, `["query"]`, `["page"]`. */
  dimensions: string[];
  rowLimit?: number;
  startRow?: number;
  /** `web` | `image` | `video` | `news`. Defaults to web. */
  searchType?: "web" | "image" | "video" | "news";
  /**
   * `all` includes fresh (not-yet-finalised) days; `final` omits them.
   *
   * Defaults to `final`, matching both the API's own default and the state the
   * Search Console UI reports from. `all` reaches two days further — 28 Jul
   * against 26 Jul when measured on 29 Jul 2026 — but those two days are
   * provisional, still being revised, and appear on no Search Console screen,
   * so a figure built from them cannot be reconciled against the console.
   *
   * Over the days both states return, the figures are identical, verified
   * across all four properties. This changes only how far the window reaches,
   * never what a given day is worth.
   *
   * Paired with `lib/reporting-anchor.ts`, which ends every range exactly where
   * this state's data ends — it finds that date by asking this endpoint, with
   * this same `final`. Setting one without the other puts the requested window
   * past the available data, and absent days are charted as zero rather than
   * omitted.
   */
  dataState?: "all" | "final";
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  /** Already a 0–1 fraction in the API response. */
  ctr: number;
  position: number;
}

export interface GscReport {
  rows: GscRow[];
}

/**
 * Cached client — the JWT is valid for an hour, so rebuilding it per request
 * would add a token exchange to every call.
 */
let cachedClient: searchconsole_v1.Searchconsole | undefined;

function getClient(): searchconsole_v1.Searchconsole {
  const credentials = googleCredentials();
  if (!credentials) {
    throw new ServiceError(
      "not_configured",
      "Google credentials are not set. Add GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY, or run with DATA_SOURCE=mock.",
      503,
    );
  }

  if (!cachedClient) {
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      // Read-only: this dashboard never writes, and a narrower scope means a
      // leaked token can't submit sitemaps or request re-indexing.
      scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
    });
    cachedClient = google.searchconsole({ version: "v1", auth });
  }
  return cachedClient;
}

/** Execute a Search Console `searchanalytics.query`. */
/**
 * Queries grouped by the page that ranked for them.
 *
 * A two-dimension `["page", "query"]` report. Search Console anonymises more
 * aggressively as dimensions are added, so the result is a sample of the
 * strongest pairings rather than every query every page has ever received —
 * which is what makes it useful for suggestions and useless as a total.
 */
export async function queriesByPage(
  property: string,
  range: DateRange,
  rowLimit = 1000,
): Promise<Map<string, { query: string; clicks: number; impressions: number; position: number }[]>> {
  const { rows } = await searchAnalyticsQuery({
    property,
    range,
    dimensions: ["page", "query"],
    rowLimit,
  });

  const byPage = new Map<string, { query: string; clicks: number; impressions: number; position: number }[]>();
  for (const row of rows) {
    const [page, query] = row.keys;
    if (!page || !query) continue;
    const list = byPage.get(page) ?? [];
    list.push({
      query,
      clicks: row.clicks,
      impressions: row.impressions,
      position: Number(row.position.toFixed(1)),
    });
    byPage.set(page, list);
  }

  for (const list of byPage.values()) list.sort((a, b) => b.impressions - a.impressions);
  return byPage;
}

export interface GscSitemap {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending: boolean;
  isSitemapsIndex: boolean;
  errors: number;
  warnings: number;
  /** Per content type: `web`, `image`, `video`, `news`. */
  contents: { type: string; submitted: number }[];
}

/**
 * Submitted sitemaps for a property.
 *
 * Note the API also returns an `indexed` count per content type, which this
 * deliberately drops: Google stopped populating it years ago and it now reports
 * `0` for every healthy sitemap. Surfacing it would read as "nothing is
 * indexed" on sites that are entirely fine.
 */
export async function listSitemaps(property: string): Promise<GscSitemap[]> {
  if (!property) {
    throw new ServiceError(
      "not_configured",
      "This website has no Search Console property. Set the matching GSC_PROPERTY_* environment variable.",
      503,
    );
  }

  try {
    const response = await getClient().sitemaps.list({ siteUrl: property });
    return (response.data.sitemap ?? []).map((s) => ({
      path: s.path ?? "",
      lastSubmitted: s.lastSubmitted ?? undefined,
      lastDownloaded: s.lastDownloaded ?? undefined,
      isPending: Boolean(s.isPending),
      isSitemapsIndex: Boolean(s.isSitemapsIndex),
      errors: Number(s.errors ?? 0),
      warnings: Number(s.warnings ?? 0),
      contents: (s.contents ?? []).map((c) => ({
        type: c.type ?? "web",
        submitted: Number(c.submitted ?? 0),
      })),
    }));
  } catch (error) {
    throw mapGoogleError(error, { api: "Search Console", target: property });
  }
}

export interface GscUrlInspection {
  url: string;
  verdict: string;
  coverageState: string;
  robotsTxtState: string;
  indexingState: string;
  pageFetchState: string;
  lastCrawlTime?: string;
  googleCanonical?: string;
  userCanonical?: string;
  /** `true` when the URL is on a submitted sitemap Google knows about. */
  inSitemap: boolean;
}

/**
 * Inspect one URL's index status.
 *
 * Expensive by design: one HTTP call per URL, against a 2,000/day per-property
 * quota. Callers must bound how many URLs they inspect — this is never
 * something to run across a whole site on page load.
 *
 * `mobileUsabilityResult` is intentionally not read. Google retired the Mobile
 * Usability report in December 2023 and the field now returns
 * `VERDICT_UNSPECIFIED` for every URL, so anything derived from it would be
 * decoration rather than data.
 */
export async function inspectUrl(
  property: string,
  url: string,
): Promise<GscUrlInspection> {
  try {
    // `urlInspection` is missing from the published typings for this client
    // version, though the endpoint is stable and documented.
    const response = await (
      getClient() as unknown as {
        urlInspection: {
          index: {
            inspect(args: {
              requestBody: { inspectionUrl: string; siteUrl: string };
            }): Promise<{ data: Record<string, any> }>;
          };
        };
      }
    ).urlInspection.index.inspect({
      requestBody: { inspectionUrl: url, siteUrl: property },
    });

    const result = response.data.inspectionResult?.indexStatusResult ?? {};
    return {
      url,
      verdict: result.verdict ?? "VERDICT_UNSPECIFIED",
      coverageState: result.coverageState ?? "Unknown",
      robotsTxtState: result.robotsTxtState ?? "UNKNOWN",
      indexingState: result.indexingState ?? "UNKNOWN",
      pageFetchState: result.pageFetchState ?? "UNKNOWN",
      lastCrawlTime: result.lastCrawlTime ?? undefined,
      googleCanonical: result.googleCanonical ?? undefined,
      userCanonical: result.userCanonical ?? undefined,
      inSitemap: Array.isArray(result.sitemap) && result.sitemap.length > 0,
    };
  } catch (error) {
    throw mapGoogleError(error, { api: "Search Console", target: url });
  }
}

export async function searchAnalyticsQuery(
  request: GscQueryRequest,
): Promise<GscReport> {
  if (!request.property) {
    throw new ServiceError(
      "not_configured",
      "This website has no Search Console property. Set the matching GSC_PROPERTY_* environment variable.",
      503,
    );
  }

  try {
    const response = await getClient().searchanalytics.query({
      siteUrl: request.property,
      requestBody: {
        startDate: request.range.from,
        endDate: request.range.to,
        dimensions: request.dimensions,
        rowLimit: request.rowLimit ?? 1000,
        startRow: request.startRow ?? 0,
        type: request.searchType ?? "web",
        dataState: request.dataState ?? "final",
      },
    });

    return decodeQuery(response.data);
  } catch (error) {
    throw mapGoogleError(error, { api: "Search Console", target: request.property });
  }
}

/** Convert a raw Search Console response into `GscReport`. */
export function decodeQuery(response: {
  rows?: {
    keys?: string[] | null;
    clicks?: number | null;
    impressions?: number | null;
    ctr?: number | null;
    position?: number | null;
  }[];
}): GscReport {
  return {
    rows: (response.rows ?? []).map((row) => ({
      keys: row.keys ?? [],
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      ctr: row.ctr ?? 0,
      position: row.position ?? 0,
    })),
  };
}

/** `www.example.com` and `example.com` are the same site for display purposes. */
function stripWww(host: string): string {
  return host.replace(/^www\./i, "");
}

/**
 * Reduce a Search Console page URL to the path GA4 keys landing pages by.
 *
 * This is the join key between the two data sources, so it has to be right or
 * the Landing Pages table silently loses every GA4 column.
 *
 * A **Domain property** (`sc-domain:example.com` — what all four sites use)
 * matches far more than the configured origin: http and https, www and non-www,
 * and *every subdomain*. So a naive `startsWith(origin)` check leaves rows
 * unstripped the moment anything isn't the canonical hostname — they render as
 * full URLs and join to nothing.
 *
 * Three cases, deliberately distinguished:
 *
 * 1. **Same site** (host matches ignoring `www.`) → `/pricing`.
 *    This is the join key GA4 understands.
 * 2. **Different subdomain** (`blog.example.com`) → `blog.example.com/post`.
 *    Kept qualified on purpose: collapsing it to `/post` would merge two
 *    genuinely different pages into one table row and silently sum their
 *    clicks. A wrong number is worse than an ugly one.
 * 3. **Unparseable or foreign** → returned untouched.
 */
export function toPagePath(url: string, origin: string): string {
  let page: URL;
  let base: URL;
  try {
    page = new URL(url);
    base = new URL(origin);
  } catch {
    // Not a URL pair we can reason about — leave it alone rather than mangle it.
    return url;
  }

  const path = `${page.pathname}${page.search}` || "/";

  if (stripWww(page.hostname) === stripWww(base.hostname)) {
    return path;
  }

  // A different host under the same property: keep it identifiable.
  return `${page.hostname}${path}`;
}
