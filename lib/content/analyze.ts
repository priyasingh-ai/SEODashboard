import "server-only";

import type { DateSource } from "./types";

/**
 * Extracting content signals from a page's HTML.
 *
 * Same regex-over-parser tradeoff as `lib/technical/fetch-page.ts`, and for the
 * same reason: pulling a dozen signals out of a document does not justify a DOM
 * dependency, and every consumer treats a miss as "absent" rather than an error.
 *
 * The word count is the part most likely to surprise, so it is documented at
 * the function rather than left to look precise.
 */

/** Elements whose text is chrome, not content, and must not inflate word count. */
const NON_CONTENT = /<(script|style|nav|header|footer|noscript|svg|template|form|aside)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * Approximate word count of the page's readable body.
 *
 * Approximate by construction. Boilerplate removal is heuristic — there is no
 * reliable way to isolate "the article" across arbitrary templates without
 * rendering, and a nav-heavy page will still count some chrome. It is
 * consistent enough to compare pages on the same site against each other, which
 * is what the thin-content check needs; treat it as an order of magnitude, not
 * a figure to quote.
 */
export function wordCountOf(html: string): number {
  const text = html
    .replace(NON_CONTENT, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    // Entities become spaces rather than letters, so `&nbsp;` is not a word.
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!text) return 0;
  return text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Visible text of every h1–h3, in document order. */
export function headingsOf(html: string): string[] {
  const out: string[] = [];
  for (const match of html.matchAll(/<h([1-3])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

export function metaDescriptionOf(html: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/name\s*=\s*["']?description["']?/i.test(tag)) {
      return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? "";
    }
  }
  return "";
}

/**
 * Internal links on the page, deduplicated by target path.
 *
 * Deduplicated because a template that links to the same hub from a nav, a
 * breadcrumb and a footer has one editorial relationship, not three, and
 * counting each would make every page look equally well linked.
 */
export function internalLinksOf(html: string, origin: string): string[] {
  const base = (() => {
    try {
      return new URL(origin);
    } catch {
      return undefined;
    }
  })();
  if (!base) return [];

  const targets = new Set<string>();
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = tag.match(/href\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!href || href.startsWith("#") || /^(mailto|tel|javascript):/i.test(href)) continue;

    try {
      const resolved = new URL(href, origin);
      // Same registrable host, ignoring www — nextdot serves pages on both.
      const strip = (h: string) => h.replace(/^www\./i, "").toLowerCase();
      if (strip(resolved.host) !== strip(base.host)) continue;
      targets.add(resolved.pathname.replace(/\/$/, "") || "/");
    } catch {
      /* unparseable href */
    }
  }
  return [...targets];
}

export interface LastUpdated {
  date: string;
  source: DateSource;
}

/**
 * When the page says it was last modified.
 *
 * Every available source is self-reported and none is verifiable:
 * `article:modified_time` and JSON-LD `dateModified` are whatever the CMS
 * wrote, and `Last-Modified` is frequently just the time the CDN cached the
 * response. They are checked most-trustworthy first, and the source is carried
 * alongside the date so the UI can show where the claim came from rather than
 * presenting it as fact.
 */
export function lastUpdatedOf(html: string, httpLastModified?: string): LastUpdated | undefined {
  const iso = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return undefined;
    // Reject obvious nonsense — future dates and pre-web timestamps.
    const year = parsed.getUTCFullYear();
    if (year < 1995 || parsed.getTime() > Date.now() + 86_400_000) return undefined;
    return parsed.toISOString().slice(0, 10);
  };

  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/(?:property|name)\s*=\s*["']?(?:article:modified_time|og:updated_time|last-modified)["']?/i.test(tag)) {
      const date = iso(tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]);
      if (date) return { date, source: "meta" };
    }
  }

  const jsonLd = html.match(/"dateModified"\s*:\s*"([^"]+)"/i)?.[1];
  const fromJsonLd = iso(jsonLd);
  if (fromJsonLd) return { date: fromJsonLd, source: "json-ld" };

  const fromHeader = iso(httpLastModified);
  if (fromHeader) return { date: fromHeader, source: "http-header" };

  return undefined;
}

/** Signals that make a page easy for an answer engine to quote. */
export interface ExtractabilitySignals {
  /** Headings phrased as questions — the shape answer engines lift directly. */
  questionHeadings: number;
  totalHeadings: number;
  /** Bulleted or numbered lists. */
  lists: number;
  tables: number;
  /** Outbound links to other domains, a rough proxy for citing sources. */
  externalCitations: number;
  /** Words before the first h2 — a long preamble buries the answer. */
  introWords: number;
}

const QUESTION_HEADING = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|will)\b|\?\s*$/i;

export function extractabilityOf(html: string, origin: string): ExtractabilitySignals {
  const headings = headingsOf(html);

  const beforeFirstH2 = html.split(/<h2\b/i)[0] ?? "";

  let externalCitations = 0;
  const base = (() => {
    try {
      return new URL(origin).host.replace(/^www\./i, "").toLowerCase();
    } catch {
      return "";
    }
  })();
  for (const tag of html.match(/<a\b[^>]*>/gi) ?? []) {
    const href = tag.match(/href\s*=\s*["']([^"']*)["']/i)?.[1];
    if (!href?.startsWith("http")) continue;
    try {
      const host = new URL(href).host.replace(/^www\./i, "").toLowerCase();
      if (host && host !== base) externalCitations++;
    } catch {
      /* ignore */
    }
  }

  return {
    questionHeadings: headings.filter((h) => QUESTION_HEADING.test(h)).length,
    totalHeadings: headings.length,
    lists: (html.match(/<[uo]l\b/gi) ?? []).length,
    tables: (html.match(/<table\b/gi) ?? []).length,
    externalCitations,
    introWords: wordCountOf(beforeFirstH2),
  };
}
