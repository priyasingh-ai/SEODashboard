import { formatCompact, formatPercent } from "@/lib/format";
import type { CompetitorProfile, GapItem } from "./types";

/**
 * The four gap reports.
 *
 * Each compares only things measured the same way on both sides. A gap built
 * from a number we have for ourselves and estimate for them would be worse than
 * no gap at all, because the direction of the error is unknowable.
 */

/** Terms this many competitors target before it counts as a shared theme. */
const SHARED_BY = 2;

/** Google's thresholds, for the technical comparison. */
const CWV_GOOD = { lcp: 2500, inp: 200, cls: 0.1 };

/**
 * Competitors we actually managed to read.
 *
 * A blocked or unreachable site contributes to no gap. Comparing against a
 * competitor we could not fetch would flatter us on every metric, for no reason
 * other than their server saying no.
 */
function reachable(competitors: CompetitorProfile[]): CompetitorProfile[] {
  return competitors.filter((c) => c.status === "ok" && c.pagesFetched > 0);
}

/* -------------------------------------------------------------------------- */
/*  Keyword gap                                                                */
/* -------------------------------------------------------------------------- */

function keywordGaps(self: CompetitorProfile, competitors: CompetitorProfile[]): GapItem[] {
  const rivals = reachable(competitors);
  if (rivals.length === 0 || self.targetedTerms.length === 0) return [];

  const mine = new Set(self.targetedTerms);
  const counts = new Map<string, string[]>();

  for (const rival of rivals) {
    for (const term of rival.targetedTerms) {
      if (mine.has(term)) continue;
      counts.set(term, [...(counts.get(term) ?? []), rival.name]);
    }
  }

  // Terms multiple competitors target are a theme; one competitor's is noise.
  const shared = [...counts.entries()]
    .filter(([, who]) => who.length >= Math.min(SHARED_BY, rivals.length))
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 12);

  if (shared.length === 0) return [];

  return [
    {
      kind: "keyword",
      severity: shared.length >= 6 ? "high" : "medium",
      title: `${shared.length} themes competitors title pages around that you do not`,
      detail: `Terms appearing in ${rivals.length === 1 ? "their" : "multiple competitors'"} titles and headings but absent from yours: ${shared.map(([t]) => t).slice(0, 8).join(", ")}.`,
      competitor: [...new Set(shared.flatMap(([, who]) => who))].join(", "),
      recommendation:
        "Treat these as topics to evaluate, not keywords to chase. Check each against your own Search Console impressions — if you already draw impressions for it without a page targeting it, that is the strongest case for building one.",
    },
  ];
}

/* -------------------------------------------------------------------------- */
/*  Content gap                                                                */
/* -------------------------------------------------------------------------- */

function contentGaps(self: CompetitorProfile, competitors: CompetitorProfile[]): GapItem[] {
  const rivals = reachable(competitors).filter((c) => typeof c.sitemapUrls === "number");
  const mine = self.sitemapUrls;
  if (rivals.length === 0 || typeof mine !== "number") return [];

  const gaps: GapItem[] = [];
  const bigger = rivals.filter((c) => (c.sitemapUrls ?? 0) > mine * 1.5);

  if (bigger.length > 0) {
    const largest = bigger.sort((a, b) => (b.sitemapUrls ?? 0) - (a.sitemapUrls ?? 0))[0];
    gaps.push({
      kind: "content",
      severity: (largest.sitemapUrls ?? 0) > mine * 3 ? "high" : "medium",
      title: `${largest.name} publishes ${formatCompact(largest.sitemapUrls ?? 0)} URLs against your ${formatCompact(mine)}`,
      detail: `Counted from each site's sitemap — these are pages published, not pages indexed, so the real ranking footprint may differ in either direction.`,
      competitor: largest.name,
      recommendation:
        "Volume is not the goal, coverage is. Sample their sitemap for sections you have no equivalent of, and judge whether each represents demand you are missing or filler you should not copy.",
    });
  }

  const rated = rivals.filter((c) => c.rating);
  if (rated.length > 0 && !self.rating) {
    gaps.push({
      kind: "content",
      severity: "medium",
      title: `${rated.length} competitor${rated.length === 1 ? "" : "s"} publish review ratings in structured data and you do not`,
      detail: rated
        .map((c) => `${c.name}: ${c.rating!.value}★ from ${formatCompact(c.rating!.count)} reviews`)
        .join(" · ") + ". These are self-reported by each site, not independently verified.",
      competitor: rated.map((c) => c.name).join(", "),
      recommendation:
        "Publish AggregateRating markup fed by real reviews. Star ratings in results measurably lift click-through, and the markup is what makes them eligible. Never mark up ratings you cannot substantiate — Google issues manual actions for it.",
    });
  }

  return gaps;
}

