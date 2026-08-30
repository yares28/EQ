export interface CityReferenceCostResult {
  monthlyNetCashEur: number;
  monthlyRentEur: number;
  monthlyEssentialsEur: number;
  monthlyReferenceCostEur: number;
  monthlyCashAfterReferenceCostsEur: number;
  referenceCostSharePercent: number;
}

function validCurrencyAmount(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Combines source-backed full-dwelling rent and a regional per-person
 * essentials basket with a payroll estimate. This is a comparison reference,
 * not a personal budget.
 */
export function estimateCashAfterCityReferenceCosts(
  monthlyNetCashEur: number,
  monthlyRentEur: number,
  monthlyEssentialsEur: number,
): CityReferenceCostResult {
  if (
    !validCurrencyAmount(monthlyNetCashEur) ||
    !validCurrencyAmount(monthlyRentEur) ||
    !validCurrencyAmount(monthlyEssentialsEur) ||
    monthlyNetCashEur === 0
  ) {
    throw new RangeError(
      "City reference inputs must be finite non-negative amounts with positive net cash.",
    );
  }
  const monthlyReferenceCostEur = roundCurrency(monthlyRentEur + monthlyEssentialsEur);
  return {
    monthlyNetCashEur,
    monthlyRentEur,
    monthlyEssentialsEur,
    monthlyReferenceCostEur,
    monthlyCashAfterReferenceCostsEur: roundCurrency(
      Math.max(0, monthlyNetCashEur - monthlyReferenceCostEur),
    ),
    referenceCostSharePercent:
      Math.round((monthlyReferenceCostEur / monthlyNetCashEur) * 10_000) / 100,
  };
}

export interface PersonalCityCost {
  location: string;
  rentEur: number;
  groceriesEur: number;
  transportEur: number;
  utilitiesEur: number;
  otherEur: number;
  updatedAt?: number;
}

/** Total monthly outgoings the user entered for one location. */
export function personalMonthlyCostEur(cost: PersonalCityCost): number {
  return roundCurrency(
    cost.rentEur + cost.groceriesEur + cost.transportEur + cost.utilitiesEur + cost.otherEur,
  );
}

export function personalCostForLocation(
  costs: PersonalCityCost[] | undefined,
  location: string,
): PersonalCityCost | null {
  return costs?.find((cost) => cost.location === location) ?? null;
}

/**
 * Cash left after the user's own stated costs. Unlike the reference estimate
 * this is a real budget, so it is never blended with official city data and is
 * only ever applied to the location it was entered for.
 */
export function estimateCashAfterPersonalCosts(
  monthlyNetCashEur: number,
  cost: PersonalCityCost,
): number | null {
  const total = personalMonthlyCostEur(cost);
  if (!Number.isFinite(monthlyNetCashEur) || monthlyNetCashEur <= 0) return null;
  if (!Number.isFinite(total) || total < 0) return null;
  return roundCurrency(Math.max(0, monthlyNetCashEur - total));
}
