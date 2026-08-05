import type { Site } from "@/types";

/**
 * Content health vocabulary.
 *
 * Plain data. Analysis lives in `analyze.ts` / `suggestions.ts`, and the
 * fetching orchestration in `scan.ts`, which is `server-only`.
 */

export type IndexStatus = "indexed" | "not-indexed" | "blocked" | "unknown";

/** Where a "last updated" date came from — every source is self-reported. */
export type DateSource = "meta" | "json-ld" | "http-header" | "sitemap";

export type SuggestionKind =
  | "refresh"
  | "internal-link"
  | "faq"
  | "schema"
  | "title"
  | "meta";

export type SuggestionPriority = "high" | "medium" | "low";

export interface ContentSuggestion {
  kind: SuggestionKind;
  priority: SuggestionPriority;
  /** One-line statement of the gap. */
  title: string;
  /** The evidence behind it. */
  detail: string;
  /** A concrete thing to write or add, when the data supports being specific. */
  action?: string;
}

export interface ContentPageRow {
  url: string;
  /** Path only, for display and sorting. */
  path: string;

  // Search Console
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;

  indexStatus: IndexStatus;
  /** Google's own wording, e.g. "Submitted and indexed". */
  indexDetail: string;

  // Page content
  wordCount: number;
  title: string;
  titleLength: number;
  metaDescription: string;
  metaLength: number;
  headings: string[];

  /** ISO date, when the page declares one. */
  lastUpdated?: string;
  lastUpdatedSource?: DateSource;

  /** Internal links found on this page. */
  outboundLinks: number;
  /**
   * Links to this page from other pages in the scanned sample.
   *
   * Not a site-wide inbound count — that needs a full crawl. The UI says so,
   * because an unqualified "3 internal links" would read as a site-wide fact.
   */
  inboundLinks: number;

  schemaTypes: string[];
  schemaValid: boolean;

  /** 0–100. How current the page is. */
  freshnessScore: number;
  /** 0–100. How extractable the page is for AI answer engines. */
  aiReadinessScore: number;

  suggestions: ContentSuggestion[];

  /** Set when the page could not be fetched. Other fields are then zeroed. */
  fetchError?: string;

  /**
   * The page renders its content with JavaScript, so the raw HTML is a shell.
   *
   * When true, every content-derived field on this row is unmeasurable rather
   * than zero, and the UI must present it that way — a client-rendered page
   * reporting "0 words, no schema, no links" is a scanner limitation, not a
   * finding about the site.
   */
  clientRendered?: boolean;
}

export interface ContentHealthReport {
  site: Site;
  scannedAt: string;
  pages: ContentPageRow[];
  /** Pages requested vs actually fetched. */
  requested: number;
  fetched: number;
  /** Of those fetched, how many served a JavaScript shell rather than content. */
  clientRendered: number;
  totals: {
    thinPages: number;
    stalePages: number;
    missingSchema: number;
    missingMeta: number;
    orphanPages: number;
    notIndexed: number;
  };
}

export const SUGGESTION_LABELS: Record<SuggestionKind, string> = {
  refresh: "Content refresh",
  "internal-link": "Internal linking",
  faq: "FAQ",
  schema: "Schema",
  title: "Title",
  meta: "Meta description",
};