/* -------------------------------------------------------------------------- */
/*  Technical gap                                                              */
/* -------------------------------------------------------------------------- */

function technicalGaps(self: CompetitorProfile, competitors: CompetitorProfile[]): GapItem[] {
  const rivals = reachable(competitors);
  const gaps: GapItem[] = [];

  // Schema coverage — only compare where both sides were readable.
  const selfSchema = self.schemaCoverage;
  const comparable = rivals.filter((c) => typeof c.schemaCoverage === "number");

  if (typeof selfSchema === "number" && comparable.length > 0) {
    const better = comparable.filter((c) => (c.schemaCoverage ?? 0) > selfSchema + 0.2);
    if (better.length > 0) {
      gaps.push({
        kind: "technical",
        severity: selfSchema === 0 ? "high" : "medium",
        title: `Structured data coverage behind ${better.length} competitor${better.length === 1 ? "" : "s"}`,
        detail: `You: ${formatPercent(selfSchema, 0)} of pages. ${better.map((c) => `${c.name}: ${formatPercent(c.schemaCoverage ?? 0, 0)}`).join(", ")}. Types they declare that you do not: ${[...new Set(better.flatMap((c) => c.schemaTypes))].filter((t) => !self.schemaTypes.includes(t)).slice(0, 6).join(", ") || "none"}.`,
        competitor: better.map((c) => c.name).join(", "),
        recommendation:
          "Add the schema types they carry and you lack, starting with Organization and the type matching your primary page template. Structured data is how both search engines and answer engines classify a page without inferring it.",
      });
    }
  }

  // Core Web Vitals — only when field data exists for both.
  const selfCwv = self.cwv;
  const rivalCwv = rivals.filter((c) => c.cwv);
  if (selfCwv && rivalCwv.length > 0) {
    const metrics: { key: "lcp" | "inp" | "cls"; label: string; unit: string }[] = [
      { key: "lcp", label: "Largest Contentful Paint", unit: "ms" },
      { key: "inp", label: "Interaction to Next Paint", unit: "ms" },
      { key: "cls", label: "Cumulative Layout Shift", unit: "" },
    ];

    for (const metric of metrics) {
      const mine = selfCwv[metric.key];
      if (mine === undefined) continue;
      const faster = rivalCwv.filter((c) => {
        const theirs = c.cwv?.[metric.key];
        return theirs !== undefined && theirs < mine * 0.8;
      });
      if (faster.length === 0 || mine <= CWV_GOOD[metric.key]) continue;

      gaps.push({
        kind: "technical",
        severity: "medium",
        title: `${metric.label} slower than ${faster.map((c) => c.name).join(", ")}`,
        detail: `Yours: ${metric.key === "cls" ? mine.toFixed(3) : Math.round(mine) + metric.unit}, above Google's ${metric.key === "cls" ? CWV_GOOD.cls : CWV_GOOD[metric.key] + metric.unit} threshold. ${faster.map((c) => `${c.name}: ${metric.key === "cls" ? c.cwv![metric.key]!.toFixed(3) : Math.round(c.cwv![metric.key]!) + metric.unit}`).join(", ")}. Both figures are real-user Chrome data, not lab tests.`,
        competitor: faster.map((c) => c.name).join(", "),
        recommendation:
          metric.key === "lcp"
            ? "Compress and preload the hero image, and remove render-blocking CSS and fonts ahead of it."
            : metric.key === "inp"
              ? "Break up long JavaScript tasks and defer non-essential third-party scripts."
              : "Set explicit dimensions on images and embeds, and reserve space for anything injected after load.",
      });
    }
  }

  // Client-side rendering — a structural disadvantage against a rendered rival.
  if (self.clientRendered > 0 && self.pagesFetched > 0) {
    const serverRendered = rivals.filter((c) => c.clientRendered === 0 && c.pagesFetched > 0);
    if (serverRendered.length > 0) {
      gaps.push({
        kind: "technical",
        severity: "high",
        title: "Your pages render with JavaScript while competitors serve HTML directly",
        detail: `${self.clientRendered} of ${self.pagesFetched} of your pages returned an empty shell. ${serverRendered.map((c) => c.name).join(", ")} serve content in the initial response.`,
        competitor: serverRendered.map((c) => c.name).join(", "),
        recommendation:
          "Googlebot renders JavaScript, but in a separate queue that delays indexing — and most AI answer engines do not render at all. Server-render or pre-render at minimum the title, meta description, headings and canonical so every crawler sees the same page a browser does.",
      });
    }
  }

  return gaps;
}

