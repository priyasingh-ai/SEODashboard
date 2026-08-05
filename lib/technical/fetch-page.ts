import "server-only";

/**
 * Fetching and parsing the customer's own pages.
 *
 * Several technical checks — canonical tags, structured data, viewport,
 * redirects, 404 handling — have no API behind them. The only way to know is to
 * ask the site directly.
 *
 * That makes this the one module in the app that generates outbound traffic to
 * somebody's production server, so it is deliberately conservative: a hard
 * timeout, a small concurrency ceiling, a capped response size, and an honest
 * user agent so the requests are identifiable in their logs.
 */

/** Never wait longer than this for one page. */
const TIMEOUT_MS = 10_000;

/** Simultaneous requests to a single origin. Low on purpose — this is their server. */
const CONCURRENCY = 4;

/**
 * Stop reading after this much HTML.
 *
 * Everything these checks need — canonical, meta robots, viewport, JSON-LD —
 * lives in `<head>` or close to it. Downloading multi-megabyte pages in full
 * would waste their bandwidth and ours for no extra signal.
 */
const MAX_BYTES = 512 * 1024;

const USER_AGENT =
  "SEOPortfolioDashboard/1.0 (technical SEO audit; +https://github.com/) ";

export interface FetchedPage {
  url: string;
  /** Final status after following redirects. `0` when the request failed. */
  status: number;
  /** Redirect hops, in order. Empty when the URL resolved directly. */
  redirectChain: { from: string; to: string; status: number }[];
  finalUrl: string;
  html: string;
  contentType: string;
  /** Set when the request could not be completed at all. */
  error?: string;
  /** Milliseconds to first byte of the final response. */
  elapsedMs: number;
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const decoder = new TextDecoder();
  let out = "";
  let total = 0;

  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
  }
  // Abandon the rest of the body rather than leaving the socket draining.
  await reader.cancel().catch(() => {});
  return out;
}

/**
 * Fetch one URL, following redirects manually so the chain is observable.
 *
 * `redirect: "manual"` rather than `"follow"`: the hop sequence *is* the
 * finding for the redirect check, and the platform's automatic following
 * discards it.
 */
