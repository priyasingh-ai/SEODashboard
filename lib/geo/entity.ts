import "server-only";

import type { FetchedPage } from "@/lib/technical/fetch-page";
import { isClientRendered } from "@/lib/technical/fetch-page";

/**
 * Entity signals read from the site's own pages.
 *
 * This is the half of GEO that needs no third-party credential: whether the
 * site declares who it is in a machine-readable way, consistently, across every
 * page. Answer engines resolve a brand to an entity before deciding whether to
 * cite it, and these are the declarations that resolution rests on.
 *
 * Every page is checked after `isClientRendered`, so a JavaScript shell is
 * reported as unreadable rather than as a site with no markup.
 */

export interface OrganizationEntity {
  name?: string;
  description?: string;
  url?: string;
  logo?: string;
  /** Profile URLs linking the entity to other platforms. */
  sameAs: string[];
  telephone?: string;
  address?: string;
  /** The `@type` values seen: Organization, LocalBusiness, Person… */
  types: string[];
}

interface JsonLdNode {
  "@type"?: string | string[];
  "@graph"?: unknown;
  name?: string;
  description?: string;
  url?: string;
  logo?: unknown;
  sameAs?: string | string[];
  telephone?: string;
  address?: unknown;
  [key: string]: unknown;
}

const ENTITY_TYPES = [
  "Organization",
  "LocalBusiness",
  "Corporation",
  "OnlineStore",
  "Store",
  "ProfessionalService",
  "Person",
  "WebSite",
];

function typesOf(node: JsonLdNode): string[] {
  const raw = node["@type"];
  if (typeof raw === "string") return [raw];
  if (Array.isArray(raw)) return raw.filter((t): t is string => typeof t === "string");
  return [];
}

function flatten(node: unknown, out: JsonLdNode[] = []): JsonLdNode[] {
  if (Array.isArray(node)) {
    node.forEach((n) => flatten(n, out));
  } else if (node && typeof node === "object") {
    const record = node as JsonLdNode;
    out.push(record);
    if (record["@graph"]) flatten(record["@graph"], out);
  }
  return out;
}

function addressToString(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (!value || typeof value !== "object") return undefined;

  const a = value as Record<string, unknown>;
  const parts = [
    a.streetAddress,
    a.addressLocality,
    a.addressRegion,
    a.postalCode,
    a.addressCountry,
  ]
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean);

  return parts.length ? parts.join(", ") : undefined;
}

/** Merge every JSON-LD entity block on one page into a single view. */
export function organizationOf(html: string): OrganizationEntity {
  const entity: OrganizationEntity = { sameAs: [], types: [] };

  const pattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of html.matchAll(pattern)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1].trim());
    } catch {
      continue;
    }

    for (const node of flatten(parsed)) {
      const types = typesOf(node);
      if (!types.some((t) => ENTITY_TYPES.includes(t))) continue;

      for (const t of types) if (!entity.types.includes(t)) entity.types.push(t);

      // First declaration wins — later blocks are usually page-scoped repeats.
      if (!entity.name && typeof node.name === "string") entity.name = node.name.trim();
      if (!entity.description && typeof node.description === "string") {
        entity.description = node.description.trim();
      }
      if (!entity.url && typeof node.url === "string") entity.url = node.url.trim();
      if (!entity.telephone && typeof node.telephone === "string") {
        entity.telephone = node.telephone.trim();
      }
      if (!entity.address) entity.address = addressToString(node.address);

      if (!entity.logo) {
        const logo = node.logo;
        if (typeof logo === "string") entity.logo = logo;
        else if (logo && typeof logo === "object" && typeof (logo as Record<string, unknown>).url === "string") {
          entity.logo = (logo as Record<string, string>).url;
        }
      }

      const sameAs = node.sameAs;
      const list = typeof sameAs === "string" ? [sameAs] : Array.isArray(sameAs) ? sameAs : [];
      for (const url of list) {
        if (typeof url === "string" && !entity.sameAs.includes(url)) entity.sameAs.push(url);
      }
    }
  }

  return entity;
}

