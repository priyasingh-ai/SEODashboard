import type { WebsiteConfig } from "@/types";

/**
 * The central website registry — the one place you add, remove or rename a
 * property. Nothing else in the app hardcodes a site.
 *
 * ## What is and isn't in this file
 *
 * This module is imported by client components (the site switcher, the sidebar,
 * the breadcrumb all need a site's name synchronously), so it holds only
 * *public* identity: id, name, domain, favicon, initials, enabled.
 *
 * The Google bindings — `analyticsPropertyId` and `searchConsoleProperty` —
 * deliberately live in environment variables and are resolved by
 * `lib/websites.server.ts`, which is `server-only`. Reading `process.env` here
 * instead would compile into the browser bundle as a lookup that always yields
 * `""` (Next only inlines `NEXT_PUBLIC_*`), so client code would silently see
 * empty bindings while the server saw real ones — the kind of split-brain that
 * is very hard to debug later.
 *
 * `Website` (config + bindings) is assembled server-side by
 * `requireWebsiteWithBindings`. Adding a site means one entry here plus its two
 * env vars — see `.env.example`.
 */
export const WEBSITES: WebsiteConfig[] = [
  {
    id: "doc-mirror",
    name: "The Doc Mirror",
    domain: "thedocmirror.com",
    url: "https://www.thedocmirror.com",
    favicon: "https://www.google.com/s2/favicons?domain=thedocmirror.com&sz=64",
    initials: "DM",
    envKey: "TDM",
    enabled: true,
  },
  {
    id: "nextdot",
    name: "NextDot",
    domain: "nextdot.co.in",
    url: "https://nextdot.co.in",
    favicon: "https://www.google.com/s2/favicons?domain=nextdot.co.in&sz=64",
    initials: "ND",
    envKey: "NEXTDOT",
    enabled: true,
  },
  {
    id: "fwdpod",
    name: "FWDPod",
    domain: "fwdpod.com",
    url: "https://fwdpod.com",
    favicon: "https://www.google.com/s2/favicons?domain=fwdpod.com&sz=64",
    initials: "FP",
    envKey: "FWDPOD",
    enabled: true,
  },
  {
    id: "shopyukti",
    name: "ShopYukti",
    domain: "shopyukti.com",
    url: "https://www.shopyukti.com",
    favicon: "https://www.google.com/s2/favicons?domain=shopyukti.com&sz=64",
    initials: "SY",
    envKey: "SHOPYUKTI",
    enabled: true,
  },
];

/** Only enabled sites reach the UI. Flipping `enabled` hides one everywhere. */
export const ACTIVE_WEBSITES: WebsiteConfig[] = WEBSITES.filter((w) => w.enabled);

export const DEFAULT_WEBSITE_ID = ACTIVE_WEBSITES[0]?.id ?? WEBSITES[0].id;

export function findWebsite(id: string): WebsiteConfig | undefined {
  return ACTIVE_WEBSITES.find((w) => w.id === id);
}

export function isKnownWebsite(id: string): boolean {
  return ACTIVE_WEBSITES.some((w) => w.id === id);
}

/**
 * The env var names a site's Google bindings are read from.
 *
 * Takes the whole config rather than an id because `envKey` is declared per
 * site — see the note on `WebsiteConfig.envKey`. Exported so the server
 * resolver and the Settings page can name the exact missing variable when a
 * site isn't configured.
 */
export function envKeysFor(site: Pick<WebsiteConfig, "envKey">): {
  ga4: string;
  gsc: string;
} {
  return {
    ga4: `GA4_PROPERTY_${site.envKey}`,
    gsc: `GSC_PROPERTY_${site.envKey}`,
  };
}
