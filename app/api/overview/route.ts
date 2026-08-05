import type { NextRequest } from "next/server";
import { getOverview } from "@/services";
import { withApi, parseParams } from "../_lib/handler";

/**
 * GET /api/overview
 *
 * Overview metrics for one website — the ten cards on a dashboard.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(() => getOverview(parseParams(request)));
}
