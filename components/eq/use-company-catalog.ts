"use client";

import { useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import {
  buildCompanyResearchCatalog,
  type CompanyPostedRange,
  type TrackedCompanySummary,
} from "@/lib/company-research-catalog";
import { salaryCompanies } from "@/lib/salary-data";

export function useCompanyCatalog() {
  const trackedCompaniesQuery = useQuery(api.companyResearch.listCompanies);
  const companyPostedSalary = useQuery(api.companySalaryResearch.latestDirectRanges);
  const trackedCompanies = (trackedCompaniesQuery ?? []) as TrackedCompanySummary[];
  const postedRanges = (companyPostedSalary?.ranges ?? []) as CompanyPostedRange[];
  const companies = buildCompanyResearchCatalog({
    baseCompanies: salaryCompanies,
    trackedCompanies,
    postedRanges,
  });

  return {
    companies,
    postedRanges,
    trackedCompanies,
    companyPostedSalary,
    catalogReady:
      trackedCompaniesQuery !== undefined && companyPostedSalary !== undefined,
  };
}
