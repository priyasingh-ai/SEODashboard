import "server-only";

import { dataSourceKind } from "@/lib/env";
import type { DataProvider } from "./types";
import { mockProvider } from "./mock";
import { googleProvider } from "./google";

/**
 * Resolve the active provider from configuration.
 *
 * Adding a third source — a warehouse, a nightly cache, a CSV import — means
 * implementing `DataProvider` and adding one line here. Nothing above this file
 * knows which provider it is talking to.
 */
export function getProvider(): DataProvider {
  return dataSourceKind() === "google" ? googleProvider : mockProvider;
}

export type { DataProvider, ProviderContext } from "./types";
