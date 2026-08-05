import type { NextRequest } from "next/server";
import { getContentHealth } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

/** Fetches live pages and inspects index status — well past the default limit. */
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  return withApi(() => getContentHealth(parseParams(request)));
}
