import type { Site } from "@/types";

/**
 * Technical SEO audit vocabulary.
 *
 * Plain data. The checks that produce it live in `lib/technical/checks.ts`,
 * which is `server-only` because it fetches the customer's live site and calls
 * the Search Console inspection API.
 */

/** Red / yellow / green, in that order of urgency. */
export type Severity = "critical" | "warning" | "healthy";

export const SEVERITY_RANK: Record<Severity, number> = {
  critical: 2,
  warning: 1,
  healthy: 0,
};

export type ImpactLevel = "low" | "medium" | "high" | "very-high";

/**
 * A check either ran, or it could not.
 *
 * `unavailable` and `not-configured` are kept distinct from any severity: a
 * check that could not run is not a passing check, and colouring it green would
 * claim a clean bill of health nobody verified.
 */
export type CheckStatus = Severity | "unavailable" | "not-configured";

export type CheckId =
  | "index-coverage"
  | "sitemap"
  | "robots"
  | "canonical"
  | "not-found"
  | "redirects"
  | "core-web-vitals"
  | "mobile-usability"
  | "https"
  | "schema";

export interface TechnicalIssue {
  id: string;
  check: CheckId;
  severity: Severity;
  title: string;
  /** What is wrong, in plain language. */
  description: string;
  /** The URLs this affects. Capped for display; `affectedCount` is the truth. */
  affectedPages: string[];
  affectedCount: number;
  suggestedFix: string;
  estimatedImpact: ImpactLevel;
}

export interface CheckResult {
  check: CheckId;
  label: string;
  status: CheckStatus;
  /** One-line verdict shown on the collapsed card. */
  summary: string;
  issues: TechnicalIssue[];
  /** How many URLs this check actually examined. */
  checkedPages: number;
  /** Present when `status` is `unavailable` or `not-configured`. */
  unavailableReason?: string;
}

export interface TechnicalAudit {
  site: Site;
  /** ISO timestamp of the scan. */
  scannedAt: string;
  /** URLs fetched from the live site. */
  pagesScanned: number;
  checks: CheckResult[];
  /** 0–100, weighted by severity. */
  score: number;
  counts: { critical: number; warning: number; healthy: number };
}

export const CHECK_LABELS: Record<CheckId, string> = {
  "index-coverage": "Index Coverage",
  sitemap: "Sitemap",
  robots: "Robots.txt",
  canonical: "Canonical",
  "not-found": "404 Errors",
  redirects: "Redirects",
  "core-web-vitals": "Core Web Vitals",
  "mobile-usability": "Mobile Usability",
  https: "HTTPS",
  schema: "Schema Validation",
};

/** Display order — most consequential first. */
export const CHECK_ORDER: CheckId[] = [
  "index-coverage",
  "not-found",
  "canonical",
  "redirects",
  "sitemap",
  "robots",
  "https",
  "schema",
  "core-web-vitals",
  "mobile-usability",
];
