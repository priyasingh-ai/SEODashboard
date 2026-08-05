import "server-only";

import type { PageRow, Site, Website } from "@/types";
import { inspectUrl, queriesByPage, type GscUrlInspection } from "@/lib/search-console";
import {
  fetchPages,
  isClientRendered,
  structuredDataOf,
  type FetchedPage,
} from "@/lib/technical/fetch-page";
import {
  extractabilityOf,
  headingsOf,
  internalLinksOf,
  lastUpdatedOf,
  metaDescriptionOf,
  wordCountOf,
} from "./analyze";
import { aiReadinessScore, freshnessScore } from "./scoring";
import { buildSuggestions, type PageQuery } from "./suggestions";
import type { ContentHealthReport, ContentPageRow, IndexStatus } from "./types";

/**
 * Orchestrates a content health scan.
 *
 * Same bounded, on-demand contract as the technical audit, for the same
 * reasons: it fetches the customer's live pages and spends Search Console's
 * URL Inspection quota. Pages are chosen by clicks so the sample is the part of
 * the site that earns traffic.
 */

const MAX_PAGES = 25;
const INSPECT_CONCURRENCY = 4;

export interface ContentScanInput {
  site: Site;
  website: Website;
  /** Landing pages from the Search Console report, ranked by clicks. */
  pages: PageRow[];
  range: { from: string; to: string };
}

/** Normalise any URL or path to a comparable path key. */
function pathKey(value: string, origin: string): string {
  try {
    return new URL(value, origin).pathname.replace(/\/$/, "") || "/";
  } catch {
    return value;
  }
}

function indexStatusOf(inspection: GscUrlInspection | undefined): {
  status: IndexStatus;
  detail: string;
} {
  if (!inspection) return { status: "unknown", detail: "Not inspected" };
  if (inspection.robotsTxtState === "DISALLOWED") {
    return { status: "blocked", detail: "Blocked by robots.txt" };
  }
  if (inspection.indexingState === "BLOCKED_BY_META_TAG") {
    return { status: "blocked", detail: "noindex tag" };
  }
  if (inspection.verdict === "PASS") {
    return { status: "indexed", detail: inspection.coverageState };
  }
  return { status: "not-indexed", detail: inspection.coverageState };
}

async function inspectAll(property: string, urls: string[]): Promise<Map<string, GscUrlInspection>> {
  const map = new Map<string, GscUrlInspection>();
  let cursor = 0;

  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      try {
        map.set(url, await inspectUrl(property, url));
      } catch {
        // A single failure must not lose the whole scan.
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(INSPECT_CONCURRENCY, urls.length) }, worker));
  return map;
}

