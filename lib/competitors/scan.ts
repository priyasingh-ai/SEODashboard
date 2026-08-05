import "server-only";

import type { QueryRow, Site } from "@/types";
import { fetchPage, fetchPages, isClientRendered, structuredDataOf } from "@/lib/technical/fetch-page";
import { headingsOf } from "@/lib/content/analyze";
import { probeBrands, type BrandTarget } from "@/lib/geo/ai-visibility";
import { buildGaps } from "./gaps";
import type { CompetitorProfile, CompetitorReport, UnavailableMetric } from "./types";

/**
 * Builds a competitor comparison from sources that actually exist.
 *
 * Each competitor is crawled shallowly — homepage plus whatever its sitemap
 * lists first — because this fetches somebody else's server. The page budget is
 * deliberately smaller than the own-site scans for that reason.
 */

const MAX_COMPETITORS = 4;
const PAGES_PER_COMPETITOR = 6;

/** Words too generic to describe what a page targets. */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "your", "you", "our", "we", "are", "is", "of", "to", "in",
  "on", "at", "by", "a", "an", "best", "top", "new", "home", "page", "welcome", "site",
  "official", "website", "online", "buy", "shop", "get", "more", "all", "from", "that",
  "this", "how", "what", "why", "it", "as", "or", "be", "can", "will", "us",
]);

function nameFrom(domain: string): string {
  const bare = domain.replace(/^www\./i, "").split(".")[0];
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/**
 * Terms a site targets, from titles and H1s.
 *
 * This is **not** what they rank for — that needs a rank-tracking data
 * provider. It is what their own markup says each page is about, which is a
 * legitimate and different signal: it reveals intent and coverage, and a topic
 * they title pages around and you do not is a real gap worth knowing.
 */
function targetedTerms(htmls: string[]): string[] {
  const counts = new Map<string, number>();

  for (const html of htmls) {
    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
    const text = [title, ...headingsOf(html).slice(0, 6)].join(" ");

    for (const word of text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)) {
      if (word.length < 4 || STOPWORDS.has(word)) continue;
      counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([word]) => word);
}


/** AggregateRating from JSON-LD — what the site publishes about itself. */
function ratingOf(html: string): { value: number; count: number } | undefined {
  const value = html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i)?.[1];
  const count = html.match(/"(?:reviewCount|ratingCount)"\s*:\s*"?(\d+)"?/i)?.[1];
  if (!value) return undefined;

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 5) return undefined;
  return { value: parsed, count: Number(count ?? 0) };
}

/**
 * Decode XML entities in a `<loc>` value.
 *
 * The sitemap spec requires `&` to be escaped, so a child sitemap with query
 * parameters arrives as `...?from=123&amp;to=456`. Fetching that string
 * verbatim sends a malformed query and the server returns nothing — which
 * silently undercounted every Shopify and paginated-WordPress site to a
 * handful of URLs instead of hundreds.
 */
function decodeLoc(value: string): string {
  return value
    .trim()
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'");
}

/** Every `<loc>` in a sitemap document, entity-decoded. */
function locsOf(xml: string): string[] {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((m) => decodeLoc(m[1]));
}

interface SitemapRead {
  /** Real page URLs, for the content sample. */
  pages: string[];
  /** Total URLs published, across expanded children. */
  count?: number;
  reason?: string;
}

/**
 * Read a sitemap once, for both the page sample and the published count.
 *
 * Deliberately a single pass. Sampling and counting were separate functions
 * that each fetched `/sitemap.xml`, which doubled the requests we send to a
 * third party's server for the same file — and on a rate-limiting host the
 * second fetch simply failed, silently dropping the published-URL count.
 *
 * Handles a sitemap index by descending one level, which is what large sites
 * publish; reading only the root and discarding `.xml` entries returns nothing
 * for them.
 */
