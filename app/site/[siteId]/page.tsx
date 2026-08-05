import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ACTIVE_WEBSITES, findWebsite, isKnownWebsite } from "@/lib/websites";
import { SiteDashboard } from "./site-dashboard";

/**
 * Server component wrapper.
 *
 * The param is validated here rather than in the client dashboard so an unknown
 * site is a real HTTP 404 with a real <title>, not a 200 that renders a
 * not-found box after hydration. It also lets the route pre-generate one path
 * per connected site.
 */

export function generateStaticParams() {
  return ACTIVE_WEBSITES.map((site) => ({ siteId: site.id }));
}

/**
 * Only the enumerated sites exist. Without this, an unknown :siteId renders on
 * demand — and because the root layout streams its Suspense shell first, the
 * 200 is already flushed by the time `notFound()` runs, so the browser gets a
 * 404 page under a 200 status. `dynamicParams: false` rejects the route before
 * any of that, which is a real 404.
 */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}): Promise<Metadata> {
  const { siteId } = await params;
  const site = findWebsite(siteId);
  return { title: site ? site.name : "Not found" };
}

export default async function SiteDashboardPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  if (!isKnownWebsite(siteId)) notFound();

  return <SiteDashboard siteId={siteId} />;
}
