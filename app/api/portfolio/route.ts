import type { NextRequest } from "next/server";
import { getPortfolio } from "@/services";
import { withApi, parsePortfolioParams } from "../_lib/handler";

/**
 * GET /api/portfolio
 *
 * Every configured website side by side, plus the weighted roll-up.
 *
 * All Google API access happens here, on the server. The browser only ever sees
 * this endpoint's JSON — credentials stay in the Node runtime.
 */
export async function GET(request: NextRequest) {
  return withApi(async () => getPortfolio(await parsePortfolioParams(request)));
}
