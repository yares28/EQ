"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  buildCompanyResearchCatalog,
  type CompanyCatalogPoint,
  type CompanyPostedRange,
  type TrackedCompanySummary,
} from "@/lib/company-research-catalog";
import { buildCompanyPipeline, type CompanyPipeline } from "@/lib/company-pipeline";
import { salaryCompanies } from "@/lib/salary-data";

export function useCompanyCatalog() {
  const trackedCompaniesQuery = useQuery(api.companyResearch.listCompanies);
  const companyPostedSalary = useQuery(api.companySalaryResearch.latestDirectRanges);
  // Researched pay, for the companies whose own postings disclose none — which
  // in Spain is nearly all of them.
  const catalogPointsQuery = useQuery(api.companySalaryCatalog.catalogPoints);
  const trackedCompanies = (trackedCompaniesQuery ?? []) as TrackedCompanySummary[];
  const postedRanges = (companyPostedSalary?.ranges ?? []) as CompanyPostedRange[];
  const catalogPoints = (catalogPointsQuery ?? []) as CompanyCatalogPoint[];
  const companies = buildCompanyResearchCatalog({
    baseCompanies: salaryCompanies,
    trackedCompanies,
    postedRanges,
    catalogPoints,
  });

  // The three lists that describe what is actually pending, derived from the
  // subscriptions already open above rather than from queries of their own.
  //
  // The clock is rounded to the day it falls in. Only the re-check list reads
  // it, and it asks a thirty-day question — so a per-render `Date.now()` would
  // rebuild these arrays on every render to answer identically.
  const today = Math.floor(Date.now() / 86_400_000) * 86_400_000;
  const pipeline: CompanyPipeline = useMemo(
    () => buildCompanyPipeline({ trackedCompanies, catalogPoints, now: today }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the query results
    // are referentially stable per Convex update; `today` covers the clock.
    [trackedCompaniesQuery, catalogPointsQuery, today],
  );

  return {
    companies,
    postedRanges,
    catalogPoints,
    pipeline,
    trackedCompanies,
    companyPostedSalary,
    catalogReady:
      trackedCompaniesQuery !== undefined &&
      companyPostedSalary !== undefined &&
      catalogPointsQuery !== undefined,
  };
}
