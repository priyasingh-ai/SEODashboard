import "server-only";

import type { Site, Website } from "@/types";
import { inspectUrl, listSitemaps, type GscUrlInspection } from "@/lib/search-console";
import { fetchPage, fetchPages, fetchRobots } from "./fetch-page";
import {
  canonicalCheck,
  coreWebVitalsCheck,
  httpsCheck,
  indexCoverageCheck,
  mobileUsabilityCheck,
  notFoundCheck,
  redirectCheck,
  robotsCheck,
  schemaCheck,
  sitemapCheck,
  type CruxMetrics,
} from "./checks";
import { CHECK_ORDER, SEVERITY_RANK, type CheckResult, type TechnicalAudit } from "./types";

/**
 * Orchestrates a technical audit.
 *
 * ## Why this is bounded and on demand
 *
 * Unlike every other report in this dashboard, a technical audit is not a
 * read against an analytics API — it fetches the customer's live pages and
 * spends Search Console's URL Inspection quota, which is 2,000 URLs per
 * property per day and is shared with anything else using that property.
 *
 * Running it automatically on page load would send a burst of traffic at their
 * production server every time somebody opened a tab, and could exhaust a day's
 * inspection quota within minutes. So the scan is explicitly triggered, capped
 * at `MAX_PAGES` URLs, and cached.
 *
 * Pages are chosen by clicks rather than crawled, so the sample is the part of
 * the site that actually earns traffic — a technical fault on a page nobody
 * reaches is not the first thing anyone should fix.
 */

/**
 * URLs fetched and inspected per scan.
 *
 * A ceiling, not a target: a property with fewer ranked pages is scanned in
 * full. Of the four properties here, only the largest comes near this.
 *
 * 100 costs a twentieth of the 2,000/day inspection quota, so a property
 * tolerates twenty scans a day — comfortable for a report cached for an hour,
 * but reachable by leaning on Re-scan, which bypasses that cache.
 *
 * Raising this further means raising `INSPECT_CONCURRENCY` and the route's
 * `maxDuration` with it. Inspection latency is the binding constraint, and it
 * is high: measured at roughly 7s per URL against this property. The three
 * numbers were chosen together and only hold together.
 */
const MAX_PAGES = 100;

export interface ScanInput {
  site: Site;
  website: Website;
  /** Top page paths by clicks, from the Search Console report. */
  topPages: string[];
}

/** Resolve a Search Console page path against the site's canonical origin. */
function toAbsolute(path: string, origin: string): string | undefined {
  try {
    return new URL(path, origin).toString();
  } catch {
    return undefined;
  }
}

/**
 * Core Web Vitals from the CrUX field data in a PageSpeed Insights response.
 *
 * Field data, not the Lighthouse lab score: Google ranks on what real Chrome
 * users experienced, and a lab run on a fast connection routinely disagrees
 * with it. Returns `undefined` when no key is set or the origin has too little
 * traffic for CrUX to report, and the check surfaces that rather than guessing.
 */
async function coreWebVitals(
  origin: string,
): Promise<{ metrics?: CruxMetrics; reason?: string }> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    return {
      reason:
        "Core Web Vitals need a free PageSpeed Insights API key. Add PAGESPEED_API_KEY to your environment to enable this check.",
    };
  }

  const url =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(origin)}&strategy=mobile&key=${key}`;

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!response.ok) {
      return { reason: `PageSpeed Insights returned HTTP ${response.status}.` };
    }

    const body = (await response.json()) as {
      loadingExperience?: {
        overall_category?: string;
        metrics?: Record<string, { percentile?: number }>;
      };
    };

    const metrics = body.loadingExperience?.metrics;
    if (!metrics) {
      return {
        reason:
          "Chrome UX Report has no field data for this origin — it needs sustained real-user traffic before Google will report Core Web Vitals.",
      };
    }

    return {
      metrics: {
        lcp: metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        inp: metrics.INTERACTION_TO_NEXT_PAINT?.percentile,
        cls:
          metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile === undefined
            ? undefined
            : // CrUX reports CLS multiplied by 100.
              metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100,
        overall: body.loadingExperience?.overall_category,
      },
    };
  } catch (error) {
    return {
      reason: `PageSpeed Insights request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Weighted health score.
 *
 * Criticals dominate deliberately — a site with one page blocked by robots.txt
 * and nine clean checks is not 90% healthy. Checks that could not run are
 * excluded from the denominator rather than counted as passes.
 */
