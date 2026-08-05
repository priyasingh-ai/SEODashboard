import type { PageRow, QueryRow, Site } from "@/types";

/**
 * The Action Center's vocabulary.
 *
 * Everything here is plain data. The rules engine that produces it
 * (`lib/actions/rules.ts`) is pure and framework-free — no React, no
 * `server-only` — so it runs identically in a component, in a Route Handler, or
 * in a test. Nothing in this folder may import from `components/` or `hooks/`.
 */

export type Priority = "high" | "medium" | "low";

/** Four tiers, as specified. Ordered ascending for comparisons. */
export type Impact = "low" | "medium" | "high" | "very-high";

export const IMPACT_RANK: Record<Impact, number> = {
  low: 0,
  medium: 1,
  high: 2,
  "very-high": 3,
};

export const PRIORITY_RANK: Record<Priority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/**
 * Every rule the engine can fire.
 *
 * `not-indexed` is declared but never emitted. Indexing status is not in the
 * Search Analytics API — it needs the URL Inspection API, which is a separate
 * per-URL endpoint on a 2,000/day quota. The category exists so that wiring it
 * up later is an additive change rather than a refactor of this union and every
 * `Record<ActionCategory, …>` keyed off it.
 */
export type ActionCategory =
  | "losing-impressions"
  | "position-drop"
  | "ctr-gap"
  | "striking-distance"
  | "no-clicks"
  | "new-keyword"
  | "rising-query"
  | "not-indexed";

export type SubjectKind = "page" | "keyword";

/** One supporting number shown on the card, already formatted for display. */
export interface Evidence {
  label: string;
  value: string;
  /** Drives colour. Omit for a neutral fact. */
  tone?: "positive" | "negative";
}

export interface ActionItem {
  /** Stable across re-renders and re-fetches: `${category}:${subject}`. */
  id: string;
  category: ActionCategory;
  subjectKind: SubjectKind;
  /** The page path or the keyword itself. */
  subject: string;

  problem: string;
  whyItMatters: string;
  recommendedAction: string;

  priority: Priority;
  impact: Impact;
  /** 0–100, comparable within one site and window only. */
  opportunityScore: number;
  /**
   * Modelled additional clicks over this window if the action succeeds.
   * An estimate from a CTR curve, not a promise — see `lib/actions/scoring.ts`.
   */
  estimatedClicks: number;
  /** True when this is a loss to recover, rather than an upside to capture. */
  isRegression: boolean;

  evidence: Evidence[];
}

export interface ActionSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
  /** Rules that fired, keyed by category. Zeroes included. */
  byCategory: Record<ActionCategory, number>;
  /** Sum of `estimatedClicks` across every action. */
  estimatedClicks: number;
  /** True when the window held too little data to judge anything. */
  insufficientData: boolean;
}

export interface ActionReport {
  site: Site;
  actions: ActionItem[];
  summary: ActionSummary;
}

/** Everything the engine reads. Deliberately a subset of `SiteReportData`. */
export interface RuleInput {
  queries: QueryRow[];
  pages: PageRow[];
  /** Total clicks across the window, used to normalise opportunity scores. */
  totalClicks: number;
  totalImpressions: number;
}