async function readSitemap(origin: string, sampleLimit: number): Promise<SitemapRead> {
  try {
    const root = await fetchPage(new URL("/sitemap.xml", origin).toString());
    if (root.status !== 200 || !root.html) {
      return { pages: [], reason: `No readable sitemap (HTTP ${root.status || "unreachable"}).` };
    }

    const locs = locsOf(root.html);
    // Query strings are common on child sitemaps, so test the path only.
    const isSitemapDoc = (u: string) => /\.xml(\.gz)?(\?|$)/i.test(u);
    const direct = locs.filter((u) => !isSitemapDoc(u));

    if (direct.length > 0) {
      return { pages: direct.slice(0, sampleLimit), count: direct.length };
    }

    // Sitemap index: expand a bounded number of children.
    const children = await fetchPages(locs.slice(0, 5));
    let total = 0;
    let sample: string[] = [];
    for (const child of children) {
      const inner = locsOf(child.html ?? "").filter((u) => !isSitemapDoc(u));
      total += inner.length;
      if (sample.length < sampleLimit) sample = [...sample, ...inner].slice(0, sampleLimit);
    }

    return {
      pages: sample,
      count: total || undefined,
      reason:
        locs.length > 5 ? `Sitemap index has ${locs.length} children; first 5 counted.` : undefined,
    };
  } catch (error) {
    return { pages: [], reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Chrome UX Report field data — public for any origin with enough traffic. */
async function coreWebVitals(origin: string): Promise<Pick<CompetitorProfile, "cwv" | "cwvReason">> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) {
    return {
      cwvReason: "Set PAGESPEED_API_KEY to compare Core Web Vitals. The key is free.",
    };
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(origin)}&strategy=mobile&key=${key}`,
      { signal: AbortSignal.timeout(45_000) },
    );
    if (!response.ok) return { cwvReason: `PageSpeed Insights returned HTTP ${response.status}.` };

    const body = (await response.json()) as {
      loadingExperience?: { overall_category?: string; metrics?: Record<string, { percentile?: number }> };
    };
    const metrics = body.loadingExperience?.metrics;
    if (!metrics) {
      return { cwvReason: "No Chrome UX Report field data — the origin has too little traffic." };
    }

    return {
      cwv: {
        lcp: metrics.LARGEST_CONTENTFUL_PAINT_MS?.percentile,
        inp: metrics.INTERACTION_TO_NEXT_PAINT?.percentile,
        // CrUX reports CLS multiplied by 100.
        cls:
          metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile === undefined
            ? undefined
            : metrics.CUMULATIVE_LAYOUT_SHIFT_SCORE.percentile / 100,
        overall: body.loadingExperience?.overall_category,
      },
    };
  } catch (error) {
    return { cwvReason: error instanceof Error ? error.message : String(error) };
  }
}

async function profile(
  key: string,
  domain: string,
  isSelf: boolean,
  seedPaths: string[] = [],
): Promise<CompetitorProfile> {
  const origin = `https://${domain.replace(/^https?:\/\//, "").replace(/\/$/, "")}`;
  const base: CompetitorProfile = {
    key,
    name: nameFrom(domain),
    domain,
    url: origin,
    isSelf,
    status: "ok",
    pagesFetched: 0,
    clientRendered: 0,
    schemaTypes: [],
    targetedTerms: [],
  };

  const home = await fetchPage(origin);
  // 429 and 403 mean we were refused, not that the site is empty. Left as "ok"
  // with zero pages, a blocked competitor renders identically to one with no
  // content — and every gap would then read in our favour for the wrong reason.
  if (home.status === 429 || home.status === 403) {
    return {
      ...base,
      status: "unreachable",
      error:
        home.status === 429
          ? "Rate limited (HTTP 429) — the site refused repeated requests. Wait a few minutes and re-scan."
          : "Blocked (HTTP 403) — the site rejects non-browser traffic, so it cannot be crawled.",
    };
  }
  if (home.status === 0 || home.status >= 500 || home.status === 404) {
    return { ...base, status: "unreachable", error: home.error ?? `HTTP ${home.status}` };
  }

  // Prefer our own known paths for self; for competitors, take what their
  // sitemap offers rather than guessing at URL structure.
  const sitemap = await readSitemap(origin, PAGES_PER_COMPETITOR - 1);
  // Own pages come from Search Console (ranked by clicks); competitors' from
  // their sitemap, since we have no traffic data for them.
  const paths = isSelf ? seedPaths.slice(0, PAGES_PER_COMPETITOR - 1) : sitemap.pages;

  const extraUrls = paths
    .map((p) => {
      try {
        return new URL(p, origin).toString();
      } catch {
        return undefined;
      }
    })
    .filter((u): u is string => Boolean(u) && u !== origin);

  const [extras, vitals] = await Promise.all([fetchPages(extraUrls), coreWebVitals(origin)]);

  const all = [home, ...extras].filter((p) => p.status === 200 && p.html);
  const shells = all.filter((p) => isClientRendered(p.html)).length;
  const readable = all.filter((p) => !isClientRendered(p.html));

  const types = new Set<string>();
  let withSchema = 0;
  for (const page of readable) {
    const data = structuredDataOf(page.html);
    if (data.blocks > 0) withSchema++;
    data.types.forEach((t) => types.add(t));
  }

  return {
    ...base,
    pagesFetched: all.length,
    clientRendered: shells,
    schemaTypes: [...types],
    schemaCoverage: readable.length ? withSchema / readable.length : undefined,
    rating: readable.map((p) => ratingOf(p.html)).find(Boolean),
    sitemapUrls: sitemap.count,
    sitemapReason: sitemap.reason,
    targetedTerms: targetedTerms(readable.map((p) => p.html)),
    ...vitals,
  };
}

export interface CompetitorScanInput {
  site: Site;
  competitorDomains: string[];
  ownPaths: string[];
  queries: QueryRow[];
}

const UNAVAILABLE: UnavailableMetric[] = [
  {
    metric: "Competitor keywords & rankings",
    reason:
      "Search Console only reports properties you own. No Google API exposes another site's rankings, and there is no free source for them.",
    alternative:
      "The keyword gap below is built from terms competitors put in their own titles and headings — what they target, which is observable, rather than where they rank, which is not.",
  },
  {
    metric: "Competitor traffic",
    reason:
      "Analytics data is private to the property owner. Third-party traffic figures are modelled estimates, not measurements, and are sold by subscription.",
  },
  {
    metric: "Backlinks",
    reason:
      "No free backlink API exists. Ahrefs, Majestic, Moz and Semrush all license this data commercially, and none offers an unpaid tier that would support this comparison.",
  },
  {
    metric: "Indexed page count",
    reason:
      "Google publishes no indexed-count API, and `site:` queries are search-result scraping. The sitemap counts shown are pages each site *publishes*, which is a different and usually larger number.",
  },
];

export async function runCompetitorScan(input: CompetitorScanInput): Promise<CompetitorReport> {
  const { site, competitorDomains, ownPaths, queries } = input;

  const domains = [...new Set(competitorDomains.map((d) => d.trim().toLowerCase()).filter(Boolean))]
    .filter((d) => d !== site.domain.toLowerCase())
    .slice(0, MAX_COMPETITORS);

  const [self, ...competitors] = await Promise.all([
    profile("self", site.domain, true, ownPaths),
    ...domains.map((d, i) => profile(`c${i}`, d, false)),
  ]);
  self.name = site.name;

  // Brand-name queries would trivially favour whoever owns the brand, so the
  // prompt set is category terms only.
  const categoryQueries = queries
    .filter((q) => {
      const lower = q.keyword.toLowerCase();
      return (
        !lower.includes(site.name.toLowerCase().split(" ")[0]) &&
        !lower.includes(site.domain.split(".")[0].toLowerCase())
      );
    })
    .slice(0, 6)
    .map((q) => q.keyword);

  const targets: BrandTarget[] = [self, ...competitors].map((p) => ({
    key: p.key,
    brand: p.name,
    domain: p.domain,
  }));

  const probes = await probeBrands(categoryQueries, targets);

  // Fold probe rates back onto each profile.
  const usable = probes.filter((p) => p.status === "ok");
  for (const p of [self, ...competitors]) {
    if (usable.length === 0) continue;
    p.mentionRate =
      usable.reduce((sum, probe) => sum + (probe.rates[p.key]?.mentionRate ?? 0), 0) / usable.length;
    p.citationRate =
      usable.reduce((sum, probe) => sum + (probe.rates[p.key]?.citationRate ?? 0), 0) / usable.length;
  }

  return {
    site,
    scannedAt: new Date().toISOString(),
    self,
    competitors,
    probes,
    gaps: buildGaps(self, competitors),
    unavailable: UNAVAILABLE,
  };
}
