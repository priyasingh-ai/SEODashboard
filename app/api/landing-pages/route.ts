import type { NextRequest } from "next/server";
import { getLandingPages } from "@/services";
import { withApi, parseParams } from "../_lib/handler";

/**
 * GET /api/landing-pages
 *
 * Landing pages — Search Console joined with GA4 engagement.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(() => getLandingPages(parseParams(request)));
}
