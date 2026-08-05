import type { NextRequest } from "next/server";
import { getCompetitorReport } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

/** Crawls several external origins and may run model probes. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const params = parseParams(request);
  const competitors = (request.nextUrl.searchParams.get("competitors") ?? "")
    .split(",")
    .map((d) => d.trim())
    // Strip scheme and path — the scan builds its own origin.
    .map((d) => d.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d));

  return withApi(() => getCompetitorReport({ ...params, competitors }));
}