/* -------------------------------------------------------------------------- */
/*  AI visibility gap                                                          */
/* -------------------------------------------------------------------------- */

function aiGaps(self: CompetitorProfile, competitors: CompetitorProfile[]): GapItem[] {
  if (self.mentionRate === undefined) return [];

  const rivals = competitors.filter((c) => c.mentionRate !== undefined);
  if (rivals.length === 0) return [];

  const ahead = rivals.filter((c) => (c.mentionRate ?? 0) > (self.mentionRate ?? 0) + 0.1);
  if (ahead.length === 0) {
    return [
      {
        kind: "ai-visibility",
        severity: "low",
        title: `You are mentioned at ${formatPercent(self.mentionRate, 0)}, ahead of or level with every competitor probed`,
        detail: rivals.map((c) => `${c.name}: ${formatPercent(c.mentionRate ?? 0, 0)}`).join(" · "),
        recommendation:
          "Hold the position by keeping entity markup, cited sources and direct answers current. Visibility here tracks corroboration across the web, so it decays if third-party references go stale.",
      },
    ];
  }

  const leader = ahead.sort((a, b) => (b.mentionRate ?? 0) - (a.mentionRate ?? 0))[0];
  return [
    {
      kind: "ai-visibility",
      severity: (leader.mentionRate ?? 0) > (self.mentionRate ?? 0) + 0.3 ? "high" : "medium",
      title: `${leader.name} is named ${formatPercent(leader.mentionRate ?? 0, 0)} of the time against your ${formatPercent(self.mentionRate, 0)}`,
      detail: `Measured on identical prompts and identical model responses, so the difference is what the models actually said rather than sampling noise. ${rivals.map((c) => `${c.name}: ${formatPercent(c.mentionRate ?? 0, 0)}`).join(" · ")}.`,
      competitor: ahead.map((c) => c.name).join(", "),
      recommendation:
        "Answer engines name brands they can resolve to a well-corroborated entity. Complete Organization schema with sameAs, earn consistent third-party references, and publish pages that answer the category question directly in the opening lines — that is the shape models quote.",
    },
  ];
}

/* -------------------------------------------------------------------------- */

const SEVERITY = { high: 2, medium: 1, low: 0 } as const;

export function buildGaps(self: CompetitorProfile, competitors: CompetitorProfile[]): GapItem[] {
  return [
    ...keywordGaps(self, competitors),
    ...contentGaps(self, competitors),
    ...technicalGaps(self, competitors),
    ...aiGaps(self, competitors),
  ].sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]);
}
