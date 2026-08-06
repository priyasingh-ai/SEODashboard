import type { NextRequest } from "next/server";
import { getTopQueries } from "@/services";
import { withApi, parseParams } from "../_lib/handler";

/**
 * GET /api/top-queries
 *
 * Search Console query dimension, ranked by clicks.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(async () => getTopQueries(await parseParams(request)));
}
