# SEO Portfolio Dashboard

One place to watch weekly Search Console + GA4 performance across four websites,
instead of eight browser tabs.

It is a **view dashboard**. No AI, no recommendations, no health scores, no
audits — just the numbers, arranged so you can read them fast.

```bash
npm install
npm run dev     # http://localhost:3000
```

## The questions it answers in 30 seconds

The home page is built backwards from these:

| Question | Where it's answered |
| --- | --- |
| Which website is growing? | Highlights row → "Growing fastest" |
| Which lost traffic this week? | Highlights row → "Lost the most traffic" |
| Which has the highest CTR? | Highlights row → "Highest CTR" |
| Which gained the most users? | Highlights row → "Most users gained" |
| Which landing pages perform best? | Landing Pages (GSC + GA4 joined on one row) |
| Which keywords drove the most clicks? | Keywords, sorted by clicks |

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind · shadcn/ui (Radix) · Recharts ·
TanStack Table · Lucide · Framer Motion

## Layout

```
app/
  api/                  Route Handlers — the only place Google is called
  …                     routes: portfolio, site/[siteId], scoped sections
components/
  charts/ dashboard/ layout/ tables/ ui/
hooks/                  use-filters, use-async, use-reports, use-page-actions
lib/
  websites.ts           the central registry (client-safe)
  websites.server.ts    joins the registry with env bindings (server-only)
  api.ts                the browser's fetch layer
  google-analytics.ts   GA4 Data API client (server-only)
  search-console.ts     Search Console API client (server-only)
  env.ts                credentials + config (server-only)
services/
  index.ts              getOverview, getTraffic, getTopQueries, …
  types.ts              every request/response interface
  providers/mock/       deterministic generator
  providers/google/     GA4 + GSC, joined
types/                  shared domain types
```

## Architecture

Data flows one way, and the browser never touches Google:

```
components / pages
      ↓  hooks/use-reports.ts
lib/api.ts                    ← the only thing the browser fetches
      ↓  HTTP
app/api/*/route.ts            ← Route Handlers (server)
      ↓
services/                     ← getOverview, getTraffic, getTopQueries, …
      ↓
services/providers/           ← mock | google  (selected by DATA_SOURCE)
      ↓
lib/google-analytics.ts · lib/search-console.ts   ← server-only
```

No component builds a URL, holds a metric, or knows which provider answered.

### The service layer

Every function takes the same parameters — `websiteId`, `dateRange`,
`comparePreviousPeriod` — and returns `{ data, meta }`:

| Function | Endpoint | Returns |
| --- | --- | --- |
| `getOverview` | `/api/overview` | the ten metric cards + weekly growth |
| `getTraffic` | `/api/traffic` | time series, traffic sources, devices |
| `getTopQueries` | `/api/top-queries` | Search Console queries, ranked |
| `getKeywordPerformance` | `/api/keyword-performance` | the full keyword table |
| `getLandingPages` | `/api/landing-pages` | GSC pages joined with GA4 engagement |
| `getPortfolio` | `/api/portfolio` | every site + weighted roll-up |
| `getSiteReport` | `/api/site-report` | one dashboard, one round trip |

`meta` carries `source` (`mock` \| `google`), `fetchedAt`, the resolved windows,
and `degraded` — the names of any sites whose upstream failed while others
succeeded. Without that flag a half-empty portfolio is indistinguishable from a
genuinely quiet week.

## Configuring websites

One file: [`lib/websites.ts`](lib/websites.ts).

```ts
{ id: "nextdot", name: "NextDot", domain: "nextdot.ai",
  url: "https://nextdot.ai", favicon: "…", initials: "ND", enabled: true }
```

The Google bindings are **not** in that file. They come from environment
variables, resolved server-side by [`lib/websites.server.ts`](lib/websites.server.ts),
and joined onto the config to make a full `Website`. The env var names are
derived from the id, so adding a site needs no wiring:

