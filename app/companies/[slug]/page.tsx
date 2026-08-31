import { notFound } from "next/navigation";
import { ConvexHttpClient } from "convex/browser";

import { api } from "@/convex/_generated/api";
import { salaryCompanies } from "@/lib/salary-data";
import { CompanyProfile } from "./company-profile";

/**
 * An unknown slug used to render a bespoke "Company not found" panel under an
 * HTTP 200 — so a stale or mistyped link looked like a real page to a crawler,
 * to the browser's history, and to anything checking status codes.
 *
 * The compiled-in catalog answers most of these for free; only a slug outside
 * it costs a Convex call, and that call is a single indexed lookup.
 */
async function companyExists(slug: string): Promise<boolean> {
  if (salaryCompanies.some((company) => company.slug === slug)) return true;
  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  // With no backend configured, or with one that is briefly unreachable, the
  // safe answer is "maybe" — turning a real company into a 404 because a
  // request failed would be worse than the soft 404 this replaces.
  if (convexUrl === undefined) return true;
  try {
    return await new ConvexHttpClient(convexUrl).query(
      api.companyResearch.companyExists,
      { slug },
    );
  } catch {
    return true;
  }
}

export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await companyExists(slug))) notFound();
  return <CompanyProfile slug={slug} />;
}
