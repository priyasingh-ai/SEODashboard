/**
 * Formatting primitives.
 *
 * All of these are locale-independent by construction (`en-US`), because the
 * server and the client must produce byte-identical strings or React throws a
 * hydration mismatch.
 */

const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const full = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 12_400 -> "12.4K". For axis ticks and dense cards. */
export function formatCompact(n: number): string {
  return compact.format(n);
}

/** 12_400 -> "12,400". For tables and tooltips, where precision matters. */
export function formatNumber(n: number): string {
  return full.format(n);
}

/** 0.0412 -> "4.12%" */
export function formatPercent(n: number, digits = 2): string {
  return `${(n * 100).toFixed(digits)}%`;
}

/** 0.124 -> "+12.4%" — always signed, for deltas. */
export function formatDelta(n: number, digits = 1): string {
  const pct = n * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

/** 12.42 -> "12.4" — average SERP position. */
export function formatPosition(n: number): string {
  return n.toFixed(1);
}

/** 94 -> "1m 34s" */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m === 0) return `${rem}s`;
  return `${m}m ${rem.toString().padStart(2, "0")}s`;
}

/** Truncate a long URL path for table cells, keeping the tail readable. */
export function truncatePath(path: string, max = 48): string {
  if (path.length <= max) return path;
  return `${path.slice(0, max - 1)}…`;
}

/**
 * "2h ago" — relative to a fixed anchor rather than `Date.now()`, so it renders
 * identically on the server and the client.
 */
export function formatRelativeTime(iso: string, nowIso: string): string {
  const diff = new Date(nowIso).getTime() - new Date(iso).getTime();
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
