/**
 * Verify Google setup before running the dashboard.
 *
 *   node scripts/check-google.mjs
 *
 * Reads .env.local, validates every value, and then makes one real API call per
 * property so the failure surfaces here — with the fix named — rather than as a
 * red panel in the UI.
 *
 * Deliberately a plain Node script, not part of the app: it must run even when
 * the app's config is broken, which is exactly when you need it.
 *
 * Credentials are never printed. The private key is only ever reported as
 * "looks valid" / "malformed".
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// Optional path arg so the checker can be pointed at another env file without
// touching .env.local.
// `resolve` (not `join`) so an absolute path passed as an arg is honoured.
const envPath = process.argv[2] ? resolve(process.argv[2]) : join(root, ".env.local");

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const ok = (m) => console.log(`  ${GREEN}✓${RESET} ${m}`);
const bad = (m, fix) => {
  console.log(`  ${RED}✗${RESET} ${m}`);
  if (fix) console.log(`      ${DIM}→ ${fix}${RESET}`);
  failures++;
};
const warn = (m) => console.log(`  ${YELLOW}!${RESET} ${m}`);

let failures = 0;

/* -------------------------------------------------------------------------- */

if (!existsSync(envPath)) {
  console.log(`\n${RED}.env.local not found.${RESET}`);
  console.log(`Run: cp .env.example .env.local\n`);
  process.exit(1);
}

/**
 * Minimal .env parser.
 *
 * Handles the one case that matters here: a double-quoted value containing
 * literal \n sequences (the private key), which must be unescaped exactly the
 * way lib/env.ts does it or this check would disagree with the app.
 */
function parseEnv(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length > 1) {
      value = value.slice(1, -1).replace(/\\n/g, "\n");
    }
    out[key] = value;
  }
  return out;
}

const env = parseEnv(readFileSync(envPath, "utf8"));

const SITES = [
  { name: "The Doc Mirror", key: "TDM" },
  { name: "NextDot", key: "NEXTDOT" },
  { name: "FWDPod", key: "FWDPOD" },
  { name: "ShopYukti", key: "SHOPYUKTI" },
];

console.log("\n─── 1. Credentials ───────────────────────────────────\n");

const clientEmail = env.GOOGLE_CLIENT_EMAIL ?? "";
const privateKey = env.GOOGLE_PRIVATE_KEY ?? "";

if (!clientEmail) {
  bad("GOOGLE_CLIENT_EMAIL is empty", 'Copy "client_email" from the service-account JSON');
} else if (!/^[^@]+@[^@]+\.iam\.gserviceaccount\.com$/.test(clientEmail)) {
  bad(
    `GOOGLE_CLIENT_EMAIL doesn't look like a service account: ${clientEmail}`,
    "It should end in .iam.gserviceaccount.com — not your personal Gmail",
  );
} else {
  ok(`GOOGLE_CLIENT_EMAIL  ${clientEmail}`);
}

if (!privateKey) {
  bad("GOOGLE_PRIVATE_KEY is empty", 'Copy "private_key" from the JSON, keep the quotes');
} else if (!privateKey.includes("BEGIN PRIVATE KEY")) {
  bad(
    "GOOGLE_PRIVATE_KEY is missing its PEM header",
    "Paste the whole value including -----BEGIN PRIVATE KEY-----",
  );
} else if (!privateKey.includes("\n")) {
  bad(
    "GOOGLE_PRIVATE_KEY has no line breaks",
    'Wrap it in double quotes so the \\n sequences survive: GOOGLE_PRIVATE_KEY="-----BEGIN..."',
  );
} else {
  ok(`GOOGLE_PRIVATE_KEY   looks valid (${privateKey.split("\n").length} lines)`);
}

console.log("\n─── 2. Property bindings ─────────────────────────────\n");

for (const site of SITES) {
  const ga4 = env[`GA4_PROPERTY_${site.key}`] ?? "";
  const gsc = env[`GSC_PROPERTY_${site.key}`] ?? "";

  if (!ga4) {
    bad(`${site.name}: GA4_PROPERTY_${site.key} is empty`, "GA4 → Admin → Property Settings → PROPERTY ID");
  } else if (/^G-/i.test(ga4)) {
    bad(
      `${site.name}: GA4_PROPERTY_${site.key}="${ga4}" is a Measurement ID`,
      "You need the numeric Property ID (e.g. 493812345), not the G-XXXX tag",
    );
  } else if (!/^\d+$/.test(ga4)) {
    bad(`${site.name}: GA4_PROPERTY_${site.key}="${ga4}" should be digits only`);
  } else {
    ok(`${site.name.padEnd(15)} GA4 ${ga4}   GSC ${gsc || "(missing)"}`);
  }

  if (!gsc) bad(`${site.name}: GSC_PROPERTY_${site.key} is empty`);
}

