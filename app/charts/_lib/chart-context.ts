import type { PersonalCityCost } from "@/lib/city-reference-costs";
import type { SalaryCompany, SalaryPoint } from "@/lib/salary-data";
import type { CompanyPostedRange } from "@/lib/company-research-catalog";
import type { SpainPayrollEstimate2026 } from "@/lib/spain-payroll-2026";
import type { CostMode, DecisionLocation, PayBasis } from "@/lib/salary-decision-context";
import type { TargetLevel } from "@/lib/salary-analytics";

/** One company plus everything already resolved for it at the active scope. */
export interface ChartRow {
  company: SalaryCompany;
  point: SalaryPoint | null;
  /** Monthly net cash, or null when the payroll model can't produce one
   * (unvalidated model, intern level, or no usable cash figure). */
  netMonthly: number | null;
  /** Monthly cash after the active cost mode. Can be NEGATIVE when the salary
   * cannot cover the city — that is a real answer, not a missing one. */
  afterCostsMonthly: number | null;
  /** Share of monthly net that living costs consume, 0–100+. */
  costSharePercent: number | null;
  payroll: SpainPayrollEstimate2026 | null;
}

/** The city cost bundle shape returned by madridCostResearch.latestCityLivingCosts. */
export interface CityCosts {
  cityKey: string;
  cityLabel: string;
  current: boolean;
  unmetRequirements: string[];
  readinessNote: string;
  monthlyRentEur: number;
  rentPerSquareMeterEur: number;
  rentSampleSize: number;
  monthlyEssentialsEur: number;
  monthlyReferenceCostEur: number;
  checkedAt: number;
  housingReferenceYear: number;
  householdBudgetReferenceYear: number;
  transportReferenceYear: number;
  items: {
    key: string;
    category: string;
    label: string;
    monthlyAmount: number;
    referenceYear: number;
    sourceUpdatedAt: number;
    checkedAt: number;
    datasetUrl: string;
  }[];
  sourceUrls: { ine: string; rent: string; transport: string };
}

export interface MarketBenchmark {
  key: string;
  label: string;
  amount: number;
  currency: string;
  period: "year";
  statistic: "mean";
  referenceYear: number;
  sourceUpdatedAt: number;
  checkedAt: number;
  datasetUrl: string;
}

/**
 * Everything the chart modules need, resolved once by the page so no chart
 * re-derives payroll or cost figures per render.
 */
export interface ChartContext {
  /** Companies in scope, already narrowed by scope + search. */
  companies: SalaryCompany[];
  /** Rows with a usable pay figure at the active level+location, pay-sorted. */
  rows: ChartRow[];
  /** Rows before the display cap, for honest counts. */
  rowsTotalCount: number;
  postedRanges: CompanyPostedRange[];
  level: TargetLevel;
  location: DecisionLocation;
  payBasis: PayBasis;
  costMode: CostMode;
  /** True only when the 2026 payroll model passed validation. */
  payrollReady: boolean;
  cityCosts: CityCosts | null;
  personalCost: PersonalCityCost | null;
  benchmarks: MarketBenchmark[];
}

/** Why a cost-based chart has nothing to show, in the user's terms. */
export function costModeEmptyReason(ctx: ChartContext): string {
  if (ctx.costMode === "off") {
    return "Living costs are switched off. Turn them on above to see what survives rent and essentials.";
  }
  if (ctx.costMode === "personal" && ctx.personalCost === null) {
    return `You have not saved personal costs for ${ctx.location} yet. Add them in Settings to see what actually survives your own spending.`;
  }
  if (ctx.costMode === "reference" && (ctx.cityCosts === null || !ctx.cityCosts.current)) {
    return `No validated cost bundle covers ${ctx.location}. Only Madrid and Valencia have one so far, so no reference cost figure is shown rather than borrowing another city's.`;
  }
  return "No company has enough cash evidence at this level to model living costs.";
}

/** Why a net-pay chart has nothing to show. */
export function payrollEmptyReason(ctx: ChartContext): string {
  if (!ctx.payrollReady) {
    return "The 2026 Spain payroll model has not passed validation, so no net figure is estimated anywhere in the app.";
  }
  if (ctx.level === "intern") {
    return "Net cash is not estimated for internships — the model is calibrated for full-year employment, not stipends.";
  }
  return "No company has a stated cash figure at this level to model take-home from.";
}
