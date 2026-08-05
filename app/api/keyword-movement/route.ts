import type { NextRequest } from "next/server";
import { getKeywordMovement } from "@/services";
import { parseMovementParams, withApi } from "../_lib/handler";

export async function GET(request: NextRequest) {
  return withApi(() => getKeywordMovement(parseMovementParams(request)));
}
