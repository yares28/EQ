import { salaryLocationForLabel } from "./salary-data.ts";
import type {
  Confidence,
  SalaryCompany,
  SalaryPoint,
} from "./salary-data";

export interface EmployerPostedRange {
  companySlug: string;
  level: "intern" | "junior" | "mid" | "senior" | "staff" | "principal";
  locationLabel: string;
  period: "hour" | "month" | "year";
  rangeKind: "range" | "fixed" | "minimum" | "maximum";
  minimumAmount: number;
  maximumAmount: number;
  checkedAt: number;
}

export type EvidenceSampleQuality = "strong" | "directional" | "limited" | "unavailable";

export interface SalaryNegotiationAnalysis {
  marketPercentile: number | null;
  percentileLockedReason: string | null;
  comparableCompanyCount: number;
  comparisonScope: string;
  linkedSourceCount: number;
  publisherSampleSize: number | null;
  sampleQuality: EvidenceSampleQuality;
  sampleQualityLabel: string;
  negotiationStatus: "ready" | "locked";
  suggestedBaseMinimumEur: number | null;
  suggestedBaseMaximumEur: number | null;
  negotiationLockedReason: string | null;
  negotiationBasis: string;
}

function confidenceEligible(confidence: Confidence): boolean {
  return confidence === "High" || confidence === "Medium";
}

function exactScopePoints(
  companies: SalaryCompany[],
  point: SalaryPoint,
): Array<{ companySlug: string; amount: number }> {
  return companies.flatMap((company) => {
    const candidates = company.salaryPoints
      .filter(
        (candidate) =>
          candidate.level === point.level &&
          candidate.location === point.location &&
          candidate.totalCompEur !== null &&
          confidenceEligible(candidate.confidence),
      )
      .sort((left, right) => (right.totalCompEur ?? 0) - (left.totalCompEur ?? 0));
    const selected = candidates[0];
    return selected?.totalCompEur === null || selected === undefined
      ? []
      : [{ companySlug: company.slug, amount: selected.totalCompEur }];
  });
}

function empiricalPercentile(amount: number, peers: number[]): number {
  const lower = peers.filter((value) => value < amount).length;
  const equal = peers.filter((value) => value === amount).length;
  const percentile = ((lower + equal / 2) / peers.length) * 100;
  return Math.max(5, Math.min(95, Math.round(percentile / 5) * 5));
}

function sampleQualityFor(
  point: SalaryPoint | null,
  comparableCompanyCount: number,
): { quality: EvidenceSampleQuality; label: string } {
  if (point === null) return { quality: "unavailable", label: "No salary evidence" };
  if ((point.sampleSize ?? 0) >= 10 && point.sourceIds.length >= 1) {
    return { quality: "strong", label: `${point.sampleSize} disclosed observations` };
  }
  if (
    comparableCompanyCount >= 3 &&
    point.sourceIds.length >= 1 &&
    confidenceEligible(point.confidence)
  ) {
    return { quality: "directional", label: "Directional · publisher sample not disclosed" };
  }
  if (point.sourceIds.length >= 1) {
    return { quality: "limited", label: "Limited · publisher sample not disclosed" };
  }
  return { quality: "unavailable", label: "No linked salary source" };
}

function roundedHundred(value: number): number {
  return Math.round(value / 100) * 100;
}

function postedRangeMatchesPoint(
  company: SalaryCompany,
  point: SalaryPoint,
  postedRange: EmployerPostedRange,
): boolean {
  // This used to enumerate Madrid, Valencia, Spain-wide and Remote by hand, and
  // treat everything else as "Other Spain". Five of the eight Spanish cities
  // fell through every branch: a Barcelona posting was not a Barcelona match
  // and not an Other-Spain match either, so the negotiation range for those
  // cities was permanently locked with "does not match this exact scope".
  const locationMatches =
    point.location === salaryLocationForLabel(postedRange.locationLabel);
  return company.slug === postedRange.companySlug &&
    point.level === postedRange.level &&
    locationMatches;
}