function scoreOf(checks: CheckResult[]): number {
  const measured = checks.filter(
    (c) => c.status === "critical" || c.status === "warning" || c.status === "healthy",
  );
  if (measured.length === 0) return 0;

  const penalty = measured.reduce((sum, check) => {
    if (check.status === "critical") return sum + 1;
    if (check.status === "warning") return sum + 0.35;
    return sum;
  }, 0);

  return Math.max(0, Math.round((1 - penalty / measured.length) * 100));
}

export async function runTechnicalScan(input: ScanInput): Promise<TechnicalAudit> {
  const { site, website, topPages } = input;
  const origin = site.url;

  const urls = topPages
    .map((path) => toAbsolute(path, origin))
    .filter((u): u is string => Boolean(u))
    .slice(0, MAX_PAGES);

  // Always include the homepage — it is the most consequential single page and
  // may not appear in the click-ranked list on a young property.
  const homepage = toAbsolute("/", origin);
  if (homepage && !urls.includes(homepage)) urls.unshift(homepage);

  const insecureOrigin = origin.replace(/^https:/, "http:");
  // A path that cannot plausibly exist, for the soft-404 probe.
  const softProbeUrl = toAbsolute(`/__seo-audit-probe-${Date.now().toString(36)}`, origin) ?? origin;

  const [pages, robots, softProbe, insecureProbe, sitemaps, inspections, cwv] =
    await Promise.all([
      fetchPages(urls),
      fetchRobots(origin),
      fetchPage(softProbeUrl),
      fetchPage(insecureOrigin),
      listSitemaps(website.searchConsoleProperty).catch(() => []),
      inspectUrls(website.searchConsoleProperty, urls),
      coreWebVitals(origin),
    ]);

  const checks: CheckResult[] = [
    indexCoverageCheck(inspections),
    notFoundCheck(pages, softProbe),
    canonicalCheck(pages, inspections),
    redirectCheck(pages),
    sitemapCheck(sitemaps, robots),
    robotsCheck(robots),
    httpsCheck(origin, insecureProbe, pages),
    schemaCheck(pages),
    coreWebVitalsCheck(cwv.metrics, cwv.reason),
    mobileUsabilityCheck(pages),
  ].sort((a, b) => CHECK_ORDER.indexOf(a.check) - CHECK_ORDER.indexOf(b.check));

  const allIssues = checks.flatMap((c) => c.issues);

  return {
    site,
    scannedAt: new Date().toISOString(),
    pagesScanned: pages.filter((p) => p.status > 0).length,
    checks,
    score: scoreOf(checks),
    counts: {
      critical: allIssues.filter((i) => i.severity === "critical").length,
      warning: allIssues.filter((i) => i.severity === "warning").length,
      healthy: checks.filter((c) => c.status === "healthy").length,
    },
  };
}

/**
 * Concurrent URL inspections.
 *
 * Eight at a time. Inspection latency dominates a scan and is worse than it
 * looks — measured at ~7s per URL, so the wall-clock cost is roughly
 * `MAX_PAGES / INSPECT_CONCURRENCY * 7s`. At four, a hundred URLs took about
 * three minutes, which overran the route's `maxDuration` and would have failed
 * in production while passing locally. Eight halves that to about ninety
 * seconds.
 *
 * Eight is still far inside the documented ceiling of 600 inspections per
 * minute per property — that ceiling would permit far more, and the reason not
 * to take it is the 2,000/day quota, which `MAX_PAGES` governs, and the burst
 * of load a higher number would put on Search Console for no gain once the scan
 * fits its budget.
 *
 * A failure on one URL drops that URL rather than rejecting the batch — a
 * partial audit is far more useful than none, and the usual cause is a
 * permissions quirk on a single path.
 */
const INSPECT_CONCURRENCY = 8;

async function inspectUrls(property: string, urls: string[]): Promise<GscUrlInspection[]> {
  const results: GscUrlInspection[] = [];
  let cursor = 0;

  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        results.push(await inspectUrl(property, url));
      } catch {
        // Swallowed deliberately — see above.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(INSPECT_CONCURRENCY, urls.length) }, worker),
  );
  return results;
}

/** Sort issues across the whole audit, worst first. */
export function allIssuesBySeverity(audit: TechnicalAudit) {
  return audit.checks
    .flatMap((c) => c.issues)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.affectedCount - a.affectedCount);
}
