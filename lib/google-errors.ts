import "server-only";

import { ServiceError } from "@/services/types";

/**
 * Translate a Google API failure into a typed `ServiceError`.
 *
 * Shared by both clients because the failure modes are identical — they're the
 * same auth layer and the same quota system underneath.
 *
 * The mapping exists because the raw errors are actively misleading during
 * setup. The single most common mistake — an unquoted or newline-mangled
 * `GOOGLE_PRIVATE_KEY` — surfaces from OpenSSL as
 * `error:1E08010C:DECODER routines::unsupported`, which says nothing about env
 * vars and sends people looking in the wrong place entirely. Every branch here
 * names the thing to actually go and fix.
 */
export function mapGoogleError(
  error: unknown,
  context: { api: "GA4" | "Search Console"; target: string },
): ServiceError {
  if (error instanceof ServiceError) return error;

  const err = error as { code?: number | string; message?: string };
  const code = typeof err.code === "number" ? err.code : undefined;
  const message = err.message ?? String(error);

  // Malformed PEM — OpenSSL couldn't parse the key at all.
  if (/DECODER routines|unsupported|no start line|bad decrypt|PEM/i.test(message)) {
    return new ServiceError(
      "not_configured",
      'GOOGLE_PRIVATE_KEY could not be parsed. It must be wrapped in double quotes and keep its \\n sequences, e.g. GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n" — copy the private_key field from the service-account JSON verbatim.',
      503,
    );
  }

  // Clock skew breaks JWT signing and is otherwise baffling to diagnose.
  if (/invalid_grant/i.test(message)) {
    return new ServiceError(
      "unauthorized",
      "Google rejected the credentials (invalid_grant). Check GOOGLE_CLIENT_EMAIL matches the key, that the service account still exists, and that this machine's clock is correct.",
      401,
    );
  }

  if (code === 401 || /unauthorized|invalid credentials/i.test(message)) {
    return new ServiceError(
      "unauthorized",
      "Google rejected the service-account credentials. Check GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.",
      401,
    );
  }

  if (code === 403 || /permission|forbidden|does not have sufficient/i.test(message)) {
    return new ServiceError(
      "unauthorized",
      context.api === "GA4"
        ? `The service account can't read GA4 property ${context.target}. Add its email as a Viewer under Admin › Property Access Management.`
        : `The service account can't read "${context.target}". Add its email under Settings › Users and permissions on that property.`,
      401,
    );
  }

  if (code === 429 || /quota|rate limit|RESOURCE_EXHAUSTED/i.test(message)) {
    return new ServiceError(
      "rate_limited",
      `${context.api} API quota exhausted. Data will load again shortly.`,
      429,
      60,
    );
  }

  if (code === 404 || /not found/i.test(message)) {
    return new ServiceError(
      "not_configured",
      context.api === "GA4"
        ? `GA4 property "${context.target}" was not found. The GA4_PROPERTY_* value should be the numeric property id — digits only, no "properties/" prefix.`
        : `Search Console property "${context.target}" was not found. Use sc-domain:example.com for a Domain property, or the exact URL-prefix property including its trailing slash.`,
      503,
    );
  }

  // API not enabled on the Cloud project — another silent-until-you-hit-it one.
  if (/has not been used in project|is disabled|SERVICE_DISABLED/i.test(message)) {
    return new ServiceError(
      "not_configured",
      context.api === "GA4"
        ? "The Google Analytics Data API is not enabled on this Cloud project. Enable it in the API Library, then retry."
        : "The Search Console API is not enabled on this Cloud project. Enable it in the API Library, then retry.",
      503,
    );
  }

  return new ServiceError("upstream_error", `${context.api} request failed: ${message}`, 502);
}