export function analyzeSalaryNegotiation({
  company,
  point,
  companies,
  postedRange,
}: {
  company: SalaryCompany;
  point: SalaryPoint | null;
  companies: SalaryCompany[];
  postedRange: EmployerPostedRange | null;
}): SalaryNegotiationAnalysis {
  const exactPeers = point ? exactScopePoints(companies, point) : [];
  const comparableCompanyCount = exactPeers.length;
  const comparisonScope = point?.locationLabel ?? "No exact salary scope";
  const linkedSourceCount = point?.sourceIds.length ?? 0;
  const publisherSampleSize = point?.sampleSize ?? null;
  const sample = sampleQualityFor(point, comparableCompanyCount);

  let marketPercentile: number | null = null;
  let percentileLockedReason: string | null = null;
  if (point?.totalCompEur === null || point === null) {
    percentileLockedReason = "No sourced total-compensation point for this company, level, and location.";
  } else if (!confidenceEligible(point.confidence)) {
    percentileLockedReason = "The company salary point is not strong enough for a market-position estimate.";
  } else if (comparableCompanyCount < 3) {
    percentileLockedReason = `Needs at least 3 exact-scope companies; ${comparableCompanyCount} ${comparableCompanyCount === 1 ? "is" : "are"} available.`;
  } else {
    marketPercentile = empiricalPercentile(
      point.totalCompEur,
      exactPeers.map((peer) => peer.amount),
    );
  }

  const lockedBase: Omit<SalaryNegotiationAnalysis, "negotiationStatus" | "suggestedBaseMinimumEur" | "suggestedBaseMaximumEur" | "negotiationLockedReason" | "negotiationBasis"> = {
    marketPercentile,
    percentileLockedReason,
    comparableCompanyCount,
    comparisonScope,
    linkedSourceCount,
    publisherSampleSize,
    sampleQuality: sample.quality,
    sampleQualityLabel: sample.label,
  };

  if (point === null) {
    return {
      ...lockedBase,
      negotiationStatus: "locked",
      suggestedBaseMinimumEur: null,
      suggestedBaseMaximumEur: null,
      negotiationLockedReason: "No sourced company salary point exists for this level and location.",
      negotiationBasis: "No range is generated from missing evidence.",
    };
  }
  if (postedRange === null) {
    return {
      ...lockedBase,
      negotiationStatus: "locked",
      suggestedBaseMinimumEur: null,
      suggestedBaseMaximumEur: null,
      negotiationLockedReason: "No current employer-posted annual base range matches this company, level, and location.",
      negotiationBasis: "A public salary average alone is not converted into an invented offer range.",
    };
  }
  if (!postedRangeMatchesPoint(company, point, postedRange)) {
    return {
      ...lockedBase,
      negotiationStatus: "locked",
      suggestedBaseMinimumEur: null,
      suggestedBaseMaximumEur: null,
      negotiationLockedReason: "The employer-posted range does not match this exact company, level, and location scope.",
      negotiationBasis: "Ranges are never carried across companies, levels, cities, or remote scopes.",
    };
  }
  if (postedRange.period !== "year" || postedRange.rangeKind !== "range") {
    return {
      ...lockedBase,
      negotiationStatus: "locked",
      suggestedBaseMinimumEur: null,
      suggestedBaseMaximumEur: null,
      negotiationLockedReason: "The employer posting does not state a complete annual base-pay range.",
      negotiationBasis: "Hourly, monthly, fixed, minimum-only, and maximum-only disclosures stay unconverted.",
    };
  }
  if (
    !Number.isFinite(postedRange.minimumAmount) ||
    !Number.isFinite(postedRange.maximumAmount) ||
    postedRange.minimumAmount <= 0 ||
    postedRange.maximumAmount <= postedRange.minimumAmount
  ) {
    return {
      ...lockedBase,
      negotiationStatus: "locked",
      suggestedBaseMinimumEur: null,
      suggestedBaseMaximumEur: null,
      negotiationLockedReason: "The employer-posted range failed validation.",
      negotiationBasis: "Invalid or reversed ranges are never repaired by guessing.",
    };
  }

  const midpoint = (postedRange.minimumAmount + postedRange.maximumAmount) / 2;
  const reportedBase = point.baseEur;
  if (
    reportedBase !== null &&
    (reportedBase < postedRange.minimumAmount * 0.9 || reportedBase > postedRange.maximumAmount * 1.1)
  ) {
    return {
      ...lockedBase,
      negotiationStatus: "locked",
      suggestedBaseMinimumEur: null,
      suggestedBaseMaximumEur: null,
      negotiationLockedReason: "The employer range conflicts materially with the stored company base-pay evidence.",
      negotiationBasis: "Conflicting sources require review before suggesting an ask.",
    };
  }

  const suggestedMinimum = Math.min(
    postedRange.maximumAmount,
    Math.max(midpoint, reportedBase ?? midpoint),
  );
  return {
    ...lockedBase,
    negotiationStatus: "ready",
    suggestedBaseMinimumEur: roundedHundred(suggestedMinimum),
    suggestedBaseMaximumEur: roundedHundred(postedRange.maximumAmount),
    negotiationLockedReason: null,
    negotiationBasis:
      "Upper half of the current employer-posted annual base range, anchored upward only when the matching company base-pay evidence supports it.",
  };
}