console.log("\n─── 3. Live connection ───────────────────────────────\n");

if (failures > 0) {
  warn("Skipping live check — fix the errors above first.\n");
  process.exit(1);
}

const { google } = await import("googleapis");
const { BetaAnalyticsDataClient } = await import("@google-analytics/data");

// The same window the dashboard's "7 days" preset uses: seven days ending
// yesterday, matching REPORTING_LAG_DAYS in lib/date-range.ts.
//
// It used to be an arbitrary -11..-4 window while the output still said
// "last 7d". That made this script useless for the thing people actually reach
// for it to do — checking whether the dashboard agrees with Google — because
// the two were never looking at the same days. Keep these aligned.
const end = new Date(Date.now() - 1 * 86400000).toISOString().slice(0, 10);
const start = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

function explain(error) {
  const msg = error?.message ?? String(error);
  if (/DECODER routines|no start line/i.test(msg))
    return "private key is malformed — re-copy it from the JSON, keep the quotes";
  if (/invalid_grant/i.test(msg))
    return "credentials rejected — check the email matches the key, and this machine's clock";
  if (/permission|forbidden|does not have sufficient/i.test(msg))
    return `access not granted — add ${clientEmail} to this property`;
  if (/not found|404/i.test(msg)) return "property not found — check the ID / property format";
  if (/has not been used in project|SERVICE_DISABLED|is disabled/i.test(msg))
    return "API not enabled on the Cloud project — enable it in the API Library";
  if (/quota|RESOURCE_EXHAUSTED/i.test(msg)) return "quota exhausted — retry shortly";
  return msg.split("\n")[0].slice(0, 140);
}

const auth = new google.auth.JWT({
  email: clientEmail,
  key: privateKey,
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
const searchconsole = google.searchconsole({ version: "v1", auth });
const ga = new BetaAnalyticsDataClient({
  credentials: { client_email: clientEmail, private_key: privateKey },
});

// Stated up front so the output can be checked against the Google UIs without
// guessing which days it covers — set the same range there before comparing.
console.log(`  Window: ${start} → ${end}  (same as the dashboard's "7 days")\n`);

for (const site of SITES) {
  const ga4Id = env[`GA4_PROPERTY_${site.key}`];
  const gscProp = env[`GSC_PROPERTY_${site.key}`];
  console.log(`  ${site.name}`);

  try {
    const res = await searchconsole.searchanalytics.query({
      siteUrl: gscProp,
      // `all` to include the newest, not-yet-finalised days — the same request
      // the app makes. The API default of `final` would withhold them and make
      // this disagree with the dashboard it exists to verify.
      requestBody: {
        startDate: start,
        endDate: end,
        dimensions: [],
        rowLimit: 1,
        dataState: "all",
      },
    });
    const row = res.data.rows?.[0];
    ok(
      row
        ? `    Search Console  ${row.clicks} clicks, ${row.impressions} impressions`
        : "    Search Console  connected (no data in this window yet)",
    );
  } catch (e) {
    bad(`    Search Console  ${explain(e)}`);
  }

  try {
    const [res] = await ga.runReport({
      property: `properties/${ga4Id}`,
      dateRanges: [{ startDate: start, endDate: end }],
      metrics: [{ name: "totalUsers" }, { name: "sessions" }],
    });
    const m = res.rows?.[0]?.metricValues ?? [];
    ok(
      m.length
        ? `    Analytics       ${m[0]?.value ?? 0} users, ${m[1]?.value ?? 0} sessions`
        : "    Analytics       connected (no data in this window yet)",
    );
  } catch (e) {
    bad(`    Analytics       ${explain(e)}`);
  }
  console.log("");
}

if (failures === 0) {
  console.log(`${GREEN}All four sites connected.${RESET}`);
  console.log(`Set DATA_SOURCE=google in .env.local and run: npm run dev\n`);
} else {
  console.log(`${RED}${failures} problem(s) above.${RESET} Fix and re-run this check.\n`);
  process.exit(1);
}
