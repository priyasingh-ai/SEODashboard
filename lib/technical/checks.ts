import "server-only";

import type { GscSitemap, GscUrlInspection } from "@/lib/search-console";
import {
  canonicalOf,
  isClientRendered,
  metaRobotsOf,
  structuredDataOf,
  viewportOf,
  type FetchedPage,
  type RobotsTxt,
} from "./fetch-page";
import {
  CHECK_LABELS,
  type CheckResult,
  type ImpactLevel,
  type Severity,
  type TechnicalIssue,
} from "./types";

/**
 * The ten technical checks.
 *
 * Each takes evidence already gathered and returns a `CheckResult`. They are
 * pure — no fetching happens here — so the scan can be orchestrated, bounded
 * and cached in one place (`scan.ts`) rather than each check going its own way.
 *
 * Two rules run through all of them:
 *
 * 1. A check that could not run reports `unavailable`, never `healthy`. Green
 *    means verified, and claiming it for something unmeasured is worse than
 *    admitting the gap.
 * 2. Severity reflects consequence, not tidiness. A missing canonical on one
 *    page is a warning; a page Google refuses to index is critical.
 */

/** Only this many example URLs travel to the client per issue. */
const MAX_EXAMPLES = 12;

function issue(
  check: TechnicalIssue["check"],
  severity: Severity,
  title: string,
  description: string,
  suggestedFix: string,
  estimatedImpact: ImpactLevel,
  pages: string[],
): TechnicalIssue {
  return {
    id: `${check}:${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 48)}`,
    check,
    severity,
    title,
    description,
    affectedPages: pages.slice(0, MAX_EXAMPLES),
    affectedCount: pages.length,
    suggestedFix,
    estimatedImpact,
  };
}

/** Worst severity present, or healthy when there is nothing to report. */
function rollup(issues: TechnicalIssue[]): Severity {
  if (issues.some((i) => i.severity === "critical")) return "critical";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "healthy";
}

function result(
  check: TechnicalIssue["check"],
  issues: TechnicalIssue[],
  checkedPages: number,
  healthySummary: string,
): CheckResult {
  const status = rollup(issues);
  return {
    check,
    label: CHECK_LABELS[check],
    status,
    checkedPages,
    issues: issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1)),
    summary:
      status === "healthy"
        ? healthySummary
        : issues.map((i) => i.title).slice(0, 2).join(" · "),
  };
}

function unavailable(
  check: TechnicalIssue["check"],
  reason: string,
  status: "unavailable" | "not-configured" = "unavailable",
): CheckResult {
  return {
    check,
    label: CHECK_LABELS[check],
    status,
    summary: reason,
    issues: [],
    checkedPages: 0,
    unavailableReason: reason,
  };
}

/* -------------------------------------------------------------------------- */
/*  1. Index coverage                                                          */
/* -------------------------------------------------------------------------- */

