import type { NextRequest } from "next/server";
import { getAnalyticsInsights } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

export async function GET(request: NextRequest) {
  return withApi(async () => getAnalyticsInsights(await parseParams(request)));
}