/* -------------------------------------------------------------------------- */
/*  NAP                                                                        */
/* -------------------------------------------------------------------------- */

export interface NapRecord {
  page: string;
  phones: string[];
  emails: string[];
  /** From JSON-LD only — free-text addresses are not reliably extractable. */
  address?: string;
}

/**
 * Phone numbers, deliberately narrow.
 *
 * Only `tel:` links and JSON-LD `telephone` count. Scraping digit sequences out
 * of body text produces order numbers, prices, dates and product codes, and a
 * NAP consistency check built on that noise reports conflicts that do not
 * exist — which is worse than reporting nothing.
 */
export function napOf(page: FetchedPage, path: string): NapRecord {
  const html = page.html;
  const phones = new Set<string>();
  const emails = new Set<string>();

  for (const match of html.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) {
    phones.add(normalisePhone(match[1]));
  }
  for (const match of html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)["']/gi)) {
    emails.add(match[1].trim().toLowerCase());
  }

  const entity = organizationOf(html);
  if (entity.telephone) phones.add(normalisePhone(entity.telephone));

  return {
    page: path,
    phones: [...phones].filter(Boolean),
    emails: [...emails],
    address: entity.address,
  };
}

/** Digits only, so `+91 98765 43210` and `+919876543210` compare equal. */
export function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Keep the last 10 — country-code prefixes are written inconsistently and
  // would otherwise register as a conflict with themselves.
  return digits.length > 10 ? digits.slice(-10) : digits;
}

/* -------------------------------------------------------------------------- */
/*  Trust signals                                                              */
/* -------------------------------------------------------------------------- */

export interface TrustSignals {
  hasAboutPage: boolean;
  hasContactPage: boolean;
  hasPrivacyPolicy: boolean;
  /** Author or Person markup — an E-E-A-T signal for editorial content. */
  hasAuthorMarkup: boolean;
  isHttps: boolean;
  /** Pages carrying a declared publish or modified date. */
  datedPages: number;
}

const LINK_PATTERNS = {
  about: /\/(about|about-us|who-we-are|our-story|company)\b/i,
  contact: /\/(contact|contact-us|get-in-touch|reach-us)\b/i,
  privacy: /\/(privacy|privacy-policy|legal\/privacy)\b/i,
};

export function trustSignalsOf(
  pages: { path: string; page: FetchedPage }[],
  origin: string,
): TrustSignals {
  const readable = pages.filter((p) => p.page.status === 200 && !isClientRendered(p.page.html));

  // Look at both the paths in the scan and everything those pages link to, so a
  // privacy policy that exists but draws no search traffic is still found.
  const allPaths = new Set<string>(pages.map((p) => p.path));
  for (const { page } of readable) {
    for (const match of page.html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
      try {
        allPaths.add(new URL(match[1], origin).pathname);
      } catch {
        /* ignore */
      }
    }
  }
  const paths = [...allPaths];

  return {
    hasAboutPage: paths.some((p) => LINK_PATTERNS.about.test(p)),
    hasContactPage: paths.some((p) => LINK_PATTERNS.contact.test(p)),
    hasPrivacyPolicy: paths.some((p) => LINK_PATTERNS.privacy.test(p)),
    hasAuthorMarkup: readable.some(
      ({ page }) =>
        /"@type"\s*:\s*"Person"/i.test(page.html) ||
        /\bauthor\b/i.test(page.html.match(/<script[^>]*ld\+json[^>]*>[\s\S]*?<\/script>/i)?.[0] ?? ""),
    ),
    isHttps: origin.startsWith("https://"),
    datedPages: readable.filter(({ page }) =>
      /"date(?:Published|Modified)"\s*:/i.test(page.html) ||
      /property\s*=\s*["']article:(?:published|modified)_time["']/i.test(page.html),
    ).length,
  };
}
