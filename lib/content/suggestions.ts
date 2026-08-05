import { formatCompact, formatPercent, formatPosition, truncatePath } from "@/lib/format";
import type { ExtractabilitySignals } from "./analyze";
import type { ContentSuggestion, ContentPageRow } from "./types";

/**
 * The six suggestion generators.
 *
 * Every suggestion is grounded in something observed: a query the page already
 * ranks for, a tag that is missing, a date that has passed. None of them
 * invents a topic the data does not support, and none claims to know why
 * something happened.
 *
 * Where a suggestion can name a specific string — a query to cover, a keyword
 * absent from the title — it does. A suggestion that says "improve your title"
 * is advice anyone could give without looking at the site.
 */

/** Google truncates titles near this width and descriptions near the second. */
const TITLE_MAX = 60;
const TITLE_MIN = 25;
const META_MAX = 160;
const META_MIN = 70;

/** Below this a page is thin enough that Google may not index it at all. */
const THIN_WORDS = 300;

/** Days before a page with declining traffic is worth revisiting. */
const REFRESH_DAYS = 365;

/** Impressions before a query is worth acting on. */
const MIN_QUERY_IMPRESSIONS = 20;

export interface PageQuery {
  query: string;
  clicks: number;
  impressions: number;
  position: number;
}

export interface SuggestionInput {
  page: ContentPageRow;
  /** Queries this specific page ranks for, from the page+query report. */
  queries: PageQuery[];
  signals: ExtractabilitySignals;
  /** Every other page in the scan, for internal-link opportunities. */
  others: { path: string; title: string; queries: PageQuery[]; clicks: number }[];
  /** Paths this page already links to. */
  linksTo: string[];
  now: Date;
}

/** Case- and punctuation-insensitive containment test. */
function mentions(haystack: string, needle: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  return norm(haystack).includes(norm(needle));
}

/** Content words, for overlap comparisons. */
const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "for", "to", "in", "of", "on", "at", "by", "with",
  "is", "are", "best", "top", "near", "me", "you", "your", "we", "our",
]);

function contentWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
  );
}

/* -------------------------------------------------------------------------- */
/*  1. Content refresh                                                         */
/* -------------------------------------------------------------------------- */

