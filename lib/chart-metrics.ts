import {
  decisionProgressionFor,
  equityShare,
  formatEuro,
  isPostedSalaryPoint,
  payAmountFor,
} from "./salary-analytics.ts";
import { opinionForCompany } from "./company-opinions.ts";
import { pointResearchQuality } from "./research-quality.ts";
import { analyzeSalaryNegotiation } from "./salary-negotiation.ts";
import { selectPostedRange } from "./company-research-catalog.ts";
import type { SalaryCompany, SalaryPoint } from "./salary-data.ts";
import type { CompanyPostedRange } from "./company-research-catalog.ts";
import type { DecisionLocation, PayBasis } from "./salary-decision-context.ts";
import type { TargetLevel } from "./salary-analytics.ts";

/**
 * Every quantity a chart can plot, declared once.
 *
 * The point of this file is that a chart axis is data, not code. Before it,
 * "pay versus employee sentiment" could only ever plot sentiment, because the
 * metric was hardcoded into the component. Anything declared here can go on
 * either axis of the explorer without touching a chart.
 *
 * Two rules every accessor follows:
 *   - It returns `null` for "no evidence", never 0. A missing figure that
 *     renders as zero is the failure mode this codebase guards against
 *     everywhere else, and it would quietly drag an average down.
 *   - It never returns Infinity or NaN. Several underlying helpers divide with
 *     only a null check, so guards live here rather than in each chart.
 */

/** The minimum a chart needs before a metric can produce anything. */
export type MetricRequirement =
  | "payroll-model"
  | "city-costs"
  | "sentiment"
  | "audited-ladder"
  | "peer-set";

export interface MetricRow {
  company: SalaryCompany;
  point: SalaryPoint | null;
  netMonthly: number | null;
  afterCostsMonthly: number | null;
  costSharePercent: number | null;
  effectiveDeductionRatePercent: number | null;
}

export interface MetricEnv {
  companies: SalaryCompany[];
  postedRanges: CompanyPostedRange[];
  level: TargetLevel;
  location: DecisionLocation;
  payBasis: PayBasis;
}

export type MetricUnit = "eur" | "eurPerMonth" | "percent" | "score" | "days" | "count";

export interface ChartMetric {
  id: string;
  label: string;
  /** One line on what the number means, shown under the axis picker. */
  description: string;
  unit: MetricUnit;
  requires: MetricRequirement[];
  /**
   * True when 0 is a genuine measurement rather than a stand-in for missing
   * data. "Zero peers to compare against" is a real finding; "€0 pay" never
   * is. Only counts set this — everything else must return null instead.
   */
  zeroIsRealValue?: boolean;
  accessor: (row: MetricRow, env: MetricEnv) => number | null;
}

/** Null unless the value is a real, finite number. */
function finite(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
}

export function formatMetric(value: number | null, unit: MetricUnit): string {
  if (value === null) return "—";
  switch (unit) {
    case "eur":
      return formatEuro(value, true);
    case "eurPerMonth":
      return `${formatEuro(value, true)}/mo`;
    case "percent":
      return `${Math.round(value * 10) / 10}%`;
    case "score":
      return `${Math.round(value * 100) / 100} / 5`;
    case "days":
      return `${Math.round(value)}d`;
    case "count":
      return String(Math.round(value));
  }
}

/** Axis tick text — compact, since ticks have far less room than a tooltip. */
export function formatMetricTick(value: number, unit: MetricUnit): string {
  switch (unit) {
    case "eur":
    case "eurPerMonth":
      return formatEuro(value, true);
    case "percent":
      return `${Math.round(value)}%`;
    case "score":
      return String(Math.round(value * 10) / 10);
    case "days":
      return `${Math.round(value)}d`;
    case "count":
      return String(Math.round(value));
  }
}

function negotiationFor(row: MetricRow, env: MetricEnv) {
  return analyzeSalaryNegotiation({
    company: row.company,
    point: row.point,
    companies: env.companies,
    postedRange: selectPostedRange({
      ranges: env.postedRanges,
      companySlug: row.company.slug,
      targetLevel: env.level,
      location: env.location,
    }),
  });
}

