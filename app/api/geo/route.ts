import type { NextRequest } from "next/server";
import { getGeoReport } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

/** Model probes are sequential per provider and can run long. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  return withApi(async () => getGeoReport(await parseParams(request)));
}
