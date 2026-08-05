import "server-only";

import type { AiProvider, ModelProbe, ProviderResult } from "./types";

/**
 * Measuring whether AI assistants mention a brand.
 *
 * ## What this actually measures, and what it cannot
 *
 * It runs real prompts against real model APIs and checks whether the brand and
 * its domain appear in the answers. That is genuine measurement, not a proxy.
 *
 * It is **not** a measure of how often real users see the brand in real
 * conversations. No provider exposes that; there is no impressions API for
 * ChatGPT. What is being sampled is how a model responds to a defined prompt
 * set, at a moment in time, on one model version.
 *
 * Three properties of that sampling matter enough to surface in the UI:
 *
 * - **It is non-deterministic.** The same prompt returns different answers.
 *   A single run is noise, so each prompt is run `RUNS_PER_PROMPT` times and the
 *   result is a rate with its sample size attached.
 * - **Web access changes everything.** A model answering from training data
 *   describes the world as of its cutoff; the same model with search answers
 *   from live results. These are different measurements and the model name is
 *   reported alongside the score.
 * - **Prompts decide the answer.** Ask a leading question and any brand looks
 *   visible. Prompts here are derived from queries the site genuinely ranks for
 *   in Search Console, and never mention the brand.
 *
 * Nothing runs without an explicit API key, and each call costs the key owner
 * money — so the prompt set is capped hard.
 */

/** Distinct queries probed per scan. */
const MAX_PROMPTS = 6;

/** Repeats per prompt. Enough to distinguish "never" from "sometimes". */
const RUNS_PER_PROMPT = 3;

const TIMEOUT_MS = 30_000;

/**
 * Turn a search query into a neutral question.
 *
 * Deliberately does not name the brand. Asking "is Acme a good agency" almost
 * guarantees Acme appears in the answer and would measure nothing but the
 * prompt. Asking the category question is what a real prospective customer
 * types, and whether the brand surfaces unprompted is the whole signal.
 */
function toPrompt(query: string): string {
  const q = query.trim();
  if (/^(who|what|which|how|where|why|when)\b/i.test(q) || q.endsWith("?")) {
    return q.endsWith("?") ? q : `${q}?`;
  }
  return `Recommend the leading options for "${q}". Name specific companies or websites and cite your sources.`;
}

export interface ProbeInput {
  /** Top queries from Search Console, ranked by impressions. */
  queries: string[];
  brand: string;
  domain: string;
}

function detect(answer: string, brand: string, domain: string): Omit<ModelProbe, "prompt" | "sourceQuery"> {
  const haystack = answer.toLowerCase();
  const needle = brand.toLowerCase();

  const index = haystack.indexOf(needle);
  const bare = domain.replace(/^www\./i, "").toLowerCase();

  return {
    mentioned: index >= 0,
    cited: haystack.includes(bare),
    position: index >= 0 ? index : undefined,
    excerpt:
      index >= 0
        ? answer.slice(Math.max(0, index - 60), Math.min(answer.length, index + 120)).trim()
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/*  Providers                                                                  */
/* -------------------------------------------------------------------------- */

interface ProviderConfig {
  provider: AiProvider;
  label: string;
  envKey: string;
  defaultModel: string;
  ask(prompt: string, apiKey: string, model: string): Promise<string>;
}

/** Attempts per call. One retry covers a transient blip without doubling cost. */
const MAX_ATTEMPTS = 3;

/**
 * Is this worth trying again?
 *
 * A scan makes `MAX_PROMPTS * RUNS_PER_PROMPT` sequential calls per provider and
 * one rejection fails the whole provider — so a single dropped connection on
 * call 14 of 18 discards thirteen good samples and reports the provider as
 * broken. Node surfaces DNS and connection failures as a bare `fetch failed`,
 * which on a flaky network is common enough to be worth absorbing.
 *
 * Deliberately narrow: only network faults, rate limits and 5xx retry. A 401 or
 * 400 means the key or the request is wrong, and repeating it just burns quota
 * to arrive at the same answer more slowly.
 */
function isTransient(error: unknown): boolean {
  if (error instanceof Error && error.name === "TimeoutError") return true;
  const message = error instanceof Error ? error.message : String(error);
  if (/^HTTP (429|5\d\d)\b/.test(message)) return true;
  return /fetch failed|network|ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|socket hang up/i.test(
    message,
  );
}

async function postJson(url: string, init: RequestInit): Promise<any> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt === MAX_ATTEMPTS || !isTransient(error)) throw error;
      // Back off before retrying — an immediate retry tends to hit the same
      // dead socket, and a 429 needs time to clear regardless.
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }

  throw lastError;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "openai",
    label: "ChatGPT",
    envKey: "OPENAI_API_KEY",
    defaultModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    async ask(prompt, apiKey, model) {
      const body = await postJson("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 700 }),
      });
      return body.choices?.[0]?.message?.content ?? "";
    },
  },
  {
    provider: "gemini",
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    defaultModel: process.env.GEMINI_MODEL ?? "gemini-2.0-flash",
    async ask(prompt, apiKey, model) {
      const body = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        },
      );
      return (body.candidates?.[0]?.content?.parts ?? [])
        .map((p: { text?: string }) => p.text ?? "")
        .join("");
    },
  },
  {
    provider: "anthropic",
    label: "Claude",
    envKey: "ANTHROPIC_API_KEY",
    defaultModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    async ask(prompt, apiKey, model) {
      const body = await postJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 700,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      return (body.content ?? []).map((c: { text?: string }) => c.text ?? "").join("");
    },
  },
];

