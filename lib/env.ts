import "server-only";

import type { DataSourceKind } from "@/services/types";

/**
 * Server-only configuration.
 *
 * The `server-only` import at the top is load-bearing: if any client component
 * ever imports this module — directly or through a chain — the build fails with
 * an explicit error instead of quietly inlining a private key into the browser
 * bundle. That's the guarantee that credentials cannot leak, enforced by the
 * compiler rather than by convention.
 *
 * Nothing here is read at module scope, so importing this file never throws.
 * Validation happens when a value is actually needed, which keeps the mock path
 * running with zero configuration.
 */

function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

/** Which provider backs the service layer. Defaults to mock. */
export function dataSourceKind(): DataSourceKind {
  return read("DATA_SOURCE") === "google" ? "google" : "mock";
}

export interface GoogleCredentials {
  clientEmail: string;
  /** PEM private key, newlines already normalised. */
  privateKey: string;
  projectId?: string;
}

/**
 * Service-account credentials for server-to-server Google API access.
 *
 * Returns `undefined` rather than throwing when unset — the caller decides
 * whether that's fatal, which keeps `DATA_SOURCE=mock` working on a machine
 * with no Google setup at all.
 */
export function googleCredentials(): GoogleCredentials | undefined {
  const clientEmail = read("GOOGLE_CLIENT_EMAIL");
  const rawKey = read("GOOGLE_PRIVATE_KEY");
  if (!clientEmail || !rawKey) return undefined;

  return {
    clientEmail,
    // Normalise the PEM.
    //
    // Node's own `--env-file` / `.env.local` loader already unescapes `\n`
    // inside a double-quoted value, so this is a no-op there. It matters for
    // the loaders that DON'T: pasting a key into the Vercel/Netlify dashboard,
    // or reading it from a secret manager, yields a single line with literal
    // backslash-n. Left as-is, the JWT signer fails with an opaque
    // "error:1E08010C:DECODER routines::unsupported".
    //
    // `read()` has already trimmed the trailing newline; PEM parsers don't
    // require it.
    privateKey: rawKey.replace(/\\n/g, "\n"),
    projectId: read("GOOGLE_PROJECT_ID"),
  };
}

/** How long a successful upstream response stays warm, in seconds. */
export function cacheTtlSeconds(): number {
  const raw = read("DATA_CACHE_TTL");
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 300;
}

/** Artificial latency for the mock provider, so loading states get exercised. */
export function mockLatencyMs(): number {
  const parsed = Number(read("MOCK_LATENCY") ?? "120");
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 120;
}

/**
 * Whether live Google calls can actually be made right now.
 * Route Handlers check this to return a clean `not_configured` instead of
 * letting an auth error surface as a 500.
 */
export function isGoogleReady(): boolean {
  return dataSourceKind() === "google" && googleCredentials() !== undefined;
}
