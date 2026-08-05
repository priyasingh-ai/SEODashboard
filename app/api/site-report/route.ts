import type { NextRequest } from "next/server";
import { getSiteReport } from "@/services";
import { withApi, parseParams } from "../_lib/handler";

/**
 * GET /api/site-report
 *
 * Everything one website dashboard needs, in a single round trip.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(() => getSiteReport(parseParams(request)));
}
