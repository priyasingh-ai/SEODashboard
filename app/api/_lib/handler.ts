import "server-only";

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cacheTtlSeconds } from "@/lib/env";
import { resolveRange } from "@/lib/date-range";
import { resolveReportingAnchor } from "@/lib/reporting-anchor";
import type { DateRange, MovementWindow, RangeKey } from "@/types";
import {
  HTTP_STATUS_BY_CODE,
  ServiceError,
  type ApiErrorBody,
  type MovementParams,
  type PortfolioParams,
  type ServiceParams,
  type ServiceResponse,
} from "@/services/types";

/**
 * Shared plumbing for every Route Handler.
 *
 * Request parsing, error mapping and cache headers are identical across the six
 * endpoints, so they live here once. Each route file is then just "parse, call
 * one service function, return" — which is what makes adding an endpoint cheap.
 *
 * ## Where authentication goes
 *
 * `withApi` is the single choke point every data request passes through. When
 * auth lands, it is one block at the top of this function:
 *
 * ```ts
 * const session = await auth();
 * if (!session) throw new ServiceError("unauthorized", "Sign in required.", 401);
 * if (!canAccess(session, params.websiteId)) throw new ServiceError(...);
 * ```
 *
 * No route file and no component changes — which is why the handlers were built
 * around this wrapper rather than each doing its own parsing.
 */

const VALID_RANGES: RangeKey[] = ["7d", "28d", "3m", "12m", "custom"];

function isRangeKey(v: string | null): v is RangeKey {
  return !!v && (VALID_RANGES as string[]).includes(v);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Read filters off the query string.
 *
 * Everything is validated: these values reach the Google APIs, and an
 * unvalidated date would surface as an opaque upstream 400.
 *
 * Async because a preset range has to be resolved against the measured
 * reporting anchor, which is a (cached) Search Console call. The client sends
 * the range *key*; the server decides the dates. That asymmetry is deliberate —
 * it means a stale tab cannot pin the dashboard to yesterday's window.
 */
export async function parseParams(request: NextRequest): Promise<ServiceParams> {
  const q = request.nextUrl.searchParams;

  const websiteId = q.get("websiteId") ?? q.get("site") ?? "";
  if (!websiteId) {
    throw new ServiceError("invalid_request", "Missing `websiteId`.", 400);
  }

  return { websiteId, ...(await parsePortfolioParams(request)) };
}

const VALID_WINDOWS: MovementWindow[] = ["day", "week", "month"];

/** `parseParams` plus the keyword-movement window. Defaults to week-over-week. */
export async function parseMovementParams(request: NextRequest): Promise<MovementParams> {
  const window = request.nextUrl.searchParams.get("window");
  return {
    ...(await parseParams(request)),
    window: (VALID_WINDOWS as string[]).includes(window ?? "")
      ? (window as MovementWindow)
      : "week",
  };
}

/** The same filters minus `websiteId`, for portfolio-wide endpoints. */
export async function parsePortfolioParams(request: NextRequest): Promise<PortfolioParams> {
  const q = request.nextUrl.searchParams;

  const rangeParam = q.get("range");
  const range: RangeKey = isRangeKey(rangeParam) ? rangeParam : "28d";

  let custom: DateRange | undefined;
  if (range === "custom") {
    const from = q.get("from");
    const to = q.get("to");
    if (!from || !to || !ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      throw new ServiceError(
        "invalid_request",
        "A custom range needs `from` and `to` as YYYY-MM-DD.",
        400,
      );
    }
    if (from > to) {
      throw new ServiceError("invalid_request", "`from` must not be after `to`.", 400);
    }
    custom = { from, to };
  }

  // A custom range is taken verbatim, so the anchor is only fetched when a
  // preset actually needs it.
  const anchor = range === "custom" ? undefined : await resolveReportingAnchor();

  return {
    dateRange: resolveRange(range, custom, anchor),
    comparePreviousPeriod: q.get("compare") !== "0",
    refresh: q.get("refresh") === "1",
  };
}

function errorBody(error: unknown): { body: ApiErrorBody; status: number; retryAfter?: number } {
  if (error instanceof ServiceError) {
    return {
      body: {
        error: {
          code: error.code,
          message: error.message,
          retryAfter: error.retryAfter,
        },
      },
      status: error.status || HTTP_STATUS_BY_CODE[error.code],
      retryAfter: error.retryAfter,
    };
  }

  // Never leak an internal stack or upstream message to the client.
  return {
    body: {
      error: {
        code: "upstream_error",
        message: "Something went wrong loading this data. Try again in a moment.",
      },
    },
    status: 502,
  };
}

/**
 * Wrap a handler with error mapping and caching.
 *
 * Responses are cached at the edge with `stale-while-revalidate`, so a repeat
 * view is instant and a slightly stale number is served while the refresh
 * happens behind it. Errors are never cached.
 */
export async function withApi<T>(
  run: () => Promise<ServiceResponse<T>>,
): Promise<NextResponse> {
  try {
    const result = await run();
    const ttl = cacheTtlSeconds();

    return NextResponse.json(result, {
      headers: {
        "Cache-Control":
          ttl > 0
            ? `private, max-age=${ttl}, stale-while-revalidate=${ttl * 2}`
            : "no-store",
      },
    });
  } catch (error) {
    // Server-side only — the client gets the sanitised body above.
    console.error("[api]", error);

    const { body, status, retryAfter } = errorBody(error);
    return NextResponse.json(body, {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}),
      },
    });
  }
}
