import type { ExtractabilitySignals } from "./analyze";

/**
 * The two composite scores.
 *
 * Both are 0–100 and both are *proxies*, which the UI states rather than
 * leaving to be assumed. A score that looks precise while measuring something
 * it cannot observe is worse than no score, because it gets acted on.
 */

/* -------------------------------------------------------------------------- */
/*  Freshness                                                                  */
/* -------------------------------------------------------------------------- */

/** Beyond this, content is old enough that most topics have moved on. */
const STALE_DAYS = 365;
/** Inside this, the page is unambiguously current. */
const FRESH_DAYS = 90;

export interface FreshnessInput {
  /** ISO date the page claims it was modified. */
  lastUpdated?: string;
  /** Signed fractional change in clicks vs the previous period. */
  trend: number;
  /** Today, injected so the score is testable and hydration-safe. */
  now: Date;
}

/**
 * How current a page looks.
 *
 * Combines the declared modification date with the traffic trend, because
 * neither alone is trustworthy. A date is self-reported and many CMSs touch it
 * on every deploy; a trend says nothing about age. Together they separate the
 * page that is genuinely stale and fading from the one that is old and still
 * performing — which does not need rewriting.
 *
 * With no date at all, the score falls back to the trend and is capped below
 * full marks: an unknown age is not a fresh one.
 */
export function freshnessScore({ lastUpdated, trend, now }: FreshnessInput): number {
  const trendBonus = Math.max(-25, Math.min(25, trend * 50));

  if (!lastUpdated) {
    // Midpoint, nudged by trend, capped — we genuinely do not know.
    return clamp(Math.round(55 + trendBonus), 0, 80);
  }

  const days = (now.getTime() - new Date(lastUpdated).getTime()) / 86_400_000;
  if (!Number.isFinite(days) || days < 0) return clamp(Math.round(55 + trendBonus), 0, 80);

  const age =
    days <= FRESH_DAYS
      ? 100
      : days >= STALE_DAYS
        ? 20
        : // Linear between the two thresholds.
          100 - ((days - FRESH_DAYS) / (STALE_DAYS - FRESH_DAYS)) * 80;

  return clamp(Math.round(age + trendBonus), 0, 100);
}

/* -------------------------------------------------------------------------- */
/*  AI answer readiness                                                        */
/* -------------------------------------------------------------------------- */

export interface AiReadinessInput {
  signals: ExtractabilitySignals;
  wordCount: number;
  schemaTypes: string[];
  hasMetaDescription: boolean;
}

/** Schema types answer engines lift from most directly. */
const ANSWER_SCHEMA = ["FAQPage", "HowTo", "QAPage", "Article", "BlogPosting", "Product", "Recipe"];

/**
 * How extractable a page is for an AI answer engine.
 *
 * ## What this is not
 *
 * It is **not** a measure of whether ChatGPT, Perplexity, Gemini or Google's AI
 * Overviews actually cite this page. Nothing measures that. No search or AI
 * provider exposes citation data, there is no API to query, and any number
 * claiming otherwise is fabricated.
 *
 * What it measures is whether the page has the properties that make content
 * quotable by such systems: an answer stated early rather than buried under a
 * preamble, headings that match how people phrase questions, structured data
 * declaring what the page is, extractable lists and tables, and cited sources.
 * Every input is a checkable fact about the HTML.
 *
 * Treat it as "is this page easy to quote", not "is this page being quoted".
 */
export function aiReadinessScore({
  signals,
  wordCount,
  schemaTypes,
  hasMetaDescription,
}: AiReadinessInput): number {
  let score = 0;

  // Structure — headings are the unit answer engines chunk content by.
  if (signals.totalHeadings >= 3) score += 15;
  else if (signals.totalHeadings >= 1) score += 7;

  // Question-shaped headings map straight onto how queries are phrased.
  if (signals.questionHeadings >= 3) score += 20;
  else if (signals.questionHeadings >= 1) score += 12;

  // A short lead means the answer is near the top rather than after the setup.
  if (signals.introWords > 0 && signals.introWords <= 120) score += 15;
  else if (signals.introWords <= 250) score += 8;

  // Lists and tables are the easiest structures to lift verbatim.
  if (signals.lists >= 1) score += 10;
  if (signals.tables >= 1) score += 5;

  // Cited sources correlate with the kind of page that gets quoted.
  if (signals.externalCitations >= 3) score += 10;
  else if (signals.externalCitations >= 1) score += 5;

  // Enough substance to be worth quoting, without rewarding padding.
  if (wordCount >= 600) score += 15;
  else if (wordCount >= 300) score += 8;

  if (schemaTypes.some((t) => ANSWER_SCHEMA.includes(t))) score += 8;
  if (hasMetaDescription) score += 2;

  return clamp(Math.round(score), 0, 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Shared banding for both scores. Drives the red / amber / green colouring. */
export function scoreBand(score: number): "good" | "fair" | "poor" {
  if (score >= 70) return "good";
  if (score >= 40) return "fair";
  return "poor";
}
