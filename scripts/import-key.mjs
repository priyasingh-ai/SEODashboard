/**
 * Import a service-account JSON key into .env.local.
 *
 *   node scripts/import-key.mjs ~/Downloads/seo-dashboard-502809-a1b2c3.json
 *
 * Copying `private_key` by hand is the single most error-prone step of the
 * whole setup: it's a 1700-character value that must keep its literal \n
 * sequences and stay wrapped in double quotes. Get it wrong and OpenSSL fails
 * with `DECODER routines::unsupported`, which names nothing useful.
 *
 * This reads the JSON Google gave you and writes the three values in the exact
 * shape lib/env.ts expects. Existing lines are replaced in place; every other
 * line, comment and blank stays untouched.
 *
 * The key is never printed to the terminal.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = join(root, ".env.local");

const jsonArg = process.argv[2];
if (!jsonArg) {
  console.log(`\n${RED}Usage:${RESET} node scripts/import-key.mjs <path-to-service-account.json>\n`);
  console.log(`${DIM}e.g. node scripts/import-key.mjs ~/Downloads/seo-dashboard-502809-a1b2c3.json${RESET}\n`);
  process.exit(1);
}

const jsonPath = resolve(jsonArg);
if (!existsSync(jsonPath)) {
  console.log(`\n${RED}File not found:${RESET} ${jsonPath}\n`);
  process.exit(1);
}

let key;
try {
  key = JSON.parse(readFileSync(jsonPath, "utf8"));
} catch {
  console.log(`\n${RED}That file isn't valid JSON.${RESET} Use the key file Google downloaded.\n`);
  process.exit(1);
}

if (key.type !== "service_account" || !key.client_email || !key.private_key) {
  console.log(`\n${RED}That doesn't look like a service-account key.${RESET}`);
  console.log(`${DIM}Expected fields: type: "service_account", client_email, private_key${RESET}\n`);
  process.exit(1);
}

if (!existsSync(envPath)) {
  console.log(`\n${RED}.env.local not found.${RESET} Run: cp .env.example .env.local\n`);
  process.exit(1);
}

/**
 * Re-escape the PEM into a single quoted line.
 *
 * The JSON holds real newlines; the .env file needs literal \n, because the
 * loaders differ on whether they unescape (Node does, some hosts don't) and
 * lib/env.ts normalises either way.
 */
const escapedKey = key.private_key.replace(/\r?\n/g, "\\n");

const updates = {
  GOOGLE_CLIENT_EMAIL: key.client_email,
  GOOGLE_PRIVATE_KEY: `"${escapedKey}"`,
  GOOGLE_PROJECT_ID: key.project_id ?? "",
};

// Keep a one-time backup — this rewrites a file that may hold other secrets.
copyFileSync(envPath, `${envPath}.bak`);

let text = readFileSync(envPath, "utf8");
const applied = [];

for (const [name, value] of Object.entries(updates)) {
  if (!value) continue;
  // Anchored to line start so a mention inside a comment is never rewritten.
  const pattern = new RegExp(`^${name}=.*$`, "m");
  if (pattern.test(text)) {
    text = text.replace(pattern, `${name}=${value}`);
    applied.push(name);
  } else {
    text += `\n${name}=${value}\n`;
    applied.push(`${name} (appended)`);
  }
}

writeFileSync(envPath, text, "utf8");

console.log(`\n${GREEN}Imported into .env.local${RESET}\n`);
for (const name of applied) {
  const shown =
    name.startsWith("GOOGLE_PRIVATE_KEY")
      ? `${key.private_key.split("\n").length} lines, hidden`
      : updates[name.split(" ")[0]];
  console.log(`  ${GREEN}✓${RESET} ${name.split(" ")[0].padEnd(21)} ${shown}`);
}
console.log(`\n  ${DIM}backup: .env.local.bak${RESET}`);
console.log(`\nNext: add this email as a user on all 8 properties (4 GA4 + 4 GSC):`);
console.log(`  ${key.client_email}\n`);
console.log(`Then fill in the four GA4_PROPERTY_* ids and run: npm run check:google\n`);
