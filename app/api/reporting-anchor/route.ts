import { NextResponse } from "next/server";
import { resolveReportingAnchor } from "@/lib/reporting-anchor";

/**
 * Where the reporting window ends, for the client.
 *
 * The browser needs this to label the range and to key its request cache, and
 * it cannot work it out for itself — the answer comes from Search Console,
 * behind credentials that never reach a browser bundle.
 *
 * Deliberately the one endpoint outside `withApi`: it takes no parameters, has
 * no envelope, and must never fail. `resolveReportingAnchor` already falls back
 * rather than throwing, so this always answers with a usable date.
 */

/**
 * Without this Next would evaluate a parameterless GET at build time and serve
 * the build day's answer forever — the exact staleness this endpoint exists to
 * remove.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const anchor = await resolveReportingAnchor();

  return NextResponse.json(
    { anchor },
    {
      // Short, because it decides which dates the whole dashboard shows. Five
      // minutes of staleness is invisible; a day of it is the original bug.
      headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=900" },
    },
  );
}