function refreshSuggestions({ page, now }: SuggestionInput): ContentSuggestion[] {
  const out: ContentSuggestion[] = [];

  if (page.wordCount > 0 && page.wordCount < THIN_WORDS && page.impressions >= 50) {
    out.push({
      kind: "refresh",
      priority: page.impressions >= 500 ? "high" : "medium",
      title: `Thin content — ${page.wordCount} words`,
      detail: `This page draws ${formatCompact(page.impressions)} impressions but carries only ${page.wordCount} words. Pages this short often fail to satisfy the query they rank for, and Google may decline to index them at all.`,
      action: `Expand toward 600+ words by answering the specific questions this page already ranks for, rather than padding. Its top queries are a ready outline.`,
    });
  }

  const age = page.lastUpdated
    ? (now.getTime() - new Date(page.lastUpdated).getTime()) / 86_400_000
    : undefined;

  if (age !== undefined && age > REFRESH_DAYS && page.impressions >= 100) {
    out.push({
      kind: "refresh",
      priority: page.clicks > 0 && page.position <= 20 ? "high" : "medium",
      title: `Not updated in ${Math.round(age / 30)} months`,
      detail: `The page reports it was last modified ${page.lastUpdated}. It still draws ${formatCompact(page.impressions)} impressions at position ${formatPosition(page.position)}, so the topic has demand — but competitors publishing more recently will gain on it.`,
      action: `Update the facts, figures and examples, then let the modified date reflect the real change. Refreshing an already-ranking page is consistently cheaper than earning a new one.`,
    });
  }

  if (page.position > 10 && page.position <= 25 && page.impressions >= 200) {
    out.push({
      kind: "refresh",
      priority: "medium",
      title: `Ranking just off page one at position ${formatPosition(page.position)}`,
      detail: `${formatCompact(page.impressions)} impressions with only ${formatCompact(page.clicks)} clicks. The demand is proven; the ranking is not quite there.`,
      action: `Deepen coverage of the queries below, strengthen internal links pointing here, and make sure the primary term appears in the title and first paragraph.`,
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  2. Internal linking                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Link opportunities from topical overlap.
 *
 * Two pages that rank for overlapping queries are about related things, which
 * is exactly the relationship an internal link should express. Overlap is
 * measured on the query sets rather than page copy, so the signal comes from
 * how searchers actually connect the topics.
 */
function internalLinkSuggestions({ page, queries, others, linksTo }: SuggestionInput): ContentSuggestion[] {
  const out: ContentSuggestion[] = [];

  if (page.inboundLinks === 0 && page.impressions >= 100) {
    out.push({
      kind: "internal-link",
      priority: page.impressions >= 500 ? "high" : "medium",
      title: "No internal links point to this page",
      detail: `Nothing in the scanned sample links here, yet the page draws ${formatCompact(page.impressions)} impressions. Orphaned pages are crawled less often and receive no ranking support from the rest of the site.`,
      action: `Link to this page from your strongest related pages, using anchor text that matches what it ranks for.`,
    });
  }

  const mine = new Set<string>();
  for (const q of queries) for (const w of contentWords(q.query)) mine.add(w);

  if (mine.size > 0) {
    const related = others
      .filter((other) => other.path !== page.path && !linksTo.includes(other.path))
      .map((other) => {
        const theirs = new Set<string>();
        for (const q of other.queries) for (const w of contentWords(q.query)) theirs.add(w);
        const shared = [...mine].filter((w) => theirs.has(w));
        return { other, shared };
      })
      .filter((r) => r.shared.length >= 2)
      .sort((a, b) => b.shared.length - a.shared.length || b.other.clicks - a.other.clicks)
      .slice(0, 3);

    for (const { other, shared } of related) {
      out.push({
        kind: "internal-link",
        priority: "low",
        title: `Link to ${truncatePath(other.path, 40)}`,
        detail: `Both pages rank for overlapping terms (${shared.slice(0, 4).join(", ")}) but this page does not link to it.`,
        action: `Add a contextual link where the topic comes up naturally, using anchor text containing "${shared[0]}".`,
      });
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  3. FAQ                                                                     */
/* -------------------------------------------------------------------------- */

const QUESTION_SHAPED = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will)\b|\?\s*$/i;

/**
 * FAQ opportunities from queries the page ranks for but never addresses.
 *
 * Originally this was going to key off question-shaped queries alone. Checking
 * the real data first killed that: across these properties question-phrased
 * queries were almost nonexistent — the traffic is commercial ("b2b video
 * production for factories"), not interrogative. A generator keyed on question
 * words would have shipped as a permanently empty panel.
 *
 * So the real signal is coverage: a query bringing people to this page that no
 * heading on it addresses. That works for commercial and informational intent
 * alike, and it names the actual phrase rather than inventing a question.
 */
function faqSuggestions({ page, queries }: SuggestionInput): ContentSuggestion[] {
  const uncovered = queries
    .filter((q) => q.impressions >= MIN_QUERY_IMPRESSIONS)
    .filter((q) => !page.headings.some((h) => mentions(h, q.query)))
    .filter((q) => !mentions(page.title, q.query))
    .sort((a, b) => {
      // Question-shaped first where they exist — they map onto FAQ format
      // directly — then by the traffic at stake.
      const aq = QUESTION_SHAPED.test(a.query) ? 1 : 0;
      const bq = QUESTION_SHAPED.test(b.query) ? 1 : 0;
      return bq - aq || b.impressions - a.impressions;
    })
    .slice(0, 5);

  if (uncovered.length === 0) return [];

  const top = uncovered[0];
  return [
    {
      kind: "faq",
      priority: top.impressions >= 200 ? "high" : "medium",
      title: `${uncovered.length} ranked ${uncovered.length === 1 ? "query is" : "queries are"} not addressed by any heading`,
      detail: `People reach this page searching for terms it never explicitly covers — for example "${top.query}" (${formatCompact(top.impressions)} impressions, position ${formatPosition(top.position)}).`,
      action: `Add a section or FAQ entry for each: ${uncovered.map((q) => `"${q.query}"`).join(", ")}. Answer in the first sentence, then elaborate — that is the shape both featured snippets and answer engines lift.`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  4. Schema                                                                  */
/* -------------------------------------------------------------------------- */

function schemaSuggestions({ page, signals }: SuggestionInput): ContentSuggestion[] {
  if (!page.schemaValid) {
    return [
      {
        kind: "schema",
        priority: "high",
        title: "Structured data is present but malformed",
        detail: "The JSON-LD on this page is not valid JSON, so search engines discard it entirely.",
        action: "Fix the JSON syntax — trailing commas and unescaped quotes are the usual causes — then re-test in Google's Rich Results Test.",
      },
    ];
  }

  if (page.schemaTypes.length > 0) {
    // Already has schema; only suggest FAQPage when the page is clearly Q&A.
    if (signals.questionHeadings >= 2 && !page.schemaTypes.includes("FAQPage")) {
      return [
        {
          kind: "schema",
          priority: "medium",
          title: "Add FAQPage schema",
          detail: `This page has ${signals.questionHeadings} question-style headings but declares ${page.schemaTypes.join(", ")} rather than FAQPage.`,
          action: "Add FAQPage JSON-LD covering the existing question headings. It is one of the few schema types that still earns expanded search results.",
        },
      ];
    }
    return [];
  }

  // Infer a plausible type from what the page looks like, and say it is a guess.
  const guess =
    signals.questionHeadings >= 2
      ? "FAQPage"
      : page.wordCount >= 600
        ? "Article"
        : "WebPage";

  return [
    {
      kind: "schema",
      priority: page.impressions >= 200 ? "medium" : "low",
      title: "No structured data",
      detail: `This page declares no JSON-LD, so it cannot qualify for any rich result. Based on its structure (${page.wordCount} words, ${signals.questionHeadings} question headings), ${guess} is the likely fit.`,
      action: `Add ${guess} JSON-LD with the required properties, plus BreadcrumbList if this page sits inside a hierarchy.`,
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  5. Title                                                                   */
/* -------------------------------------------------------------------------- */

function titleSuggestions({ page, queries }: SuggestionInput): ContentSuggestion[] {
  const out: ContentSuggestion[] = [];

  if (!page.title) {
    return [
      {
        kind: "title",
        priority: "high",
        title: "Missing title tag",
        detail: "This page has no title element, so Google writes one for it from whatever text it finds.",
        action: "Add a title under 60 characters leading with the primary term this page targets.",
      },
    ];
  }

  if (page.titleLength > TITLE_MAX) {
    out.push({
      kind: "title",
      priority: "medium",
      title: `Title is ${page.titleLength} characters and will be truncated`,
      detail: `Google typically cuts titles near ${TITLE_MAX} characters. Everything after that is invisible in results.`,
      action: `Trim to under ${TITLE_MAX} characters, keeping the primary term at the front where it survives truncation.`,
    });
  } else if (page.titleLength > 0 && page.titleLength < TITLE_MIN) {
    out.push({
      kind: "title",
      priority: "low",
      title: `Title is only ${page.titleLength} characters`,
      detail: "Short titles leave available space in the result unused and often omit terms the page ranks for.",
      action: `Extend toward ${TITLE_MAX} characters with a qualifier that matches searcher intent.`,
    });
  }

  // The strongest title signal available: a query with real volume that the
  // title does not contain.
  const missing = queries
    .filter((q) => q.impressions >= MIN_QUERY_IMPRESSIONS && !mentions(page.title, q.query))
    .sort((a, b) => b.impressions - a.impressions)[0];

  if (missing && page.ctr < 0.02 && page.impressions >= 100) {
    out.push({
      kind: "title",
      priority: "high",
      title: `Top query "${missing.query}" is missing from the title`,
      detail: `The page draws ${formatCompact(missing.impressions)} impressions for this term at position ${formatPosition(missing.position)}, but converts at only ${formatPercent(page.ctr, 2)} overall.`,
      action: `Work "${missing.query}" into the title naturally. Matching the searcher's own phrasing is the single most reliable CTR improvement available.`,
    });
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/*  6. Meta description                                                        */
/* -------------------------------------------------------------------------- */

function metaSuggestions({ page, queries }: SuggestionInput): ContentSuggestion[] {
  if (!page.metaDescription) {
    const top = queries.sort((a, b) => b.impressions - a.impressions)[0];
    return [
      {
        kind: "meta",
        priority: page.impressions >= 200 ? "high" : "medium",
        title: "No meta description",
        detail: "Google will assemble a snippet from page text instead, which is rarely the most persuasive framing of what the page offers.",
        action: top
          ? `Write 120–${META_MAX} characters answering "${top.query}" directly, since that is what most visitors are searching when they see this result.`
          : `Write 120–${META_MAX} characters describing what the page delivers, leading with the benefit.`,
      },
    ];
  }

  if (page.metaLength > META_MAX) {
    return [
      {
        kind: "meta",
        priority: "low",
        title: `Meta description is ${page.metaLength} characters`,
        detail: `Google truncates near ${META_MAX}. The closing text — usually the call to action — is being cut.`,
        action: `Trim to under ${META_MAX} characters, front-loading the most compelling reason to click.`,
      },
    ];
  }

  if (page.metaLength < META_MIN) {
    return [
      {
        kind: "meta",
        priority: "low",
        title: `Meta description is only ${page.metaLength} characters`,
        detail: "Short descriptions waste result space and give searchers less reason to choose you over the results around you.",
        action: `Extend toward ${META_MAX} characters with the specific outcome the page delivers.`,
      },
    ];
  }

  return [];
}

/* -------------------------------------------------------------------------- */
/*  Engine                                                                     */
/* -------------------------------------------------------------------------- */

const PRIORITY_RANK = { high: 2, medium: 1, low: 0 } as const;

export function buildSuggestions(input: SuggestionInput): ContentSuggestion[] {
  return [
    ...refreshSuggestions(input),
    ...internalLinkSuggestions(input),
    ...faqSuggestions(input),
    ...schemaSuggestions(input),
    ...titleSuggestions(input),
    ...metaSuggestions(input),
  ].sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority]);
}
