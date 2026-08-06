import type { Site } from "@/types";

/**
 * Generative Engine Optimisation monitoring.
 *
 * The honesty rules for this module are stricter than anywhere else in the app,
 * because GEO is the area where confident-sounding fabrication is most common
 * in commercial tools.
 *
 * 1. Anything requiring a credential the user has not supplied reports
 *    `not-configured`, never a number.
 * 2. Anything with no API behind it at all reports `unavailable` and says why.
 *    It is never estimated, modelled, or inferred from a proxy presented as the
 *    real thing.
 * 3. Scores exclude unmeasured inputs from their denominator rather than
 *    treating them as zero, and every score carries the count of signals it was
 *    actually able to read.
 */

export type SignalStatus = "good" | "partial" | "poor" | "not-configured" | "unavailable";

export interface GeoSignal {
  id: string;
  label: string;
  status: SignalStatus;
  /** One-line verdict. */
  summary: string;
  /** Supporting facts, already formatted. */
  evidence: { label: string; value: string }[];
  /**
   * Replaces the status badge's default wording, keeping its colour.
   *
   * `poor` normally renders as "Missing", which reads correctly when the signal
   * is something the site itself should carry — "Organization schema · Missing".
   * It reads wrongly when the signal is a verdict from an external service that
   * answered: "Knowledge Graph · Missing" is taken as the key being missing,
   * when the lookup in fact ran and Google simply holds no entity.
   */
  badgeLabel?: string;
  /** Present when status is not-configured or unavailable. */
  reason?: string;
  /** What to do about it. */
  suggestion?: string;
  /** 0–1 contribution when measured; `undefined` when it could not be read. */
  score?: number;
}

/** One model's response to one probe prompt. */
export interface ModelProbe {
  prompt: string;
  /** Derived from a real query the site ranks for. */
  sourceQuery: string;
  mentioned: boolean;
  /** The site's domain appeared as a cited link. */
  cited: boolean;
  /** First character offset of the brand mention, for prominence. */
  position?: number;
  excerpt?: string;
}

export type AiProvider = "openai" | "gemini" | "anthropic";

export interface ProviderResult {
  provider: AiProvider;
  label: string;
  status: "ok" | "not-configured" | "error";
  model?: string;
  probes: ModelProbe[];
  /** Share of prompts where the brand appeared, 0–1. */
  mentionRate: number;
  citationRate: number;
  reason?: string;
}

export interface GeoScore {
  id: "ai-visibility" | "entity" | "citation" | "authority" | "trust";
  label: string;
  /** 0–100, or `undefined` when nothing feeding it could be measured. */
  value?: number;
  /** Signals that fed this score. */
  inputs: string[];
  /** How many of those inputs were actually measurable. */
  measured: number;
  total: number;
  description: string;
}

export interface GeoReport {
  site: Site;
  scannedAt: string;
  /** The brand name the probes looked for. */
  brand: string;
  pagesAnalysed: number;
  providers: ProviderResult[];
  signals: GeoSignal[];
  scores: GeoScore[];
  suggestions: GeoSuggestion[];
}

export interface GeoSuggestion {
  id: string;
  priority: "high" | "medium" | "low";
  title: string;
  detail: string;
  action: string;
}
