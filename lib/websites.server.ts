import "server-only";

import type { Website, WebsiteConfig } from "@/types";
import { ServiceError } from "@/services/types";
import { ACTIVE_WEBSITES, envKeysFor, findWebsite } from "./websites";

/**
 * Server-side resolution of a website's Google bindings.
 *
 * `lib/websites.ts` holds public identity and is safe to import anywhere.
 * This module joins it with the environment to produce the full `Website`, and
 * is `server-only` so the bindings can never be compiled into a client bundle.
 *
 * Bindings are read per call rather than cached at module scope: a serverless
 * instance can be reused across deploys, and a stale snapshot of `process.env`
 * would keep pointing at the previous deployment's properties.
 */

/** A binding is "set" only if it's a non-empty string. */
function read(key: string): string {
  return process.env[key]?.trim() ?? "";
}

export function bindingsFor(config: WebsiteConfig): {
  analyticsPropertyId: string;
  searchConsoleProperty: string;
} {
  const keys = envKeysFor(config);
  return {
    analyticsPropertyId: read(keys.ga4),
    searchConsoleProperty: read(keys.gsc),
  };
}

export function withBindings(config: WebsiteConfig): Website {
  return { ...config, ...bindingsFor(config) };
}

/** Every enabled site, with its bindings resolved. */
export function activeWebsitesWithBindings(): Website[] {
  return ACTIVE_WEBSITES.map(withBindings);
}

/**
 * Resolve an id to a fully-bound website, or throw a typed error.
 *
 * The `unknown_website` / `not_configured` distinction matters downstream: the
 * first is a 404 (bad URL), the second is a 503 that the UI renders as
 * "Not connected yet" with the exact env var to set.
 */
export function requireWebsiteWithBindings(id: string): Website {
  const config = findWebsite(id);
  if (!config) {
    throw new ServiceError("unknown_website", `No website configured with id "${id}".`, 404);
  }
  return withBindings(config);
}

/** Whether a site is actually wired up, and which variable is missing if not. */
export function describeBinding(id: string): {
  ga4: boolean;
  gsc: boolean;
  ready: boolean;
  missing: string[];
} {
  const config = findWebsite(id);
  if (!config) return { ga4: false, gsc: false, ready: false, missing: [] };

  const keys = envKeysFor(config);
  const { analyticsPropertyId, searchConsoleProperty } = bindingsFor(config);
  const ga4 = analyticsPropertyId.length > 0;
  const gsc = searchConsoleProperty.length > 0;

  return {
    ga4,
    gsc,
    ready: ga4 && gsc,
    missing: [!ga4 ? keys.ga4 : null, !gsc ? keys.gsc : null].filter(
      (k): k is string => k !== null,
    ),
  };
}
