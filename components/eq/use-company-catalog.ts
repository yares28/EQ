"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  buildCompanyResearchCatalog,
  type CompanyCatalogPoint,
  type CompanyPostedRange,
  type TrackedCompanySummary,
} from "@/lib/company-research-catalog";
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

  return {
    companies,
    postedRanges,
    catalogPoints,
    trackedCompanies,
    companyPostedSalary,
    catalogReady:
      trackedCompaniesQuery !== undefined &&
      companyPostedSalary !== undefined &&
      catalogPointsQuery !== undefined,
  };
}