export async function runContentScan(input: ContentScanInput): Promise<ContentHealthReport> {
  const { site, website, pages, range } = input;
  const origin = site.url;

  const selected = pages.slice(0, MAX_PAGES);
  const urls = selected
    .map((p) => {
      try {
        return new URL(p.page, origin).toString();
      } catch {
        return undefined;
      }
    })
    .filter((u): u is string => Boolean(u));

  const [fetched, inspections, queryMap] = await Promise.all([
    fetchPages(urls),
    inspectAll(website.searchConsoleProperty, urls),
    queriesByPage(website.searchConsoleProperty, range).catch(
      () => new Map<string, PageQuery[]>(),
    ),
  ]);

  const byUrl = new Map<string, FetchedPage>(fetched.map((p) => [p.url, p]));

  // Query data is keyed by absolute URL, page data by path — reconcile once so
  // both www and non-www hosts on the same property line up.
  const queriesByPath = new Map<string, PageQuery[]>();
  for (const [url, queries] of queryMap) {
    const key = pathKey(url, origin);
    queriesByPath.set(key, [...(queriesByPath.get(key) ?? []), ...queries]);
  }

  // Pass one: parse every page so the link graph exists before scoring.
  const parsed = selected.map((row, i) => {
    const url = urls[i];
    const page = byUrl.get(url);
    const html = page?.html ?? "";
    const key = pathKey(row.page, origin);

    return {
      row,
      url,
      key,
      page,
      html,
      links: html ? internalLinksOf(html, origin) : [],
      queries: queriesByPath.get(key) ?? [],
    };
  });

  // Inbound counts, within the scanned sample only.
  const inbound = new Map<string, number>();
  for (const entry of parsed) {
    for (const target of entry.links) {
      if (target === entry.key) continue; // self-links are not endorsements
      inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }
  }

  const now = new Date();

  const rows: ContentPageRow[] = parsed.map((entry) => {
    const { row, url, key, page, html, links, queries } = entry;
    const structured = structuredDataOf(html);
    const signals = extractabilityOf(html, origin);
    const updated = lastUpdatedOf(html);
    const { status, detail } = indexStatusOf(inspections.get(url));

    const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "";
    const metaDescription = metaDescriptionOf(html);
    const wordCount = wordCountOf(html);

    const base: ContentPageRow = {
      url,
      path: key,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
      indexStatus: status,
      indexDetail: detail,
      wordCount,
      title,
      titleLength: title.length,
      metaDescription,
      metaLength: metaDescription.length,
      headings: headingsOf(html),
      lastUpdated: updated?.date,
      lastUpdatedSource: updated?.source,
      outboundLinks: links.length,
      inboundLinks: inbound.get(key) ?? 0,
      schemaTypes: structured.types,
      schemaValid: structured.invalidBlocks === 0,
      freshnessScore: freshnessScore({ lastUpdated: updated?.date, trend: row.trend, now }),
      aiReadinessScore: aiReadinessScore({
        signals,
        wordCount,
        schemaTypes: structured.types,
        hasMetaDescription: Boolean(metaDescription),
      }),
      suggestions: [],
      fetchError: page?.error ?? (page && page.status !== 200 ? `HTTP ${page.status}` : undefined),
    };

    // A page we could not read yields no content signals; suggesting a title
    // rewrite for a URL that 500s would be noise on top of a real problem.
    if (base.fetchError) return base;

    // A client-rendered shell is not a thin page. Every content metric here is
    // unmeasurable rather than zero, so the row carries one honest suggestion
    // instead of the seven false ones the empty HTML would otherwise produce.
    if (isClientRendered(html)) {
      base.clientRendered = true;
      base.suggestions = [
        {
          kind: "refresh",
          priority: "medium",
          title: "Content is rendered by JavaScript",
          detail:
            "The HTML served for this URL contains no readable content — it is an empty shell that the browser fills in by running JavaScript. This scan reads raw HTML, so word count, headings, internal links, structured data and meta description cannot be measured here. They are unknown, not missing.",
          action:
            "Googlebot does execute JavaScript, so this is not fatal — but rendering is queued separately and can delay indexing by days. Many other crawlers, and most AI answer engines, do not run JavaScript at all. Server-rendering or pre-rendering at least the title, meta description, headings and canonical would make the page legible to all of them.",
        },
      ];
      return base;
    }

    base.suggestions = buildSuggestions({
      page: base,
      queries,
      signals,
      others: parsed
        .filter((o) => o.key !== key && !o.page?.error)
        .map((o) => ({
          path: o.key,
          title: o.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? o.key,
          queries: o.queries,
          clicks: o.row.clicks,
        })),
      linksTo: links,
      now,
    });

    return base;
  });

  return {
    site,
    scannedAt: now.toISOString(),
    pages: rows.sort((a, b) => b.impressions - a.impressions),
    requested: urls.length,
    fetched: rows.filter((r) => !r.fetchError).length,
    // Client-rendered rows are excluded from every content total. Counting them
    // would report a scanner limitation as a site-wide content problem.
    totals: (() => {
      const measurable = rows.filter((r) => !r.fetchError && !r.clientRendered);
      return {
        thinPages: measurable.filter((r) => r.wordCount < 300).length,
        stalePages: measurable.filter((r) => r.freshnessScore < 40).length,
        missingSchema: measurable.filter((r) => r.schemaTypes.length === 0).length,
        missingMeta: measurable.filter((r) => !r.metaDescription).length,
        orphanPages: measurable.filter((r) => r.inboundLinks === 0).length,
        // Index status comes from Search Console, so it is valid regardless of
        // how the page renders.
        notIndexed: rows.filter(
          (r) => r.indexStatus === "not-indexed" || r.indexStatus === "blocked",
        ).length,
      };
    })(),
    clientRendered: rows.filter((r) => r.clientRendered).length,
  };
}
