import type { NextRequest } from "next/server";
import { getSearchBreakdowns } from "@/services";
import { parseParams, withApi } from "../_lib/handler";

export async function GET(request: NextRequest) {
  return withApi(async () => getSearchBreakdowns(await parseParams(request)));
}