```
doc-mirror →  GA4_PROPERTY_DOC_MIRROR   GSC_PROPERTY_DOC_MIRROR
```

That split is deliberate. `lib/websites.ts` is imported by client components (the
site switcher needs names synchronously), so reading `process.env` there would
compile into the browser bundle as a lookup that always yields `""` — client code
would silently see empty bindings while the server saw real ones.

Setting `enabled: false` removes a site from the switcher, the portfolio, the
routes and the exports at once.

## Going live

The GA4 and Search Console clients are **implemented** — `@google-analytics/data`
and `googleapis` are installed and wired. All that's left is the Google-side
setup, which only you can do because they're your accounts.

```bash
cp .env.example .env.local
```

**1. Google Cloud (once)**

- Create a project, then **APIs & Services → Library** and enable both
  **Google Analytics Data API** and **Search Console API**.
- **IAM & Admin → Service Accounts → Create**, then **Keys → Add Key → JSON**.
- Note the `client_email` from that JSON.

**2. Grant access — per website**

The service account can't see anything until you invite it:

| | Where | What |
| --- | --- | --- |
| GA4 | Admin → Property Access Management | add the email as **Viewer** |
| GSC | Settings → Users and permissions | add the email as **Full** or **Restricted** |

Grab each GA4 **Property ID** from Admin → Property Settings — a number like
`493812345`. That's not the `G-XXXXXXX` measurement id.

**3. Fill in `.env.local`**

```bash
DATA_SOURCE=google
GOOGLE_CLIENT_EMAIL=seo-dashboard@your-project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQ...
-----END PRIVATE KEY-----
"
GA4_PROPERTY_TDM=493812345
```

> **The private key must be double-quoted with its `
` sequences intact** —
> copy the `private_key` field from the service-account JSON verbatim. This is
> the single most common setup mistake; unquoted, the value breaks at the first
> space.

Set `DATA_SOURCE=mock` to switch back at any time.

### When setup goes wrong

Google's raw errors are actively misleading during setup, so
[`lib/google-errors.ts`](lib/google-errors.ts) maps each one to the thing to
actually go and fix:

| Raw error | What the dashboard shows |
| --- | --- |
| `DECODER routines::unsupported` | GOOGLE_PRIVATE_KEY is malformed — quote it, keep the `
` |
| `invalid_grant` | credentials rejected — check the email matches the key, and the clock |
| `403` | share the property with the service-account email |
| `404` | property id format is wrong (GA4 wants digits only) |
| `SERVICE_DISABLED` | enable the API in the Cloud Library |
| `429` | quota exhausted — retries shortly |

A failure never blanks the page: the dashboard keeps rendering and the affected
panel shows the message above.

### Credentials never reach the browser

Enforced by the compiler, not by convention: `lib/env.ts` and both API clients
start with `import "server-only"`, so any client component that imports them —
directly or transitively — fails the build. Verify it yourself:

```bash
npm run build
grep -rl "GOOGLE_PRIVATE_KEY\|GA4_PROPERTY\|searchAnalyticsQuery" .next/static/chunks
# → no matches
```

### Adding authentication later

`withApi()` in [`app/api/_lib/handler.ts`](app/api/_lib/handler.ts) is the single
choke point every data request passes through. Auth is one block at the top of
it — no route file and no component changes:

```ts
const session = await auth();
if (!session) throw new ServiceError("unauthorized", "Sign in required.", 401);
if (!canAccess(session, params.websiteId)) throw new ServiceError(...);
```

The handlers were built around that wrapper rather than each parsing their own
request precisely so this stays a one-file change.

## Decisions worth knowing

**No dual-axis charts.** Impressions run 20–50× clicks, so "Clicks vs
Impressions" is two stacked panels with independent zero-based axes, linked by a
shared crosshair (`syncId`). One shared axis would flatten clicks to the
baseline; two y-scales on one plot let you manufacture any crossover you like.

