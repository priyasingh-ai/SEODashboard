import "server-only";

import type { QueryRow, Site, Website } from "@/types";
import { queriesByPage } from "@/lib/search-console";
import { fetchPages, isClientRendered, structuredDataOf } from "@/lib/technical/fetch-page";
import { formatPercent } from "@/lib/format";
import { probeAllProviders, MAX_PROMPTS, RUNS_PER_PROMPT } from "./ai-visibility";
import { lookupKnowledgeGraph } from "./knowledge-graph";
import { napOf, organizationOf, trustSignalsOf, type OrganizationEntity } from "./entity";
import { buildScores } from "./scoring";
import type { GeoReport, GeoSignal, GeoSuggestion } from "./types";

/** Pages read per scan — enough to judge consistency without a full crawl. */
const MAX_PAGES = 12;

/**
 * Hosts whose outbound links are template furniture rather than citations.
 *
 * Social buttons, payment badges, app-store links, CDNs and platform
 * attribution appear in the footer of nearly every commercial site. Treating
 * them as "cites external sources" makes the signal meaningless.
 */
const NON_EDITORIAL_HOSTS = [
  "facebook.com", "instagram.com", "twitter.com", "x.com", "linkedin.com",
  "youtube.com", "pinterest.com", "tiktok.com", "whatsapp.com", "t.me",
  "shopify.com", "wordpress.org", "wix.com", "squarespace.com", "webflow.com",
  "paypal.com", "stripe.com", "razorpay.com", "visa.com", "mastercard.com",
  "apps.apple.com", "play.google.com",
  "googletagmanager.com", "google-analytics.com", "gstatic.com", "googleapis.com",
  "cloudflare.com", "jsdelivr.net", "unpkg.com",
];

export interface GeoScanInput {
  site: Site;
  website: Website;
  /** Landing page paths, ranked by clicks. */
  pages: string[];
  /** Top queries, for building neutral category prompts. */
  queries: QueryRow[];
  range: { from: string; to: string };
}

function signal(s: GeoSignal): GeoSignal {
  return s;
}

/** Asset and service subdomains, which are never editorial references. */
const SERVICE_SUBDOMAIN = /^(cdn\d*|api|assets?|static|img|images|media|files|monorail[-\w]*)\./i;

/**
 * Does this page cite an external source editorially?
 *
 * A denylist alone cannot answer this — checking a real store surfaced
 * `wa.me`, `pin.it`, `judge.me`, `vitals.app` and `appsolve.io`, and the tail
 * of review widgets, chat apps and CDNs is effectively endless. Every one of
 * them would have registered as "cites sources".
 *
 * So the test is positive rather than exclusionary: a citation is a link whose
 * **anchor text reads like a reference** — several words of prose. Icons, logos
 * and asset URLs are image-only or one word, which excludes the entire
 * category of template furniture without needing to enumerate it.
 */
