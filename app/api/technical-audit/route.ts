import type { NextRequest } from "next/server";
import { getTechnicalAudit } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

/**
 * A scan fetches the customer's live pages and spends URL Inspection quota, so
 * it can take well over the default serverless timeout on a slow origin.
 *
 * 300s because URL Inspection is slow — roughly 7s per URL — and `MAX_PAGES`
 * is 100. At `INSPECT_CONCURRENCY` of 8 that is about ninety seconds of
 * inspection, run alongside the page fetches; the rest is headroom for a slow
 * origin. Lowering this without lowering `MAX_PAGES` in lib/technical/scan.ts
 * fails in production while still passing locally, where no timeout applies.
 */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return withApi(() => getTechnicalAudit(parseParams(request)));
}
