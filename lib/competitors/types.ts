import type { Site } from "@/types";
import type { MultiBrandProbe } from "@/lib/geo/ai-visibility";

/**
 * Competitor intelligence.
 *
 * The hard constraint shaping this whole module: Google's APIs only expose
 * properties you own. A competitor's rankings, traffic and backlinks are simply
 * not obtainable without a paid third-party data provider, so they are declared
 * unavailable with the reason attached rather than estimated.
 *
 * Everything that *is* here comes from one of three real sources: crawling the
 * competitor's public pages, the Chrome UX Report (public field data for any
 * origin), or model responses scored against every brand at once.
 */

export interface CompetitorProfile {
  /** Stable key used across probes and gap rows. */
  key: string;
  /** Display name, derived from the domain. */
  name: string;
  domain: string;
  url: string;
  isSelf: boolean;

  status: "ok" | "unreachable";
  error?: string;

  pagesFetched: number;
  /** Pages served a JavaScript shell — content signals then unreadable. */
  clientRendered: number;

  schemaTypes: string[];
  /** Share of readable pages carrying structured data, 0–1. */
  schemaCoverage?: number;

  /** From their own AggregateRating markup — self-reported, not verified. */
  rating?: { value: number; count: number };

  /** URLs listed in their sitemap. Published, not necessarily indexed. */
  sitemapUrls?: number;
  sitemapReason?: string;

  /** Terms they target, extracted from titles and H1s. Not their rankings. */
  targetedTerms: string[];

  /** Chrome UX Report field data. */
  cwv?: { lcp?: number; inp?: number; cls?: number; overall?: string };
  cwvReason?: string;

  /** Populated when model probes ran. */
  mentionRate?: number;
  citationRate?: number;
}

export type GapKind = "keyword" | "content" | "technical" | "ai-visibility";

export interface GapItem {
  kind: GapKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** Which competitor this gap is measured against. */
  competitor?: string;
  recommendation: string;
}

/** A metric we deliberately do not report, and why. */
export interface UnavailableMetric {
  metric: string;
  reason: string;
  alternative?: string;
}

export interface CompetitorReport {
  site: Site;
  scannedAt: string;
  self: CompetitorProfile;
  competitors: CompetitorProfile[];
  probes: MultiBrandProbe[];
  gaps: GapItem[];
  unavailable: UnavailableMetric[];
}