function isCiting(html: string, domain: string): boolean {
  const bare = domain.replace(/^www\./, "").toLowerCase();

  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]{0,400}?)<\/a>/gi)) {
    const href = match[1].match(/href\s*=\s*["'](https?:\/\/[^"']+)["']/i)?.[1];
    if (!href) continue;

    let host: string;
    try {
      host = new URL(href).host.replace(/^www\./, "").toLowerCase();
    } catch {
      continue;
    }

    if (host.includes(bare)) continue;
    if (SERVICE_SUBDOMAIN.test(new URL(href).host)) continue;
    if (NON_EDITORIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) continue;

    const text = match[2]
      .replace(/<[^>]+>/g, " ")
      .replace(/&[a-z#0-9]+;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Prose anchor text — the thing a real reference has and an icon does not.
    if (text.length >= 12 && text.split(" ").length >= 2) return true;
  }

  return false;
}

export async function runGeoScan(input: GeoScanInput): Promise<GeoReport> {
  const { site, website, pages, queries } = input;
  const origin = site.url;
  const brand = site.name;
  const domain = site.domain;

  const urls = pages
    .slice(0, MAX_PAGES)
    .map((path) => {
      try {
        return new URL(path, origin).toString();
      } catch {
        return undefined;
      }
    })
    .filter((u): u is string => Boolean(u));
  if (!urls.some((u) => u === `${origin}/` || u === origin)) {
    urls.unshift(new URL("/", origin).toString());
  }

  // Brand queries tell us nothing about unprompted visibility — if someone
  // searched the brand name, of course the brand is the answer.
  const categoryQueries = queries
    .filter((q) => !q.keyword.toLowerCase().includes(brand.toLowerCase().split(" ")[0]))
    .filter((q) => !q.keyword.toLowerCase().includes(domain.split(".")[0].toLowerCase()))
    .slice(0, MAX_PROMPTS)
    .map((q) => q.keyword);

  const [fetched, providers, knowledgeGraph] = await Promise.all([
    fetchPages(urls),
    probeAllProviders({ queries: categoryQueries, brand, domain }),
    lookupKnowledgeGraph(brand, domain),
  ]);

  const readable = fetched
    .map((page, i) => ({ page, path: new URL(urls[i]).pathname }))
    .filter(({ page }) => page.status === 200 && page.html && !isClientRendered(page.html));

  const shells = fetched.filter(
    (p) => p.status === 200 && p.html && isClientRendered(p.html),
  ).length;

  const entities = readable.map(({ page }) => organizationOf(page.html));
  const primary: OrganizationEntity =
    entities.find((e) => e.name) ?? { sameAs: [], types: [] };

  const signals: GeoSignal[] = [];

  /* ---- Organization schema ---------------------------------------------- */

  if (readable.length === 0) {
    signals.push(
      signal({
        id: "organization-schema",
        label: "Organization schema",
        status: "unavailable",
        summary:
          shells > 0
            ? `All ${shells} pages render with JavaScript — entity markup cannot be read from raw HTML.`
            : "No pages could be read.",
        evidence: [],
        reason:
          shells > 0
            ? "Client-side rendering means the entity declaration, if any, is injected at runtime. Answer engines that do not execute JavaScript will not see it at all."
            : undefined,
        suggestion:
          shells > 0
            ? "Server-render the Organization JSON-LD so it is present in the initial HTML."
            : undefined,
      }),
    );
  } else {
    const hasOrg = primary.types.some((t) => t !== "WebSite");
    const fields = [primary.name, primary.description, primary.url, primary.logo].filter(Boolean).length;

    signals.push(
      signal({
        id: "organization-schema",
        label: "Organization schema",
        status: !hasOrg ? "poor" : fields >= 3 ? "good" : "partial",
        summary: !hasOrg
          ? "No Organization or LocalBusiness markup found"
          : `${primary.types.join(", ")} declared with ${fields} of 4 core fields`,
        evidence: [
          { label: "Name", value: primary.name ?? "—" },
          { label: "Logo", value: primary.logo ? "Present" : "—" },
          { label: "Description", value: primary.description ? "Present" : "—" },
        ],
        score: !hasOrg ? 0 : fields / 4,
        suggestion: !hasOrg
          ? "Add Organization JSON-LD to every page with name, url, logo, description and sameAs. This is the single declaration answer engines use to resolve who you are."
          : fields < 4
            ? "Complete the Organization block — the missing fields above are what answer engines quote when describing you."
            : undefined,
      }),
    );
  }

  /* ---- Entity consistency ------------------------------------------------ */

  const names = new Set(entities.map((e) => e.name).filter(Boolean));
  const descriptions = new Set(entities.map((e) => e.description).filter(Boolean));
  const pagesWithEntity = entities.filter((e) => e.name).length;

  if (readable.length > 0) {
    const consistent = names.size <= 1 && descriptions.size <= 1;
    const coverage = readable.length ? pagesWithEntity / readable.length : 0;

    signals.push(
      signal({
        id: "entity-consistency",
        label: "Entity consistency",
        status: pagesWithEntity === 0 ? "poor" : consistent && coverage > 0.8 ? "good" : "partial",
        summary:
          pagesWithEntity === 0
            ? "No page declares an entity name"
            : names.size > 1
              ? `${names.size} different brand names declared across pages`
              : `Consistent across ${pagesWithEntity} of ${readable.length} readable pages`,
        evidence: [
          { label: "Names used", value: names.size ? [...names].join(" / ") : "—" },
          { label: "Coverage", value: `${pagesWithEntity}/${readable.length} pages` },
          { label: "Descriptions", value: String(descriptions.size) },
        ],
        score: pagesWithEntity === 0 ? 0 : (consistent ? 0.6 : 0.2) + coverage * 0.4,
        suggestion:
          names.size > 1
            ? `Pages declare different names (${[...names].join(", ")}). Pick one canonical form and use it in every Organization block — inconsistency is what stops an entity resolving cleanly.`
            : coverage < 0.8
              ? "Include the Organization block on every page, not just the homepage."
              : undefined,
      }),
    );
  }

  /* ---- sameAs ------------------------------------------------------------ */

  if (readable.length > 0) {
    const sameAs = [...new Set(entities.flatMap((e) => e.sameAs))];
    signals.push(
      signal({
        id: "sameas",
        label: "sameAs profiles",
        status: sameAs.length === 0 ? "poor" : sameAs.length >= 3 ? "good" : "partial",
        summary:
          sameAs.length === 0
            ? "No sameAs links declared"
            : `${sameAs.length} external profile${sameAs.length === 1 ? "" : "s"} linked`,
        evidence: sameAs.slice(0, 3).map((url, i) => ({
          label: `Profile ${i + 1}`,
          value: url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40),
        })),
        score: Math.min(1, sameAs.length / 4),
        suggestion:
          sameAs.length < 3
            ? "Add sameAs links to your LinkedIn, Crunchbase, Wikipedia and other verified profiles. These are the corroborating references that let an answer engine confirm you are who you claim to be."
            : undefined,
      }),
    );
  }

  /* ---- Schema coverage --------------------------------------------------- */

  if (readable.length > 0) {
    const withSchema = readable.filter(({ page }) => structuredDataOf(page.html).blocks > 0).length;
    const allTypes = [...new Set(readable.flatMap(({ page }) => structuredDataOf(page.html).types))];
    const coverage = withSchema / readable.length;

    signals.push(
      signal({
        id: "schema-coverage",
        label: "Schema coverage",
        status: coverage >= 0.8 ? "good" : coverage > 0 ? "partial" : "poor",
        summary: `${withSchema} of ${readable.length} readable pages carry structured data`,
        evidence: [
          { label: "Coverage", value: formatPercent(coverage, 0) },
          { label: "Types", value: allTypes.slice(0, 3).join(", ") || "—" },
        ],
        score: coverage,
        suggestion:
          coverage < 0.8
            ? `Add page-appropriate schema to the remaining ${readable.length - withSchema} pages. Structured data is how an answer engine knows what a page is about without inferring it.`
            : undefined,
      }),
    );

    const citing = readable.filter(({ page }) => isCiting(page.html, domain)).length;

    signals.push(
      signal({
        id: "schema-citations",
        label: "Outbound sources",
        status: citing / readable.length >= 0.5 ? "good" : citing > 0 ? "partial" : "poor",
        summary: `${citing} of ${readable.length} pages cite an external source`,
        evidence: [{ label: "Citing pages", value: `${citing}/${readable.length}` }],
        score: citing / readable.length,
        suggestion:
          citing / readable.length < 0.5
            ? "Cite primary sources in your content with visible outbound links. Pages that reference verifiable sources are materially more likely to be quoted by answer engines."
            : undefined,
      }),
    );
  }

  /* ---- Knowledge Graph --------------------------------------------------- */

  signals.push(
    signal({
      id: "knowledge-graph",
      label: "Knowledge Graph",
      status:
        knowledgeGraph.status === "found"
          ? "good"
          : knowledgeGraph.status === "not-found"
            ? "poor"
            : "not-configured",
      // The lookup ran and Google returned no entity — a finding, not a setup
      // fault. "Missing" here is read as the API key being absent, which has its
      // own status and its own wording.
      badgeLabel: knowledgeGraph.status === "not-found" ? "Not recognised" : undefined,
      summary:
        knowledgeGraph.status === "found"
          ? `Recognised as ${knowledgeGraph.entity?.types.filter((t) => t !== "Thing").join(", ") || "an entity"}`
          : knowledgeGraph.status === "not-found"
            ? "Google does not recognise this brand as a Knowledge Graph entity"
            : "Not checked",
      evidence:
        knowledgeGraph.status === "found"
          ? [
              { label: "Name", value: knowledgeGraph.entity?.name ?? "—" },
              { label: "Description", value: knowledgeGraph.entity?.description ?? "—" },
            ]
          : [],
      reason: knowledgeGraph.reason,
      score:
        knowledgeGraph.status === "found" ? 1 : knowledgeGraph.status === "not-found" ? 0 : undefined,
      suggestion:
        knowledgeGraph.status === "not-found"
          ? "Entity recognition is earned through corroboration, not markup alone. Complete Organization schema with sameAs, claim a Google Business Profile if applicable, and secure consistent third-party references — Wikipedia, Crunchbase, industry directories."
          : undefined,
    }),
  );

  /* ---- NAP --------------------------------------------------------------- */

  if (readable.length > 0) {
    const naps = readable.map(({ page, path }) => napOf(page, path));
    const phones = new Set(naps.flatMap((n) => n.phones));
    const addresses = new Set(naps.map((n) => n.address).filter(Boolean));
    const declared = naps.filter((n) => n.phones.length || n.address).length;

    const consistent = phones.size <= 1 && addresses.size <= 1;
    signals.push(
      signal({
        id: "nap-consistency",
        label: "NAP consistency",
        status: declared === 0 ? "poor" : consistent ? "good" : "partial",
        summary:
          declared === 0
            ? "No phone or address found in markup or tel: links"
            : consistent
              ? `Consistent across ${declared} page${declared === 1 ? "" : "s"}`
              : `${phones.size} phone numbers and ${addresses.size} addresses in use`,
        evidence: [
          { label: "Phones", value: phones.size ? [...phones].join(", ") : "—" },
          { label: "Addresses", value: addresses.size ? String(addresses.size) : "—" },
        ],
        score: declared === 0 ? 0 : consistent ? 1 : 0.4,
        suggestion:
          declared === 0
            ? "Publish a phone number and address in Organization or LocalBusiness schema. Contact details that only exist as page text cannot be read reliably by machines."
            : !consistent
              ? "Different contact details appear on different pages. Answer engines treat conflicting NAP data as a reason to distrust the entity — align them."
              : undefined,
      }),
    );
  }

  /* ---- Trust ------------------------------------------------------------- */

  // Trust page detection works by scanning links on readable pages. With none
  // readable, About / Contact / Privacy are *unknown*, not missing — reporting
  // "1 of 4 present" would state a finding nobody checked. Only HTTPS survives,
  // because it is read from the origin rather than from any page.
  const trust = trustSignalsOf(readable, origin);

  if (readable.length === 0) {
    signals.push(
      signal({
        id: "trust-pages",
        label: "Trust pages",
        status: "unavailable",
        summary: `Cannot be checked — HTTPS is ${trust.isHttps ? "enabled" : "not enabled"}, but no page was readable`,
        evidence: [{ label: "HTTPS", value: trust.isHttps ? "Yes" : "No" }],
        reason:
          "About, contact and privacy pages are found by reading links from the site's own pages. Every page here rendered as a JavaScript shell, so nothing could be scanned. These pages may well exist.",
      }),
    );
    signals.push(
      signal({
        id: "author-markup",
        label: "Author markup",
        status: "unavailable",
        summary: "Cannot be checked — no page was readable",
        evidence: [],
        reason: "Author markup is read from page HTML, which is empty on a client-rendered site.",
      }),
    );
  } else {
    const trustPoints = [
      trust.hasAboutPage,
      trust.hasContactPage,
      trust.hasPrivacyPolicy,
      trust.isHttps,
    ];
    const trustScore = trustPoints.filter(Boolean).length / trustPoints.length;

    signals.push(
      signal({
        id: "trust-pages",
        label: "Trust pages",
        status: trustScore === 1 ? "good" : trustScore >= 0.5 ? "partial" : "poor",
        summary: `${trustPoints.filter(Boolean).length} of 4 trust signals present`,
        evidence: [
          { label: "About", value: trust.hasAboutPage ? "Yes" : "No" },
          { label: "Contact", value: trust.hasContactPage ? "Yes" : "No" },
          { label: "Privacy", value: trust.hasPrivacyPolicy ? "Yes" : "No" },
        ],
        score: trustScore,
        suggestion:
          trustScore < 1
            ? "Publish the missing pages. About, contact and privacy pages are the baseline checks used to decide whether a site represents a real, accountable organisation."
            : undefined,
      }),
    );

    signals.push(
      signal({
        id: "author-markup",
        label: "Author markup",
        status: trust.hasAuthorMarkup ? "good" : "poor",
        summary: trust.hasAuthorMarkup
          ? "Author or Person markup found"
          : "No author attribution in structured data",
        evidence: [{ label: "Dated pages", value: `${trust.datedPages}/${readable.length}` }],
        score: trust.hasAuthorMarkup ? 1 : 0,
        suggestion: trust.hasAuthorMarkup
          ? undefined
          : "Attribute editorial content to a named author with Person schema and a credentials page. Unattributed content is weighted down for exactly the expertise signals answer engines look for.",
      }),
    );
  }

  /* ---- Google AI Overview ------------------------------------------------ */

  signals.push(
    signal({
      id: "ai-overview",
      label: "Google AI Overview",
      status: "unavailable",
      summary: "No API exposes AI Overview presence",
      evidence: [],
      reason:
        "Google does not report AI Overview appearances anywhere — not in Search Console, not through any API. The only way to observe them is scraping search results, which breaches Google's terms of service, or paying a third-party SERP provider. This module will not estimate a number it cannot measure.",
      suggestion:
        "The signals that influence AI Overview inclusion are the ones measured above: entity clarity, structured data, cited sources and direct answers early in the page. Improving those is the available lever.",
    }),
  );

  const scores = buildScores(signals, providers);

  /* ---- Suggestions ------------------------------------------------------- */

  const suggestions: GeoSuggestion[] = signals
    .filter((s) => s.suggestion)
    .map((s, i) => ({
      id: `${s.id}-${i}`,
      priority:
        s.status === "poor" || s.status === "unavailable"
          ? ("high" as const)
          : s.status === "partial"
            ? ("medium" as const)
            : ("low" as const),
      title: s.label,
      detail: s.summary,
      action: s.suggestion!,
    }))
    .sort((a, b) => {
      const rank = { high: 2, medium: 1, low: 0 };
      return rank[b.priority] - rank[a.priority];
    });

  return {
    site,
    scannedAt: new Date().toISOString(),
    brand,
    pagesAnalysed: readable.length,
    providers,
    signals,
    scores,
    suggestions,
  };
}

export { MAX_PROMPTS, RUNS_PER_PROMPT };