export function indexCoverageCheck(inspections: GscUrlInspection[]): CheckResult {
  if (inspections.length === 0) {
    return unavailable(
      "index-coverage",
      "No URLs were inspected. Run a scan to check index status.",
    );
  }

  const issues: TechnicalIssue[] = [];

  const notIndexed = inspections.filter((i) => i.verdict === "FAIL" || i.verdict === "NEUTRAL");
  const blockedByRobots = inspections.filter((i) => i.robotsTxtState === "DISALLOWED");
  const noindex = inspections.filter((i) => i.indexingState === "BLOCKED_BY_META_TAG");
  const fetchFailed = inspections.filter(
    (i) => i.pageFetchState !== "SUCCESSFUL" && i.pageFetchState !== "UNKNOWN",
  );

  if (blockedByRobots.length) {
    issues.push(
      issue(
        "index-coverage",
        "critical",
        `${blockedByRobots.length} page${blockedByRobots.length === 1 ? "" : "s"} blocked by robots.txt`,
        "Google is not allowed to crawl these URLs, so they cannot be indexed or rank for anything.",
        "Open robots.txt and remove or narrow the Disallow rule covering these paths. If the block is intentional, remove the URLs from your sitemap so Google stops trying.",
        "very-high",
        blockedByRobots.map((i) => i.url),
      ),
    );
  }

  if (noindex.length) {
    issues.push(
      issue(
        "index-coverage",
        "critical",
        `${noindex.length} page${noindex.length === 1 ? "" : "s"} carry a noindex tag`,
        "A meta robots noindex tag is telling Google to keep these out of search results.",
        "Remove the noindex directive from these pages if they are meant to rank. A stray noindex left over from staging is one of the most common causes of sudden traffic loss.",
        "very-high",
        noindex.map((i) => i.url),
      ),
    );
  }

  if (fetchFailed.length) {
    issues.push(
      issue(
        "index-coverage",
        "critical",
        `${fetchFailed.length} page${fetchFailed.length === 1 ? "" : "s"} could not be fetched by Google`,
        `Google's crawler failed to retrieve these URLs (${[...new Set(fetchFailed.map((i) => i.pageFetchState))].join(", ")}).`,
        "Check that these URLs return 200 to Googlebot specifically — server-side blocking, rate limiting, or a firewall rule are the usual causes. Verify with the URL Inspection tool's Live Test in Search Console.",
        "very-high",
        fetchFailed.map((i) => i.url),
      ),
    );
  }

  const otherNotIndexed = notIndexed.filter(
    (i) => !blockedByRobots.includes(i) && !noindex.includes(i) && !fetchFailed.includes(i),
  );
  if (otherNotIndexed.length) {
    issues.push(
      issue(
        "index-coverage",
        "warning",
        `${otherNotIndexed.length} page${otherNotIndexed.length === 1 ? "" : "s"} not indexed`,
        `Google knows about these URLs but has not indexed them. Reported state: ${[...new Set(otherNotIndexed.map((i) => i.coverageState))].join("; ")}.`,
        "Most often this means Google judged the page too thin, too similar to another page, or not worth the crawl budget. Strengthen the content, add internal links from indexed pages, and confirm the URL is in your sitemap.",
        "high",
        otherNotIndexed.map((i) => i.url),
      ),
    );
  }

  const notInSitemap = inspections.filter((i) => !i.inSitemap);
  if (notInSitemap.length) {
    issues.push(
      issue(
        "index-coverage",
        "warning",
        `${notInSitemap.length} indexed page${notInSitemap.length === 1 ? " is" : "s are"} missing from your sitemap`,
        "Google found these by crawling rather than from a sitemap. They still rank, but discovery of future changes is slower.",
        "Add these URLs to your sitemap so Google is told about updates directly instead of waiting to re-crawl.",
        "low",
        notInSitemap.map((i) => i.url),
      ),
    );
  }

  return result(
    "index-coverage",
    issues,
    inspections.length,
    `All ${inspections.length} inspected pages are indexed and crawlable.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Sitemap                                                                 */
/* -------------------------------------------------------------------------- */

/** A sitemap untouched for this long is usually a leftover. */
const STALE_SITEMAP_DAYS = 180;

export function sitemapCheck(sitemaps: GscSitemap[], robots: RobotsTxt): CheckResult {
  if (sitemaps.length === 0) {
    return result(
      "sitemap",
      [
        issue(
          "sitemap",
          "critical",
          "No sitemap submitted",
          "Search Console has no sitemap for this property, so Google is relying entirely on crawling to discover pages.",
          "Generate a sitemap.xml and submit it under Search Console → Sitemaps. Reference it from robots.txt as well.",
          "high",
          [],
        ),
      ],
      0,
      "",
    );
  }

  const issues: TechnicalIssue[] = [];

  const withErrors = sitemaps.filter((s) => s.errors > 0);
  if (withErrors.length) {
    issues.push(
      issue(
        "sitemap",
        "critical",
        `${withErrors.length} sitemap${withErrors.length === 1 ? " has" : "s have"} parse errors`,
        `Google could not read part of ${withErrors.length === 1 ? "this sitemap" : "these sitemaps"}, so some URLs may never be discovered.`,
        "Open each sitemap's detail view in Search Console to see the failing lines. Malformed URLs, wrong encoding, and stale index files pointing at deleted children are the usual causes.",
        "high",
        withErrors.map((s) => s.path),
      ),
    );
  }

  const withWarnings = sitemaps.filter((s) => s.warnings > 0 && s.errors === 0);
  if (withWarnings.length) {
    issues.push(
      issue(
        "sitemap",
        "warning",
        `${withWarnings.length} sitemap${withWarnings.length === 1 ? " has" : "s have"} warnings`,
        "Google parsed these but flagged issues — commonly URLs that redirect, are blocked, or sit on a different domain.",
        "Review the warnings in Search Console and remove URLs that redirect or no longer exist. A sitemap should list only canonical, indexable, 200-status URLs.",
        "medium",
        withWarnings.map((s) => s.path),
      ),
    );
  }

  const now = Date.now();
  const stale = sitemaps.filter((s) => {
    if (!s.lastSubmitted) return false;
    const age = (now - new Date(s.lastSubmitted).getTime()) / 86_400_000;
    return age > STALE_SITEMAP_DAYS;
  });
  if (stale.length) {
    issues.push(
      issue(
        "sitemap",
        "warning",
        `${stale.length} sitemap${stale.length === 1 ? " has" : "s have"} not been resubmitted in over ${STALE_SITEMAP_DAYS} days`,
        "Old submissions often point at structures the site no longer has, which wastes crawl budget on URLs that are gone.",
        "Confirm each of these is still generated and current. Remove submissions that belong to retired sections or old domains.",
        "low",
        stale.map((s) => `${s.path} (last submitted ${s.lastSubmitted?.slice(0, 10)})`),
      ),
    );
  }

  if (robots.found && robots.sitemaps.length === 0) {
    issues.push(
      issue(
        "sitemap",
        "warning",
        "robots.txt does not reference a sitemap",
        "Search engines other than Google rely on the robots.txt Sitemap directive for discovery, since they have no Search Console equivalent.",
        "Add a line reading `Sitemap: https://yourdomain.com/sitemap.xml` to robots.txt.",
        "low",
        [],
      ),
    );
  }

  const submitted = sitemaps.reduce(
    (sum, s) => sum + s.contents.reduce((t, c) => t + c.submitted, 0),
    0,
  );

  return result(
    "sitemap",
    issues,
    sitemaps.length,
    `${sitemaps.length} sitemap${sitemaps.length === 1 ? "" : "s"} submitted, ${submitted.toLocaleString("en-US")} URLs, no errors.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  3. Robots.txt                                                              */
/* -------------------------------------------------------------------------- */

export function robotsCheck(robots: RobotsTxt): CheckResult {
  const issues: TechnicalIssue[] = [];

  if (!robots.found) {
    // A missing robots.txt is legal and means "crawl everything". Worth noting,
    // not worth alarming over.
    issues.push(
      issue(
        "robots",
        "warning",
        `robots.txt is missing (HTTP ${robots.status || "unreachable"})`,
        "Without one, crawlers assume everything is allowed. That is usually harmless, but you also lose the ability to point them at your sitemap or hold them off admin paths.",
        "Add a robots.txt at the domain root with at minimum a Sitemap directive.",
        "low",
        [],
      ),
    );
  } else if (robots.blocksEverything) {
    issues.push(
      issue(
        "robots",
        "critical",
        "robots.txt blocks the entire site",
        "A `Disallow: /` under `User-agent: *` prevents every crawler from reading any page. Nothing on this domain can rank while it stands.",
        "Remove that rule immediately unless the block is deliberate. This single line is the most damaging misconfiguration in technical SEO, and it is usually left behind after a staging deploy.",
        "very-high",
        [],
      ),
    );
  }

  return result(
    "robots",
    issues,
    robots.found ? 1 : 0,
    `robots.txt found, crawling allowed, ${robots.sitemaps.length} sitemap directive${robots.sitemaps.length === 1 ? "" : "s"}.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  4. Canonical                                                               */
/* -------------------------------------------------------------------------- */

export function canonicalCheck(
  pages: FetchedPage[],
  inspections: GscUrlInspection[],
): CheckResult {
  const fetched = pages.filter((p) => p.status === 200 && p.html);
  // A client-rendered shell has no canonical in its raw HTML by definition.
  // Counting those as "missing" would report the scanner's inability to run
  // JavaScript as a fault in the site.
  const live = fetched.filter((p) => !isClientRendered(p.html));
  const shells = fetched.length - live.length;

  if (live.length === 0) {
    return unavailable(
      "canonical",
      shells > 0
        ? `All ${shells} fetched pages render their content with JavaScript, so canonical tags cannot be read from the raw HTML.`
        : "No pages could be fetched to inspect canonical tags.",
    );
  }

  const issues: TechnicalIssue[] = [];
  const missing: string[] = [];
  const mismatched: string[] = [];

  for (const page of live) {
    const canonical = canonicalOf(page.html);
    if (!canonical) {
      missing.push(page.url);
      continue;
    }
    try {
      // Compare origin + path only. Query strings and trailing-slash differences
      // are normal and not worth flagging as conflicts.
      const declared = new URL(canonical, page.finalUrl);
      const actual = new URL(page.finalUrl);
      const norm = (u: URL) => `${u.host}${u.pathname.replace(/\/$/, "")}`.toLowerCase();
      if (norm(declared) !== norm(actual)) mismatched.push(`${page.url} → ${canonical}`);
    } catch {
      mismatched.push(`${page.url} → ${canonical} (unparseable)`);
    }
  }

  if (missing.length) {
    issues.push(
      issue(
        "canonical",
        "warning",
        `${missing.length} page${missing.length === 1 ? "" : "s"} missing a canonical tag`,
        "Without an explicit canonical, Google picks one itself. On sites where the same content is reachable at more than one URL, it often picks the wrong one.",
        "Add `<link rel=\"canonical\" href=\"…\">` to each page's head, pointing at the absolute, preferred URL for that content.",
        "medium",
        missing,
      ),
    );
  }

  if (mismatched.length) {
    issues.push(
      issue(
        "canonical",
        "warning",
        `${mismatched.length} page${mismatched.length === 1 ? "" : "s"} declare a different canonical URL`,
        "These pages point their canonical at a different URL from the one serving them. That is correct for deliberate duplicates and a bug everywhere else — it tells Google to ignore this page in favour of another.",
        "Confirm each of these is intentional. If the page should rank in its own right, point the canonical at itself.",
        "high",
        mismatched,
      ),
    );
  }

  // Google reporting a different canonical than the page declares is the
  // strongest possible signal that the declaration is being overruled.
  const overruled = inspections.filter(
    (i) =>
      i.googleCanonical &&
      i.userCanonical &&
      i.googleCanonical.replace(/\/$/, "") !== i.userCanonical.replace(/\/$/, ""),
  );
  if (overruled.length) {
    issues.push(
      issue(
        "canonical",
        "critical",
        `Google chose a different canonical on ${overruled.length} page${overruled.length === 1 ? "" : "s"}`,
        `Google is ignoring the declared canonical and indexing another URL instead — for example ${overruled[0].url} was consolidated into ${overruled[0].googleCanonical}.`,
        "This usually means Google considers the pages duplicates. Differentiate the content meaningfully, or accept the consolidation and redirect the weaker URL into the winner.",
        "high",
        overruled.map((i) => `${i.url} → ${i.googleCanonical}`),
      ),
    );
  }

  return result(
    "canonical",
    issues,
    live.length,
    `All ${live.length} fetched pages declare a self-referencing canonical.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  5. 404 errors                                                              */
/* -------------------------------------------------------------------------- */

export function notFoundCheck(pages: FetchedPage[], softProbe: FetchedPage): CheckResult {
  const issues: TechnicalIssue[] = [];

  const broken = pages.filter((p) => p.status === 404 || p.status === 410);
  const serverErrors = pages.filter((p) => p.status >= 500);
  const unreachable = pages.filter((p) => p.status === 0);

  if (broken.length) {
    issues.push(
      issue(
        "not-found",
        "critical",
        `${broken.length} page${broken.length === 1 ? "" : "s"} return 404`,
        "These URLs are drawing search traffic but no longer exist, so every visitor and every link pointing at them is wasted.",
        "Redirect each one to the closest equivalent page with a 301. Only leave a 404 in place when there is genuinely no replacement.",
        "very-high",
        broken.map((p) => p.url),
      ),
    );
  }

  if (serverErrors.length) {
    issues.push(
      issue(
        "not-found",
        "critical",
        `${serverErrors.length} page${serverErrors.length === 1 ? "" : "s"} return a server error`,
        `These URLs responded with 5xx errors (${[...new Set(serverErrors.map((p) => p.status))].join(", ")}). Google drops persistently failing pages from the index.`,
        "Investigate the server errors directly — these are application faults, not SEO configuration. Fix them before anything else on this page.",
        "very-high",
        serverErrors.map((p) => `${p.url} (${p.status})`),
      ),
    );
  }

  if (unreachable.length) {
    issues.push(
      issue(
        "not-found",
        "warning",
        `${unreachable.length} page${unreachable.length === 1 ? "" : "s"} could not be reached`,
        "The request timed out or the connection failed. This may be a transient blip, or rate limiting against the scanner.",
        "Retry the scan. If it persists, check whether your host is rate limiting or blocking non-browser user agents.",
        "medium",
        unreachable.map((p) => `${p.url} (${p.error ?? "no response"})`),
      ),
    );
  }

  // The soft-404 probe: a URL that cannot exist should not resolve successfully.
  //
  // Two distinct faults produce a 200 here, and they need different fixes, so
  // the redirect chain decides which one is reported. Collapsing them into one
  // message describes at least one of the two sites inaccurately.
  if (softProbe.status === 200) {
    const redirected = softProbe.redirectChain.length > 0;

    issues.push(
      redirected
        ? issue(
            "not-found",
            "critical",
            "Missing pages redirect to a live page instead of returning 404",
            `A deliberately invalid URL was redirected (${softProbe.redirectChain.map((h) => h.status).join(" → ")}) to ${softProbe.finalUrl}, which returned 200. Google treats a catch-all redirect of unknown URLs as a soft 404 and may drop the destination page's ranking as a result.`,
            "Return a real 404 for unknown routes rather than redirecting them. Redirect only where a specific old URL has a specific new home; a blanket rule sending everything to the homepage actively harms it.",
            "very-high",
            [`${softProbe.url} → ${softProbe.finalUrl}`],
          )
        : issue(
            "not-found",
            "critical",
            "Missing pages return HTTP 200 instead of 404",
            "A deliberately invalid URL returned a success status directly. Every mistyped link, stale URL and crawler guess therefore looks like a real page, and Google can index unlimited duplicates of your error page.",
            "Configure the server to return a genuine 404 status for unknown routes. The page can still be styled and helpful — what matters is the status code in the response header, not what the body says.",
            "very-high",
            [softProbe.url],
          ),
    );
  }

  return result(
    "not-found",
    issues,
    pages.length + 1,
    `All ${pages.length} checked pages return 200, and missing URLs correctly return 404.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  6. Redirects                                                               */
/* -------------------------------------------------------------------------- */

export function redirectCheck(pages: FetchedPage[]): CheckResult {
  const issues: TechnicalIssue[] = [];

  const chains = pages.filter((p) => p.redirectChain.length > 1);
  const temporary = pages.filter((p) => p.redirectChain.some((h) => h.status === 302 || h.status === 307));
  const loops = pages.filter((p) => p.status === 508);

  if (loops.length) {
    issues.push(
      issue(
        "redirects",
        "critical",
        `${loops.length} URL${loops.length === 1 ? "" : "s"} redirect in a loop`,
        "These never resolve to a page. Neither crawlers nor visitors can reach them.",
        "Trace the redirect rules for these paths and break the cycle. Conflicting rules between the CDN, the server and the application are the usual cause.",
        "very-high",
        loops.map((p) => p.url),
      ),
    );
  }

  if (chains.length) {
    issues.push(
      issue(
        "redirects",
        "warning",
        `${chains.length} URL${chains.length === 1 ? "" : "s"} redirect more than once before resolving`,
        "Each additional hop adds latency for visitors and dilutes the signal passed along the chain.",
        "Rewrite these to redirect straight to the final destination in a single hop.",
        "medium",
        chains.map((p) => `${p.url} (${p.redirectChain.length} hops → ${p.finalUrl})`),
      ),
    );
  }

  if (temporary.length) {
    issues.push(
      issue(
        "redirects",
        "warning",
        `${temporary.length} URL${temporary.length === 1 ? " uses" : "s use"} a temporary redirect`,
        "302 and 307 tell Google the move is temporary, so it keeps the old URL indexed and is slower to transfer ranking signals to the new one.",
        "Switch to a 301 wherever the move is permanent.",
        "medium",
        temporary.map((p) => `${p.url} → ${p.finalUrl}`),
      ),
    );
  }

  return result(
    "redirects",
    issues,
    pages.length,
    `No redirect chains, loops, or temporary redirects across ${pages.length} pages.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  7. HTTPS                                                                   */
/* -------------------------------------------------------------------------- */

export function httpsCheck(
  origin: string,
  insecureProbe: FetchedPage,
  pages: FetchedPage[],
): CheckResult {
  const issues: TechnicalIssue[] = [];

  if (!origin.startsWith("https://")) {
    issues.push(
      issue(
        "https",
        "critical",
        "Site is configured over plain HTTP",
        "The canonical origin is not HTTPS. Browsers mark it insecure and HTTPS has been a ranking signal for a decade.",
        "Install a TLS certificate and serve the whole site over HTTPS.",
        "very-high",
        [origin],
      ),
    );
  }

  const redirectsToHttps =
    insecureProbe.status >= 300 && insecureProbe.status < 400
      ? (insecureProbe.redirectChain[0]?.to ?? "").startsWith("https://")
      : insecureProbe.finalUrl.startsWith("https://");

  if (insecureProbe.status === 200 && !insecureProbe.finalUrl.startsWith("https://")) {
    issues.push(
      issue(
        "https",
        "critical",
        "HTTP version of the site serves content without redirecting",
        "The site answers on plain HTTP instead of redirecting to HTTPS, which leaves two crawlable copies of every page and splits their ranking signals.",
        "Add a site-wide 301 from http:// to https://, then enable HSTS so browsers stop trying HTTP at all.",
        "high",
        [insecureProbe.url],
      ),
    );
  } else if (!redirectsToHttps && insecureProbe.status !== 0) {
    issues.push(
      issue(
        "https",
        "warning",
        "HTTP requests do not redirect to HTTPS",
        `Requesting the site over HTTP returned ${insecureProbe.status} without sending visitors to the secure version.`,
        "Configure a permanent redirect from HTTP to HTTPS at the server or CDN.",
        "medium",
        [insecureProbe.url],
      ),
    );
  }

  // Mixed content: a secure page loading sub-resources over plain HTTP.
  const mixed = pages.filter(
    (p) => p.finalUrl.startsWith("https://") && /(?:src|href)\s*=\s*["']http:\/\//i.test(p.html),
  );
  if (mixed.length) {
    issues.push(
      issue(
        "https",
        "warning",
        `${mixed.length} page${mixed.length === 1 ? "" : "s"} load resources over plain HTTP`,
        "Mixed content. Browsers block or downgrade these resources, which can break layout and scripts on an otherwise secure page.",
        "Update the offending src and href attributes to https:// or protocol-relative URLs.",
        "medium",
        mixed.map((p) => p.url),
      ),
    );
  }

  return result("https", issues, pages.length + 1, "HTTPS enforced, HTTP redirects correctly, no mixed content.");
}

/* -------------------------------------------------------------------------- */
/*  8. Schema                                                                  */
/* -------------------------------------------------------------------------- */

export function schemaCheck(pages: FetchedPage[]): CheckResult {
  const fetched = pages.filter((p) => p.status === 200 && p.html);
  const live = fetched.filter((p) => !isClientRendered(p.html));
  const shells = fetched.length - live.length;

  if (live.length === 0) {
    return unavailable(
      "schema",
      shells > 0
        ? `All ${shells} fetched pages render their content with JavaScript. Structured data injected at runtime cannot be read from the raw HTML — Google will usually see it after rendering, but crawlers that do not execute JavaScript will not.`
        : "No pages could be fetched to inspect structured data.",
    );
  }

  const issues: TechnicalIssue[] = [];
  const invalid: string[] = [];
  const absent: string[] = [];

  for (const page of live) {
    const data = structuredDataOf(page.html);
    if (data.invalidBlocks > 0) invalid.push(`${page.url} (${data.invalidBlocks} malformed block${data.invalidBlocks === 1 ? "" : "s"})`);
    if (data.blocks === 0 && !data.hasMicrodata) absent.push(page.url);
  }

  if (invalid.length) {
    issues.push(
      issue(
        "schema",
        "critical",
        `${invalid.length} page${invalid.length === 1 ? " has" : "s have"} malformed JSON-LD`,
        "These blocks are not valid JSON, so search engines discard them entirely — the markup may as well not be there.",
        "Fix the JSON syntax. Trailing commas and unescaped quotes inside strings are the usual culprits. Validate with Google's Rich Results Test before shipping.",
        "medium",
        invalid,
      ),
    );
  }

  if (absent.length) {
    issues.push(
      issue(
        "schema",
        "warning",
        `${absent.length} page${absent.length === 1 ? "" : "s"} have no structured data`,
        "No JSON-LD or microdata was found. These pages are not eligible for rich results such as breadcrumbs, FAQs, products or reviews.",
        "Add JSON-LD appropriate to each page type — Article for posts, Product for items, BreadcrumbList for navigation. Start with the templates in Google's structured data gallery.",
        "medium",
        absent,
      ),
    );
  }

  const withData = live.length - absent.length;
  return result(
    "schema",
    issues,
    live.length,
    `${withData} of ${live.length} pages carry valid structured data.`,
  );
}

/* -------------------------------------------------------------------------- */
/*  9 & 10. Core Web Vitals and Mobile Usability                               */
/* -------------------------------------------------------------------------- */

export interface CruxMetrics {
  lcp?: number;
  inp?: number;
  cls?: number;
  /** `FAST` | `AVERAGE` | `SLOW`. */
  overall?: string;
}

/** Google's published Core Web Vitals thresholds, in ms and unitless CLS. */
const CWV_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  inp: { good: 200, poor: 500 },
  cls: { good: 0.1, poor: 0.25 },
};

export function coreWebVitalsCheck(metrics: CruxMetrics | undefined, reason?: string): CheckResult {
  if (!metrics) {
    return unavailable(
      "core-web-vitals",
      reason ??
        "Core Web Vitals need a free PageSpeed Insights API key. Set PAGESPEED_API_KEY to enable this check.",
      "not-configured",
    );
  }

  const issues: TechnicalIssue[] = [];
  const grade = (value: number | undefined, t: { good: number; poor: number }) =>
    value === undefined ? undefined : value <= t.good ? "good" : value <= t.poor ? "needs-work" : "poor";

  const lcp = grade(metrics.lcp, CWV_THRESHOLDS.lcp);
  const inp = grade(metrics.inp, CWV_THRESHOLDS.inp);
  const cls = grade(metrics.cls, CWV_THRESHOLDS.cls);

  if (lcp && lcp !== "good") {
    issues.push(
      issue(
        "core-web-vitals",
        lcp === "poor" ? "critical" : "warning",
        `Largest Contentful Paint is ${(metrics.lcp! / 1000).toFixed(1)}s`,
        `Google's threshold for a good LCP is 2.5s. Real Chrome users are waiting ${(metrics.lcp! / 1000).toFixed(1)}s for the main content to appear.`,
        "Compress and correctly size the hero image, serve it in a modern format, preload it, and remove render-blocking CSS and fonts ahead of it.",
        lcp === "poor" ? "high" : "medium",
        [],
      ),
    );
  }

  if (inp && inp !== "good") {
    issues.push(
      issue(
        "core-web-vitals",
        inp === "poor" ? "critical" : "warning",
        `Interaction to Next Paint is ${Math.round(metrics.inp!)}ms`,
        "Google's threshold is 200ms. The page is slow to respond when people tap or click.",
        "Break up long JavaScript tasks, defer non-essential scripts, and reduce third-party tags — analytics and chat widgets are common offenders.",
        inp === "poor" ? "high" : "medium",
        [],
      ),
    );
  }

  if (cls && cls !== "good") {
    issues.push(
      issue(
        "core-web-vitals",
        cls === "poor" ? "critical" : "warning",
        `Cumulative Layout Shift is ${metrics.cls!.toFixed(3)}`,
        "Google's threshold is 0.1. Content is moving as the page loads, which makes people tap the wrong thing.",
        "Set explicit width and height on images and embeds, reserve space for ads and banners, and avoid injecting content above what has already rendered.",
        cls === "poor" ? "high" : "medium",
        [],
      ),
    );
  }

  return result("core-web-vitals", issues, 1, "All three Core Web Vitals are within Google's thresholds.");
}

/**
 * Mobile usability.
 *
 * Google retired this report in December 2023 and removed it from the API — the
 * inspection response still carries the field, but it returns
 * `VERDICT_UNSPECIFIED` for every URL on every property, which was confirmed
 * against these properties directly rather than assumed from the changelog.
 *
 * So the check reports what can actually be verified from the page HTML: the
 * viewport declaration, which is the single prerequisite for mobile rendering.
 * Anything more — tap target sizing, text legibility — needs Lighthouse, and is
 * offered through the same PageSpeed key as Core Web Vitals.
 */
export function mobileUsabilityCheck(pages: FetchedPage[]): CheckResult {
  const live = pages.filter((p) => p.status === 200 && p.html);
  if (live.length === 0) {
    return unavailable("mobile-usability", "No pages could be fetched to inspect.");
  }

  const missingViewport = live.filter((p) => !viewportOf(p.html));
  const badViewport = live.filter((p) => {
    const viewport = viewportOf(p.html);
    return viewport && !/width\s*=\s*device-width/i.test(viewport);
  });

  const issues: TechnicalIssue[] = [];

  if (missingViewport.length) {
    issues.push(
      issue(
        "mobile-usability",
        "critical",
        `${missingViewport.length} page${missingViewport.length === 1 ? "" : "s"} have no viewport meta tag`,
        "Mobile browsers fall back to a desktop-width layout and zoom out, leaving text unreadably small.",
        'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to the head of every page.',
        "very-high",
        missingViewport.map((p) => p.url),
      ),
    );
  }

  if (badViewport.length) {
    issues.push(
      issue(
        "mobile-usability",
        "warning",
        `${badViewport.length} page${badViewport.length === 1 ? " has" : "s have"} a viewport that is not device-width`,
        "A fixed-width viewport forces mobile users to pan horizontally.",
        "Set the viewport content to `width=device-width, initial-scale=1`.",
        "high",
        badViewport.map((p) => p.url),
      ),
    );
  }

  return result(
    "mobile-usability",
    issues,
    live.length,
    `All ${live.length} pages declare a responsive viewport.`,
  );
}
