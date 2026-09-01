/**
 * Readiness rules for a city's cost-of-living reference bundle.
 *
 * A city may only influence a decision when rent, non-housing household costs,
 * transport, a consistent effective date, and source refresh health all pass at
 * once. Evaluating that here, rather than inline in a database query, keeps the
 * rule adversarially testable and lets a locked city say which requirement is
 * missing instead of silently disappearing.
 */

export type CityCostRequirement =
  | "household_categories"
  | "transport"
  | "rent_monthly"
  | "rent_per_square_meter"
  | "rent_sample_size"
  | "rent_effective_date"
  | "source_health";

export type CityCostReadinessStatus = "current" | "incomplete" | "stale";

export interface CityCostSourceHealthInput {
  key: string;
  health: string;
  lastSuccessfulAt: number | null;
  maxStalenessMs: number;
}

export interface CityCostReadinessInput {
  now: number;
  requiredCategories: readonly string[];
  presentCategories: readonly string[];
  rent: {
    monthlyAmountEur: number | null;
    perSquareMeterEur: number | null;
    sampleSize: number | null;
    monthlyReferenceYear: number | null;
    perSquareMeterReferenceYear: number | null;
    sharesSource: boolean;
  };
  sources: readonly CityCostSourceHealthInput[];
}

export interface CityCostReadiness {
  status: CityCostReadinessStatus;
  unmet: CityCostRequirement[];
  staleSourceKeys: string[];
  explanation: string;
}

export const CITY_COST_REQUIREMENT_LABELS: Record<CityCostRequirement, string> = {
  household_categories: "non-housing household costs",
  transport: "transport fare",
  rent_monthly: "monthly rent",
  rent_per_square_meter: "rent per square metre",
  rent_sample_size: "published rent sample size",
  rent_effective_date: "a consistent rent effective date",
  source_health: "current official source refreshes",
};

function isPositive(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function evaluateCityCostReadiness(input: CityCostReadinessInput): CityCostReadiness {
  const unmet: CityCostRequirement[] = [];
  const present = new Set(input.presentCategories);

  const missingHousehold = input.requiredCategories.filter(
    (category) => category !== "transport" && !present.has(category),
  );
  if (missingHousehold.length > 0) unmet.push("household_categories");
  if (input.requiredCategories.includes("transport") && !present.has("transport")) {
    unmet.push("transport");
  }

  const { rent } = input;
  if (!isPositive(rent.monthlyAmountEur)) unmet.push("rent_monthly");
  if (!isPositive(rent.perSquareMeterEur)) unmet.push("rent_per_square_meter");
  if (!isPositive(rent.sampleSize)) unmet.push("rent_sample_size");
  if (
    rent.monthlyReferenceYear === null ||
    rent.perSquareMeterReferenceYear === null ||
    rent.monthlyReferenceYear !== rent.perSquareMeterReferenceYear ||
    !rent.sharesSource
  ) {
    unmet.push("rent_effective_date");
  }

  /*
   * A source that has never succeeded is as unusable as one that has gone
   * stale, so both fail the same requirement rather than being treated as
   * "not yet checked".
   */
  const staleSourceKeys = input.sources
    .filter(
      (source) =>
        source.health !== "healthy" ||
        source.lastSuccessfulAt === null ||
        input.now - source.lastSuccessfulAt > source.maxStalenessMs,
    )
    .map((source) => source.key);
  if (input.sources.length === 0 || staleSourceKeys.length > 0) unmet.push("source_health");

  if (unmet.length === 0) {
    return {
      status: "current",
      unmet: [],
      staleSourceKeys: [],
      explanation: "Rent, household costs, transport, effective date, and source health all pass.",
    };
  }

  const structurallyIncomplete = unmet.some((requirement) => requirement !== "source_health");
  const missingLabels = unmet.map((requirement) => CITY_COST_REQUIREMENT_LABELS[requirement]);
  return {
    status: structurallyIncomplete ? "incomplete" : "stale",
    unmet,
    staleSourceKeys,
    explanation: structurallyIncomplete
      ? `No after-cost estimate is shown because this city is missing ${missingLabels.join(", ")}.`
      : `No after-cost estimate is shown because an official source is stale or failing: ${staleSourceKeys.join(", ")}.`,
  };
}

/**
 * Cities that are deliberately not offered yet, with the exact official evidence
 * each one still needs. Recording this keeps an absent city an explicit decision
 * rather than an oversight.
 */
export interface PendingCityCostBundle {
  cityKey: string;
  cityLabel: string;
  missingEvidence: string[];
  note: string;
}

export const PENDING_CITY_COST_BUNDLES: PendingCityCostBundle[] = [
  {
    cityKey: "barcelona-city",
    cityLabel: "Barcelona",
    missingEvidence: [
      "An INE household-budget series scoped to Catalunya, matching the Madrid and Comunitat Valenciana series already in use.",
      "An official Barcelona transport fare page with a 2026 effective date and a stable conformance check, equivalent to the CRTM and EMT validators.",
      "An AEAT declared-rent row for the Barcelona municipality code, paired with its per-square-metre figure from the same source and reference year.",
    ],
    note:
      "Barcelona stays unavailable until the same complete official bundle exists. Substituting a national or provincial figure would change the comparison without changing the evidence.",
  },
];

export function pendingCityCostBundle(cityKey: string): PendingCityCostBundle | null {
  return PENDING_CITY_COST_BUNDLES.find((bundle) => bundle.cityKey === cityKey) ?? null;
}
