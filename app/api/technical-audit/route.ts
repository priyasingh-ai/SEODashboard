import type { NextRequest } from "next/server";
import { getTechnicalAudit } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

/**
 * A scan fetches the customer's live pages and spends URL Inspection quota, so
 * it can take well over the default serverless timeout on a slow origin.
 *
 * URL Inspection is slow — roughly 7s per URL — so `MAX_PAGES` (30) at
 * `INSPECT_CONCURRENCY` (8) is about 26s of inspection, run alongside the page
 * fetches. 120s leaves headroom for a slow origin and for the Core Web Vitals
 * call, which waits up to 45s when PAGESPEED_API_KEY is set.
 *
 * This is a ceiling, not a reservation, and a plan may cap it lower: Vercel's
 * Hobby functions stop at 60s whatever this says. Raising `MAX_PAGES` without
 * raising this fails in production while still passing locally, where no
 * timeout applies at all.
 */
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  return withApi(async () => getTechnicalAudit(await parseParams(request)));
}
