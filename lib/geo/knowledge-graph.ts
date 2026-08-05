import "server-only";

/**
 * Google Knowledge Graph lookup.
 *
 * Uses the public Knowledge Graph Search API, which is free but needs its own
 * API key — the service account credentials the rest of the app uses are OAuth
 * and this endpoint takes a key.
 *
 * The `resultScore` it returns is a relevance ranking for the query, not a
 * measure of authority. A high score means "this entity matches what you asked
 * for", not "this entity is important". Presenting it as a quality metric would
 * be a misreading, so this only reports presence and identity.
 */

export interface KnowledgeGraphEntity {
  name: string;
  description?: string;
  detailedDescription?: string;
  url?: string;
  types: string[];
  /** Google's relevance ranking for the query — not an authority score. */
  resultScore: number;
}

export interface KnowledgeGraphResult {
  status: "found" | "not-found" | "not-configured" | "error";
  entity?: KnowledgeGraphEntity;
  reason?: string;
}

export async function lookupKnowledgeGraph(
  brand: string,
  domain: string,
): Promise<KnowledgeGraphResult> {
  const key = process.env.KNOWLEDGE_GRAPH_API_KEY ?? process.env.GOOGLE_API_KEY;
  if (!key) {
    return {
      status: "not-configured",
      reason:
        "Set KNOWLEDGE_GRAPH_API_KEY to check whether Google recognises this brand as an entity. The Knowledge Graph Search API is free — create a key in Google Cloud and enable the Knowledge Graph Search API.",
    };
  }

  try {
    const url =
      `https://kgsearch.googleapis.com/v1/entities:search` +
      `?query=${encodeURIComponent(brand)}&limit=5&indent=false&key=${key}`;

    const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      return { status: "error", reason: `Knowledge Graph API returned HTTP ${response.status}.` };
    }

    const body = (await response.json()) as {
      itemListElement?: { result?: Record<string, any>; resultScore?: number }[];
    };

    const bare = domain.replace(/^www\./i, "").toLowerCase();
    const items = body.itemListElement ?? [];

    // Prefer an entity whose own URL matches the site — a name match alone can
    // easily be a different organisation that happens to share the name.
    const byUrl = items.find((item) => {
      const entityUrl = item.result?.url;
      return typeof entityUrl === "string" && entityUrl.toLowerCase().includes(bare);
    });

    // Falling back to the top result would report a find for any brand at all.
    //
    // The endpoint ranks by loose relevance and always answers: searching
    // "The Doc Mirror" returns Michael Jackson, Julia Roberts and Barbra
    // Streisand, none of which share a word with the brand. Taking the first of
    // those would score entity recognition at full marks off a phrase match,
    // which is precisely the wrong answer — and worse than reporting nothing,
    // because it silently inflates Entity and Authority.
    //
    // So a name-only match must actually be the name: same characters once
    // case, spacing and punctuation are set aside. Entities legitimately in the
    // graph without a `url` still resolve; unrelated ones no longer do.
    const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
    const wanted = new Set([normalise(brand), normalise(bare.split(".")[0])]);
    const byName = items.find(
      (item) => typeof item.result?.name === "string" && wanted.has(normalise(item.result.name)),
    );

    const match = byUrl ?? byName;

    if (!match?.result) return { status: "not-found" };

    const result = match.result;
    return {
      status: "found",
      entity: {
        name: result.name ?? brand,
        description: result.description,
        detailedDescription: result.detailedDescription?.articleBody,
        url: result.url,
        types: Array.isArray(result["@type"]) ? result["@type"] : result["@type"] ? [result["@type"]] : [],
        resultScore: match.resultScore ?? 0,
      },
    };
  } catch (error) {
    return {
      status: "error",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
