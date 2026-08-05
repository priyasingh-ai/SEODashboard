import type { GeoScore, GeoSignal, ProviderResult } from "./types";

/**
 * The five composite scores.
 *
 * One rule governs all of them: **unmeasured inputs are excluded from the
 * denominator, never counted as zero.** A site with no AI provider keys should
 * see "not measured", not a visibility score of 0 — the latter reads as "you
 * are invisible" when the truth is "nobody looked".
 *
 * Every score therefore carries `measured` and `total`, and the UI shows both,
 * so a 90 built on two signals is never mistaken for a 90 built on six.
 */

function average(values: number[]): number | undefined {
  if (values.length === 0) return undefined;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100);
}

/** Signals with a numeric score — the ones that could actually be read. */
function measured(signals: GeoSignal[], ids: string[]): GeoSignal[] {
  return signals.filter((s) => ids.includes(s.id) && typeof s.score === "number");
}

export function buildScores(signals: GeoSignal[], providers: ProviderResult[]): GeoScore[] {
  const usable = providers.filter((p) => p.status === "ok");

  /* ---------------------------------------------------------------------- */

  const aiVisibility: GeoScore = {
    id: "ai-visibility",
    label: "AI Visibility",
    // Mention rate across every provider that could be queried.
    value: average(usable.map((p) => p.mentionRate)),
    inputs: providers.map((p) => p.label),
    measured: usable.length,
    total: providers.length,
    description:
      "How often the brand appears unprompted in answers to category questions it ranks for. Sampled from live model APIs, not from real user conversations.",
  };

  // `sameAs` is deliberately NOT an input here, though it is one for Entity and
  // Authority. Social profile links are an identity signal, not a citation
  // signal, and including them let a site with zero pages citing any source
  // still score 50 for Citation purely on its LinkedIn link.
  const citationIds = ["schema-citations"];
  const citationSignals = measured(signals, citationIds);
  const citation: GeoScore = {
    id: "citation",
    label: "Citation",
    value: average([
      ...usable.map((p) => p.citationRate),
      ...citationSignals.map((s) => s.score!),
    ]),
    inputs: [...providers.map((p) => p.label), "Outbound sources"],
    measured: usable.length + citationSignals.length,
    total: providers.length + citationIds.length,
    description:
      "How often the site's own domain is cited as a source in model answers, plus whether its content cites sources itself — a pattern answer engines favour.",
  };

  const entityIds = ["organization-schema", "entity-consistency", "knowledge-graph", "sameas"];
  const entitySignals = measured(signals, entityIds);
  const entity: GeoScore = {
    id: "entity",
    label: "Entity",
    value: average(entitySignals.map((s) => s.score!)),
    inputs: ["Organization schema", "Cross-page consistency", "Knowledge Graph", "sameAs profiles"],
    measured: entitySignals.length,
    total: entityIds.length,
    description:
      "Whether the brand is declared as a machine-readable entity, consistently, and recognised by Google's Knowledge Graph.",
  };

  const authorityIds = ["knowledge-graph", "sameas", "schema-coverage"];
  const authoritySignals = measured(signals, authorityIds);
  const authority: GeoScore = {
    id: "authority",
    label: "Authority",
    value: average([
      ...authoritySignals.map((s) => s.score!),
      ...usable.map((p) => p.mentionRate),
    ]),
    inputs: ["Knowledge Graph", "sameAs profiles", "Schema coverage", "Model recognition"],
    measured: authoritySignals.length + usable.length,
    total: authorityIds.length + providers.length,
    description:
      "Built from entity recognition and model familiarity — deliberately not a backlink metric. No free API exposes link authority, so this measures what can actually be read rather than approximating Domain Rating.",
  };

  const trustIds = ["trust-pages", "nap-consistency", "author-markup"];
  const trustSignals = measured(signals, trustIds);
  const trust: GeoScore = {
    id: "trust",
    label: "Trust",
    value: average(trustSignals.map((s) => s.score!)),
    inputs: ["About / contact / privacy", "NAP consistency", "Author markup"],
    measured: trustSignals.length,
    total: trustIds.length,
    description:
      "The verifiable-identity signals answer engines weigh before citing a source: who runs the site, how to reach them, and whether content is attributed.",
  };

  return [aiVisibility, entity, citation, authority, trust];
}