**Position is inverted everywhere.** Rank 3 beats rank 12, so `lowerIsBetter`
lives in the metric registry (`lib/metrics.ts`) and every delta reads it. The
trend chart flips its axis; `TrendBadge` points the arrow the way the number
moved and colors it by whether that's *good* — for position those disagree.

**Rates are weighted, never averaged.** Portfolio CTR is `Σclicks / Σimpressions`,
not the mean of four CTRs. Average position is impression-weighted, engagement
time is session-weighted.

**The chart palette is validated, not eyeballed.** Eight fixed categorical hues,
assigned in order and never cycled, checked against both surfaces for CVD
separation and contrast. Colors resolve via CSS custom properties
(`var(--series-1)`), so dark mode re-steps every series at the token level.
Bars carry direct value labels, which is what discharges the sub-3:1 contrast of
two light-mode slots.

**Sparklines aren't Recharts.** The portfolio renders ~40 at once; each Recharts
instance brings a ResponsiveContainer and a ResizeObserver. `components/charts/sparkline.tsx`
is a single memoised SVG path. Recharts earns its weight where axes, tooltips and
legends matter.

**Filters live in the URL.** `?site=…&range=…&compare=…` — shareable,
bookmarkable, survives refresh, one source of truth. On `/site/[siteId]` the path
*is* the selection, so the site switcher navigates instead of writing a param.

**The shell is server-rendered.** `useSearchParams` opts its subtree out of
static rendering, so the Suspense fallback *is* the first paint — it renders the
real sidebar and a skeleton, not `null`.

## Icons

The favicon is the same `Radar` mark as the sidebar brand, drawn with lucide's
exact path geometry so the two can't drift apart. Next.js picks all three up by
filename — no `<head>` wiring:

| File | Used by |
| --- | --- |
| `app/icon.svg` | Chrome / Edge / Firefox — sharp at every size, ~1.5KB |
| `app/favicon.ico` | Safari and Windows (16/32/48, PNG-in-ICO) |
| `app/apple-icon.png` | iOS home screen (180px, full-bleed) |

`icon.svg` is the source of truth. The ICO exists because **Safari only gained
SVG favicon support in v26** — without it, ~11% of traffic gets a blank mark.
After editing the SVG, regenerate the rasters:

```bash
npm install --no-save sharp && node scripts/generate-icons.mjs
```

`sharp` is intentionally not a dependency — it's a ~30MB native install for
something that runs only when the logo changes. The outputs are committed.

> Keep `--` out of the SVG's comments. XML forbids double hyphens in comments;
> browsers tolerate it, but librsvg (the rasteriser) rejects the whole file.

## Mock data

The default provider. Deterministic and seeded (mulberry32), keyed to a fixed
`ANCHOR_DATE` so the server and client always agree — no hydration mismatch, no
numbers that change on reload. Profiles live in
[`services/providers/mock/profiles.ts`](services/providers/mock/profiles.ts),
keyed by website id, and describe only the *shape of the traffic* — identity
stays in `lib/websites.ts`.

| Site | Character |
| --- | --- |
| The Doc Mirror | Highest volume, strongest grower |
| NextDot | Best CTR and best position, steady |
| FWDPod | Huge impressions, thin CTR, losing traffic |
| ShopYukti | High-volume retail: spiky, mobile-heavy, deepest sessions |

Traffic is `baseline × bounded drift × weekly seasonality × seeded noise`. The
drift saturates via `tanh` in log space — naive compounding is fine over 28 days
and absurd over 365 (it reads "+1600% vs previous year"); real properties grow
into a ceiling.

Adding a site to the mock provider means one entry here. A site configured in
`lib/websites.ts` with no profile returns a typed `not_configured` error rather
than rendering as zeros.

Set `MOCK_LATENCY=0` to remove the simulated 120ms and see the skeletons
disappear.
