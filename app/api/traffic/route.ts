import type { NextRequest } from "next/server";
import { getTraffic } from "@/services";
import { withApi, parseParams } from "../_lib/handler";

/**
 * GET /api/traffic
 *
 * Time series plus traffic-source and device breakdowns.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(async () => getTraffic(await parseParams(request)));
}
