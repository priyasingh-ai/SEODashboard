import type { NextRequest } from "next/server";
import { getKeywordPerformance } from "@/services";
import { withApi, parseParams } from "../_lib/handler";

/**
 * GET /api/keyword-performance
 *
 * Full keyword table for the Keywords page.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(() => getKeywordPerformance(parseParams(request)));
}
