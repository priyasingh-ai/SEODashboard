import type { NextRequest } from "next/server";
import { getCompetitorReport } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

/** Crawls several external origins and may run model probes. */
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const competitors = (request.nextUrl.searchParams.get("competitors") ?? "")
    .split(",")
    .map((d) => d.trim())
    // Strip scheme and path — the scan builds its own origin.
    .map((d) => d.replace(/^https?:\/\//i, "").replace(/\/.*$/, ""))
    .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d));

  // Parsed inside `withApi` so a bad request surfaces as a typed 400 rather
  // than an uncaught throw.
  return withApi(async () =>
    getCompetitorReport({ ...(await parseParams(request)), competitors }),
  );
}
