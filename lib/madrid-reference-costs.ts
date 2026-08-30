import {
  estimateCashAfterCityReferenceCosts,
  type CityReferenceCostResult,
} from "./city-reference-costs";

export type MadridReferenceCostResult = CityReferenceCostResult;

/**
 * Combines the source-backed Madrid solo-renter reference with a payroll
 * estimate. It is deliberately not a personal budget: the caller supplies
 * the official full-dwelling rent and regional per-person essentials basket.
 */
export function estimateMadridCashAfterReferenceCosts(
  monthlyNetCashEur: number,
  monthlyRentEur: number,
  monthlyEssentialsEur: number,
): MadridReferenceCostResult {
  return estimateCashAfterCityReferenceCosts(
    monthlyNetCashEur,
    monthlyRentEur,
    monthlyEssentialsEur,
  );
}