export async function fetchPage(url: string, maxHops = 5): Promise<FetchedPage> {
  const started = Date.now();
  const chain: FetchedPage["redirectChain"] = [];
  let current = url;

  for (let hop = 0; hop <= maxHops; hop++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT, accept: "text/html,*/*" },
      });

      const location = response.headers.get("location");
      if (response.status >= 300 && response.status < 400 && location) {
        const next = new URL(location, current).toString();
        chain.push({ from: current, to: next, status: response.status });
        current = next;
        continue;
      }

      const contentType = response.headers.get("content-type") ?? "";
      // Any text type, not just HTML. robots.txt is served as text/plain, and
      // restricting this to html silently emptied its body — which disabled
      // the "is the whole site blocked" check entirely while still reporting
      // it as passing.
      const isText = /\b(?:html|text\/|xml|json)\b/i.test(contentType);
      const html = isText ? await readCapped(response) : "";

      return {
        url,
        status: response.status,
        redirectChain: chain,
        finalUrl: current,
        html,
        contentType,
        elapsedMs: Date.now() - started,
      };
    } catch (error) {
      return {
        url,
        status: 0,
        redirectChain: chain,
        finalUrl: current,
        html: "",
        contentType: "",
        error: error instanceof Error ? error.message : String(error),
        elapsedMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  // Ran out of hops — a redirect loop, or a chain long enough to be one.
  return {
    url,
    status: 508,
    redirectChain: chain,
    finalUrl: current,
    html: "",
    contentType: "",
    error: `More than ${maxHops} redirects`,
    elapsedMs: Date.now() - started,
  };
}

/** Fetch many URLs with a fixed number of workers. */
export async function fetchPages(urls: string[]): Promise<FetchedPage[]> {
  const results: FetchedPage[] = new Array(urls.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < urls.length) {
      const index = cursor++;
      results[index] = await fetchPage(urls[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return results;
}

/* -------------------------------------------------------------------------- */
/*  Parsing                                                                    */
/* -------------------------------------------------------------------------- */

/*
 * Regex, not a DOM parser.
 *
 * Adding jsdom or cheerio to pull four tags out of a head section would be a
 * heavy dependency for the payoff. These patterns are attribute-order tolerant,
 * which is where naive HTML regexes usually break, and every consumer treats a
 * miss as "absent" rather than as an error — so the failure mode is a check
 * reporting nothing rather than reporting something wrong.
 */

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1];
}

export function canonicalOf(html: string): string | undefined {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (/rel\s*=\s*["']?canonical/i.test(tag)) return attr(tag, "href");
  }
  return undefined;
}

export function metaRobotsOf(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/name\s*=\s*["']?robots["']?/i.test(tag)) return attr(tag, "content");
  }
  return undefined;
}

export function viewportOf(html: string): string | undefined {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (/name\s*=\s*["']?viewport["']?/i.test(tag)) return attr(tag, "content");
  }
  return undefined;
}

export function titleOf(html: string): string | undefined {
  return html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
}

/** Container ids and attributes frameworks mount a client-side app into. */
const SPA_ROOTS =
  /<(?:div|main)\b[^>]*\b(?:id\s*=\s*["'](?:root|app|__next|__nuxt|q-app)["']|data-reactroot)[^>]*>\s*<\/(?:div|main)>/i;

/**
 * Does this page render its content with JavaScript?
 *
 * This matters more than it first appears. A scanner that reads raw HTML sees
 * an empty shell for a client-rendered app and will confidently report zero
 * words, no headings, no internal links, no structured data and no meta
 * description — for a page that has all of them once it runs. Reporting those
 * as findings sends people to fix problems that do not exist, and quietly
 * destroys trust in every other number on the page.
 *
 * The test is deliberately conservative: an all-but-empty body **and** scripts
 * present. A genuinely thin server-rendered page has few words but still has
 * links and markup, so it will not trip this.
 */
export function isClientRendered(html: string): boolean {
  if (!html) return false;

  const body = html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;
  const hasScripts = /<script\b/i.test(html);
  const linkCount = (body.match(/<a\b/gi) ?? []).length;

  const text = body
    .replace(NON_CONTENT_FOR_DETECTION, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text ? text.split(" ").filter((w) => /[\p{L}\p{N}]/u.test(w)).length : 0;

  if (!hasScripts) return false;
  if (SPA_ROOTS.test(body)) return true;
  // No links and almost no text, but scripts present: nothing was server-rendered.
  return words < 50 && linkCount === 0;
}

const NON_CONTENT_FOR_DETECTION =
  /<(script|style|noscript|template|svg)\b[^>]*>[\s\S]*?<\/\1>/gi;

export interface StructuredData {
  /** `@type` values found across all JSON-LD blocks. */
  types: string[];
  blocks: number;
  /** Blocks that failed to parse as JSON. */
  invalidBlocks: number;
  /** True when any non-JSON-LD markup is present. */
  hasMicrodata: boolean;
}

/**
 * Extract and validate JSON-LD.
 *
 * This checks that structured data is present and parses — it is not Google's
 * Rich Results Test, which has no public API. It can tell you a block is
 * malformed or missing; it cannot tell you Google will grant a rich result.
 * The UI says so rather than implying otherwise.
 */
export function structuredDataOf(html: string): StructuredData {
  const types = new Set<string>();
  let blocks = 0;
  let invalidBlocks = 0;

  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    blocks++;
    try {
      const parsed = JSON.parse(match[1].trim());
      const collect = (node: unknown) => {
        if (Array.isArray(node)) return node.forEach(collect);
        if (node && typeof node === "object") {
          const type = (node as Record<string, unknown>)["@type"];
          if (typeof type === "string") types.add(type);
          else if (Array.isArray(type)) type.forEach((t) => typeof t === "string" && types.add(t));
          const graph = (node as Record<string, unknown>)["@graph"];
          if (graph) collect(graph);
        }
      };
      collect(parsed);
    } catch {
      invalidBlocks++;
    }
  }

  return {
    types: [...types],
    blocks,
    invalidBlocks,
    hasMicrodata: /\bitemscope\b/i.test(html) || /\bproperty\s*=\s*["']og:/i.test(html),
  };
}

export interface RobotsTxt {
  found: boolean;
  status: number;
  body: string;
  sitemaps: string[];
  /** `Disallow: /` under a wildcard agent — blocks the whole site. */
  blocksEverything: boolean;
}

export async function fetchRobots(origin: string): Promise<RobotsTxt> {
  const page = await fetchPage(new URL("/robots.txt", origin).toString());
  const body = page.html || "";

  const sitemaps = [...body.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);

  // Only the `User-agent: *` group matters for "is the whole site blocked".
  let inWildcard = false;
  let blocksEverything = false;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (/^user-agent:/i.test(line)) inWildcard = /:\s*\*\s*$/.test(line);
    else if (inWildcard && /^disallow:\s*\/\s*$/i.test(line)) blocksEverything = true;
  }

  return {
    found: page.status === 200,
    status: page.status,
    body: body.slice(0, 4000),
    sitemaps,
    blocksEverything,
  };
}