async function runProvider(config: ProviderConfig, input: ProbeInput): Promise<ProviderResult> {
  const apiKey = process.env[config.envKey];

  const base: ProviderResult = {
    provider: config.provider,
    label: config.label,
    status: "not-configured",
    probes: [],
    mentionRate: 0,
    citationRate: 0,
  };

  if (!apiKey) {
    return {
      ...base,
      reason: `Set ${config.envKey} to measure ${config.label} visibility. Each scan makes ${MAX_PROMPTS * RUNS_PER_PROMPT} API calls, billed to that key.`,
    };
  }

  const prompts = input.queries.slice(0, MAX_PROMPTS);
  if (prompts.length === 0) {
    return { ...base, status: "error", reason: "No Search Console queries available to build prompts from." };
  }

  const probes: ModelProbe[] = [];
  try {
    for (const query of prompts) {
      const prompt = toPrompt(query);
      for (let run = 0; run < RUNS_PER_PROMPT; run++) {
        const answer = await config.ask(prompt, apiKey, config.defaultModel);
        probes.push({
          prompt,
          sourceQuery: query,
          ...detect(answer, input.brand, input.domain),
        });
      }
    }
  } catch (error) {
    return {
      ...base,
      status: "error",
      probes,
      reason: error instanceof Error ? error.message : String(error),
    };
  }

  const mentioned = probes.filter((p) => p.mentioned).length;
  const cited = probes.filter((p) => p.cited).length;

  return {
    provider: config.provider,
    label: config.label,
    status: "ok",
    model: config.defaultModel,
    probes,
    mentionRate: probes.length ? mentioned / probes.length : 0,
    citationRate: probes.length ? cited / probes.length : 0,
  };
}

export interface BrandTarget {
  key: string;
  brand: string;
  domain: string;
}

export interface MultiBrandProbe {
  provider: AiProvider;
  label: string;
  status: "ok" | "not-configured" | "error";
  model?: string;
  runs: number;
  /** Mention and citation rate per brand key. */
  rates: Record<string, { mentionRate: number; citationRate: number }>;
  reason?: string;
}

/**
 * Ask one prompt set and score several brands against the same answers.
 *
 * This is the only fair way to compare visibility. Probing each brand
 * separately would compare responses to different prompts on different runs of
 * a non-deterministic model, and any gap could be sampling noise. Scoring every
 * brand against the *same* generated text means a difference in mention rate is
 * a difference in what the model actually said.
 */
export async function probeBrands(
  queries: string[],
  targets: BrandTarget[],
): Promise<MultiBrandProbe[]> {
  const prompts = queries.slice(0, MAX_PROMPTS);

  return Promise.all(
    PROVIDERS.map(async (config): Promise<MultiBrandProbe> => {
      const apiKey = process.env[config.envKey];
      const empty = Object.fromEntries(
        targets.map((t) => [t.key, { mentionRate: 0, citationRate: 0 }]),
      );

      if (!apiKey) {
        return {
          provider: config.provider,
          label: config.label,
          status: "not-configured",
          runs: 0,
          rates: empty,
          reason: `Set ${config.envKey} to compare ${config.label} visibility.`,
        };
      }
      if (prompts.length === 0) {
        return {
          provider: config.provider,
          label: config.label,
          status: "error",
          runs: 0,
          rates: empty,
          reason: "No Search Console queries available to build prompts from.",
        };
      }

      const hits = Object.fromEntries(targets.map((t) => [t.key, { m: 0, c: 0 }]));
      let runs = 0;

      try {
        for (const query of prompts) {
          const prompt = toPrompt(query);
          for (let run = 0; run < RUNS_PER_PROMPT; run++) {
            const answer = await config.ask(prompt, apiKey, config.defaultModel);
            runs++;
            for (const target of targets) {
              const found = detect(answer, target.brand, target.domain);
              if (found.mentioned) hits[target.key].m++;
              if (found.cited) hits[target.key].c++;
            }
          }
        }
      } catch (error) {
        return {
          provider: config.provider,
          label: config.label,
          status: "error",
          runs,
          rates: empty,
          reason: error instanceof Error ? error.message : String(error),
        };
      }

      return {
        provider: config.provider,
        label: config.label,
        status: "ok",
        model: config.defaultModel,
        runs,
        rates: Object.fromEntries(
          targets.map((t) => [
            t.key,
            {
              mentionRate: runs ? hits[t.key].m / runs : 0,
              citationRate: runs ? hits[t.key].c / runs : 0,
            },
          ]),
        ),
      };
    }),
  );
}

export async function probeAllProviders(input: ProbeInput): Promise<ProviderResult[]> {
  // Across providers in parallel, sequential within each — three vendors'
  // rate limits are independent, one vendor's is not.
  return Promise.all(PROVIDERS.map((config) => runProvider(config, input)));
}

export { MAX_PROMPTS, RUNS_PER_PROMPT };
