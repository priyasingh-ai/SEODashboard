/**
 * Generation profiles for the mock provider.
 *
 * Keyed by website id. Identity (name, domain, favicon, Google bindings) lives
 * in `lib/websites.ts` and is deliberately NOT duplicated here — this file only
 * describes the *shape of the traffic*, which is the one thing the real APIs
 * will replace.
 *
 * Each site has a genuinely different character so the portfolio view can
 * actually answer "which is growing / which lost traffic / which converts best"
 * at a glance rather than showing four variations of the same curve.
 */
export interface TrafficProfile {
  /** Deterministic PRNG seed — keeps SSR and client renders identical. */
  seed: number;
  /** Mean organic clicks per day at the anchor date. */
  baseClicks: number;
  /** Mean click-through rate, 0–1. */
  baseCtr: number;
  /** Mean average position in SERPs. */
  basePosition: number;
  /** Compound daily growth (0.004 === +0.4%/day), bounded by `saturatingDrift`. */
  dailyDrift: number;
  /** Relative noise amplitude, 0–1. Higher = spikier series. */
  volatility: number;
  /** GA4 users per organic click — captures the non-search traffic mix. */
  usersPerClick: number;
  sessionsPerUser: number;
  viewsPerSession: number;
  /** Share of users that are new, 0–1. */
  newUserShare: number;
  /** Share of sessions that are engaged, 0–1. */
  engagedShare: number;
  /** Mean engagement time per session, seconds. */
  engagementSeconds: number;
  /** GA4 channel mix. Must sum to ~1. */
  channelMix: { organic: number; direct: number; referral: number; social: number };
  /** Device mix. Must sum to ~1. */
  deviceMix: { mobile: number; desktop: number; tablet: number };
  /**
   * Search Console country mix, keyed by lowercase ISO alpha-3 as GSC reports
   * them. Must sum to ~1. Distinct from `deviceMix`/`channelMix`, which are GA4
   * concepts measured in users and sessions — this one is measured in clicks.
   */
  countryMix: { ind: number; usa: number; gbr: number; can: number; aus: number; deu: number };
  /** Hours before the anchor that this property last synced. */
  syncedHoursAgo: number;
  keywords: string[];
  pages: string[];
}

