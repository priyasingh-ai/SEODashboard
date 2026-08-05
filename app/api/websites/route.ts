import { NextResponse } from "next/server";
import { listWebsites } from "@/services";
import { dataSourceKind } from "@/lib/env";

/**
 * GET /api/websites
 *
 * The configured properties, as the client sees them — id, name, domain,
 * favicon, initials, last sync. The Google bindings are stripped by
 * `toSite()` in the service layer and never appear in this response.
 *
 * The UI reads its site list synchronously from `lib/websites.ts` (navigation
 * chrome shouldn't need a loading state), so this endpoint exists for external
 * consumers and for verifying what the server actually has configured.
 */
export async function GET() {
  try {
    return NextResponse.json({
      data: await listWebsites(),
      // Lets the Settings page state what's actually connected rather than
      // hardcoding a claim that goes stale the moment DATA_SOURCE flips.
      source: dataSourceKind(),
    });
  } catch (error) {
    console.error("[api/websites]", error);
    return NextResponse.json(
      { error: { code: "upstream_error", message: "Couldn't list websites." } },
      { status: 502 },
    );
  }
}