export const CHART_METRICS: ChartMetric[] = [
  {
    id: "pay",
    label: "Pay at this level",
    description: "The ranking figure — base or total, following the Rank by control.",
    unit: "eur",
    requires: [],
    accessor: (row, env) => finite(payAmountFor(row.point, env.payBasis)),
  },
  {
    id: "basePay",
    label: "Base pay",
    description: "Guaranteed salary before bonus and equity.",
    unit: "eur",
    requires: [],
    accessor: (row) => finite(row.point?.baseEur),
  },
  {
    id: "totalComp",
    label: "Total compensation",
    description: "Base plus bonus and equity, where the publisher states them.",
    unit: "eur",
    requires: [],
    accessor: (row) => finite(row.point?.totalCompEur),
  },
  {
    id: "equity",
    label: "Equity per year",
    description: "Annual equity value, where it is published.",
    unit: "eur",
    requires: [],
    accessor: (row) => finite(row.point?.equityEur),
  },
  {
    id: "equityShare",
    label: "Equity share of offer",
    description: "How much of total compensation is equity rather than cash.",
    unit: "percent",
    requires: [],
    accessor: (row) => finite(equityShare(row.point)),
  },
  {
    id: "netMonthly",
    label: "Net take-home",
    description: "Monthly cash after Spanish social security and IRPF.",
    unit: "eurPerMonth",
    requires: ["payroll-model"],
    accessor: (row) => finite(row.netMonthly),
  },
  {
    id: "afterCosts",
    label: "Left after living costs",
    description: "Monthly cash once rent and essentials are paid. Can be negative.",
    unit: "eurPerMonth",
    requires: ["payroll-model", "city-costs"],
    accessor: (row) => finite(row.afterCostsMonthly),
  },
  {
    id: "costShare",
    label: "Cost of living share",
    description: "What share of net pay the city takes. Lower is better.",
    unit: "percent",
    requires: ["payroll-model", "city-costs"],
    accessor: (row) => finite(row.costSharePercent),
  },
  {
    id: "deductionRate",
    label: "Effective deduction rate",
    description: "Share of gross lost to tax and social security.",
    unit: "percent",
    requires: ["payroll-model"],
    accessor: (row) => finite(row.effectiveDeductionRatePercent),
  },
  {
    id: "progressionPercent",
    label: "Next-level jump",
    description: "Pay increase at the next promotion the company's own sources name.",
    unit: "percent",
    requires: ["audited-ladder"],
    accessor: (row, env) => {
      const progression = decisionProgressionFor(row.company, env.level, env.location);
      if (progression === null || !progression.decisionGrade) return null;
      return finite(progression.percent);
    },
  },
  {
    id: "progressionDelta",
    label: "Next-level raise",
    description: "The promotion increase in money rather than percent.",
    unit: "eur",
    requires: ["audited-ladder"],
    accessor: (row, env) => {
      const progression = decisionProgressionFor(row.company, env.level, env.location);
      if (progression === null || !progression.decisionGrade) return null;
      return finite(progression.deltaEur);
    },
  },
  {
    id: "marketPercentile",
    label: "Market percentile",
    description: "Where the offer sits against peers at the same level and scope.",
    unit: "count",
    requires: ["peer-set"],
    accessor: (row, env) => finite(negotiationFor(row, env).marketPercentile),
  },
  {
    id: "peerCount",
    label: "Peers compared against",
    description: "How many companies the percentile is measured against.",
    unit: "count",
    requires: ["peer-set"],
    // A peer set of zero is a real answer, and an important one: it is why a
    // percentile is locked. Reporting it as unknown would hide that.
    zeroIsRealValue: true,
    accessor: (row, env) => finite(negotiationFor(row, env).comparableCompanyCount),
  },
  {
    id: "sentiment",
    label: "Employee sentiment",
    description: "Editorial Reddit-sourced score out of five.",
    unit: "score",
    requires: ["sentiment"],
    accessor: (row) => finite(opinionForCompany(row.company.slug).score),
  },
  {
    id: "evidenceAge",
    label: "Evidence age",
    description: "How long ago the figure behind this company was checked.",
    unit: "days",
    requires: [],
    accessor: (row) => finite(pointResearchQuality(row.company, row.point).ageDays),
  },
  {
    id: "evidenceScore",
    label: "Evidence strength",
    description: "Confidence, source count and freshness combined into one score.",
    unit: "count",
    requires: [],
    // Zero is the bottom of the scale, not a missing reading: a company with
    // no pay figure genuinely has no evidence behind it, and saying so is the
    // point of plotting this at all.
    zeroIsRealValue: true,
    accessor: (row) => finite(pointResearchQuality(row.company, row.point).score),
  },
];

export function metricById(id: string): ChartMetric | null {
  return CHART_METRICS.find((metric) => metric.id === id) ?? null;
}

/** Categorical splits — what a mark can be grouped or coloured by. */
export type ChartDimensionId = "companyType" | "evidenceKind" | "confidence" | "locationScope";

export interface ChartDimension {
  id: ChartDimensionId;
  label: string;
  valueOf: (row: MetricRow) => string;
}

export const CHART_DIMENSIONS: ChartDimension[] = [
  {
    id: "companyType",
    label: "Company type",
    valueOf: (row) => row.company.companyType,
  },
  {
    id: "evidenceKind",
    label: "Evidence source",
    valueOf: (row) =>
      row.point === null
        ? "No evidence"
        : isPostedSalaryPoint(row.point)
          ? "Employer posting"
          : "Sourced page",
  },
  {
    id: "confidence",
    label: "Confidence",
    valueOf: (row) => row.point?.confidence ?? "Unknown",
  },
  {
    id: "locationScope",
    label: "Location scope",
    valueOf: (row) => row.point?.locationLabel ?? "—",
  },
];

export function dimensionById(id: string): ChartDimension | null {
  return CHART_DIMENSIONS.find((dimension) => dimension.id === id) ?? null;
}