export const TRAFFIC_PROFILES: Record<string, TrafficProfile> = {
  "doc-mirror": {
    seed: 1042,
    baseClicks: 1860,
    baseCtr: 0.041,
    basePosition: 12.4,
    dailyDrift: 0.0078, // strongest grower in the portfolio
    volatility: 0.085,
    usersPerClick: 1.34,
    sessionsPerUser: 1.28,
    viewsPerSession: 2.6,
    newUserShare: 0.71,
    engagedShare: 0.63,
    engagementSeconds: 94,
    channelMix: { organic: 0.68, direct: 0.16, referral: 0.1, social: 0.06 },
    deviceMix: { mobile: 0.58, desktop: 0.36, tablet: 0.06 },
    // Documentation tooling: English-speaking developer markets, US-led.
    countryMix: { ind: 0.18, usa: 0.34, gbr: 0.16, can: 0.12, aus: 0.11, deu: 0.09 },
    syncedHoursAgo: 2,
    keywords: [
      "medical records request",
      "how to get medical records",
      "hipaa release form",
      "patient portal login help",
      "medical records copy fee",
      "release of information form",
      "doc mirror",
      "request hospital records online",
      "medical record retention rules",
      "authorization to disclose phi",
      "radiology images request",
      "medical records for insurance claim",
      "how long do hospitals keep records",
      "third party medical record request",
      "electronic health record access",
      "medical records fee schedule by state",
      "hipaa right of access",
      "download lab results",
    ],
    pages: [
      "/guides/how-to-request-medical-records",
      "/forms/hipaa-authorization",
      "/",
      "/guides/record-retention-by-state",
      "/pricing",
      "/blog/hipaa-right-of-access-explained",
      "/guides/radiology-image-requests",
      "/forms/release-of-information",
      "/blog/medical-record-fees-2026",
      "/features/patient-portal",
      "/help/login-issues",
      "/blog/electronic-health-records-101",
      "/guides/insurance-claim-records",
      "/about",
    ],
  },

  nextdot: {
    seed: 3891,
    baseClicks: 1240,
    baseCtr: 0.068, // best CTR in the portfolio — tight branded + intent terms
    basePosition: 6.9,
    dailyDrift: 0.0021,
    volatility: 0.075,
    usersPerClick: 1.18,
    sessionsPerUser: 1.41,
    viewsPerSession: 3.4,
    newUserShare: 0.62,
    engagedShare: 0.68,
    engagementSeconds: 131,
    channelMix: { organic: 0.74, direct: 0.14, referral: 0.09, social: 0.03 },
    deviceMix: { mobile: 0.44, desktop: 0.51, tablet: 0.05 },
    // .co.in agency — overwhelmingly domestic.
    countryMix: { ind: 0.71, usa: 0.11, gbr: 0.06, can: 0.04, aus: 0.04, deu: 0.04 },
    syncedHoursAgo: 2,
    keywords: [
      "nextdot",
      "web development company india",
      "nextdot pricing",
      "hire next js developers",
      "custom saas development",
      "nextdot reviews",
      "react development agency",
      "mvp development company",
      "nextdot careers",
      "shopify headless agency",
      "software development company coimbatore",
      "hire react developer india",
      "next js consulting",
      "product design agency india",
      "nextdot portfolio",
      "web app development cost",
    ],
    pages: [
      "/",
      "/services/web-development",
      "/work",
      "/pricing",
      "/services/saas-development",
      "/contact",
      "/blog/next-js-15-app-router-guide",
      "/services/product-design",
      "/careers",
      "/about",
      "/blog/mvp-cost-breakdown-2026",
      "/work/case-study-fintech-dashboard",
      "/services/headless-commerce",
    ],
  },

  fwdpod: {
    seed: 2317,
    baseClicks: 940,
    baseCtr: 0.019, // huge impressions, thin CTR — the classic podcast SERP shape
    basePosition: 21.7,
    dailyDrift: -0.0049, // the site that lost traffic this week
    volatility: 0.115,
    usersPerClick: 2.1, // heavy direct/social traffic
    sessionsPerUser: 1.62,
    viewsPerSession: 1.9,
    newUserShare: 0.54,
    engagedShare: 0.71,
    engagementSeconds: 168,
    channelMix: { organic: 0.34, direct: 0.27, referral: 0.14, social: 0.25 },
    deviceMix: { mobile: 0.72, desktop: 0.23, tablet: 0.05 },
    // Podcast audience, North America first.
    countryMix: { ind: 0.09, usa: 0.52, gbr: 0.14, can: 0.13, aus: 0.08, deu: 0.04 },
    syncedHoursAgo: 2,
    keywords: [
      "fwdpod",
      "best tech podcasts 2026",
      "fwdpod episodes",
      "podcast about startups",
      "fwd pod listen",
      "tech podcast transcript",
      "startup founder interviews podcast",
      "fwdpod episode 112",
      "podcast recommendations engineering",
      "best interview podcast tech",
      "fwdpod youtube",
      "developer podcast weekly",
      "fwdpod spotify",
      "podcast show notes tech",
      "ai podcast episodes",
      "fwdpod guests",
      "engineering leadership podcast",
    ],
    pages: [
      "/episodes",
      "/",
      "/episodes/112-scaling-a-seed-stage-team",
      "/episodes/109-the-ai-tooling-shakeout",
      "/about",
      "/episodes/105-founder-mode",
      "/transcripts/112",
      "/guests",
      "/episodes/101-hiring-your-first-engineer",
      "/subscribe",
      "/transcripts/109",
      "/episodes/98-pricing-experiments",
      "/newsletter",
    ],
  },

  shopyukti: {
    seed: 5507,
    baseClicks: 1520,
    baseCtr: 0.032,
    basePosition: 15.8,
    dailyDrift: 0.0034, // steady e-commerce growth
    volatility: 0.14, // retail is spikier — promos and weekends swing hard
    usersPerClick: 1.62,
    sessionsPerUser: 1.74, // shoppers return before converting
    viewsPerSession: 4.2, // lots of product-page browsing
    newUserShare: 0.66,
    engagedShare: 0.57,
    engagementSeconds: 118,
    channelMix: { organic: 0.46, direct: 0.19, referral: 0.11, social: 0.24 },
    deviceMix: { mobile: 0.74, desktop: 0.21, tablet: 0.05 },
    // Domestic ecommerce — the most concentrated mix in the portfolio.
    countryMix: { ind: 0.84, usa: 0.06, gbr: 0.04, can: 0.02, aus: 0.02, deu: 0.02 },
    syncedHoursAgo: 9, // deliberately staler than the rest
    keywords: [
      "shopyukti",
      "online shopping india",
      "shopyukti offers",
      "best deals online india",
      "kitchen organizer online",
      "shopyukti reviews",
      "home decor under 999",
      "buy storage containers online",
      "shopyukti coupon code",
      "wireless earbuds under 2000",
      "cotton bedsheet double bed",
      "shopyukti delivery time",
      "stainless steel water bottle",
      "shopyukti return policy",
      "trending gadgets 2026",
      "festive sale offers",
      "smart watch under 3000",
    ],
    pages: [
      "/",
      "/collections/deals-of-the-day",
      "/collections/home-kitchen",
      "/collections/electronics",
      "/products/insulated-steel-bottle-1l",
      "/collections/festive-sale",
      "/products/wireless-earbuds-pro",
      "/collections/home-decor",
      "/products/modular-kitchen-organizer",
      "/cart",
      "/collections/bedsheets",
      "/pages/shipping-and-returns",
      "/products/smart-fitness-band",
      "/pages/track-order",
    ],
  },
};

export function getProfile(websiteId: string): TrafficProfile | undefined {
  return TRAFFIC_PROFILES[websiteId];
}
