import {
  isProgressionDecisionGrade,
  LADDER_UNMAPPED_JUMP_LABEL,
  ladderJumpLockReason,
  resolveLadderStep,
  type LadderResolution,
} from "./company-level-ladders.ts";
import { decisionLocationMatches } from "./company-research-catalog.ts";
import type { DecisionLocation, PayBasis } from "./salary-decision-context.ts";
import {
  confidenceOrder,
  type SalaryCompany,
  type SalaryLevel,
  type SalaryPoint,
} from "./salary-data.ts";

export type TargetLevel = Extract<SalaryLevel, "intern" | "junior" | "mid">;

const TARGET_LEVELS: readonly TargetLevel[] = ["intern", "junior", "mid"];

/**
 * Whether a level is one the ranking can target. Callers must use this rather
 * than excluding known-bad levels by name, so adding a level to `SalaryLevel`
 * cannot silently widen what gets treated as a target.
 */
export function isTargetLevel(level: SalaryLevel): level is TargetLevel {
  return TARGET_LEVELS.includes(level as TargetLevel);
}

export interface SalaryProgression {
  from: SalaryPoint;
  to: SalaryPoint;
  deltaEur: number;
  percent: number;
  /** The audited ladder evidence behind this promotion target. */
  mapping: LadderResolution;
  /** True only when the company's own evidence names the successor level. */
  decisionGrade: boolean;
}

export const targetLevelLabels: Record<SalaryLevel, string> = {
  intern: "Intern",
  junior: "SDE1",
  mid: "SDE2",
  senior: "Senior",
  staff: "Staff",
  principal: "Principal",
};

export function formatEuro(value: number | null, compact = false): string {
  if (value === null) return "—";
  if (!compact) return `€${Math.round(value).toLocaleString("en-US")}`;
  if (Math.abs(value) < 1_000) {
    return `€${Math.round(value).toLocaleString("en-US")}`;
  }

  const divisor = value >= 1_000_000 ? 1_000_000 : 1_000;
  const suffix = divisor === 1_000_000 ? "m" : "k";
  const scaled = value / divisor;
  const decimals = value >= 100_000 || Number.isInteger(scaled) ? 0 : 1;
  return `€${scaled.toFixed(decimals).replace(/\.0$/, "")}${suffix}`;
}

export function formatLocation(company: SalaryCompany): string {
  const locations = company.locationAvailability.filter(
    (location) => location !== "Unknown"
  );
  return locations.length > 0 ? locations.join(" · ") : "—";
}

export function isPostedSalaryPoint(point: SalaryPoint | null): boolean {
  return Boolean(point?.sourceIds.some((id) => id.startsWith("posted:")));
}

/** The figure a point contributes on a given basis, or null when it has none. */
export function payAmountFor(
  point: SalaryPoint | null,
  basis: PayBasis,
): number | null {
  if (point === null) return null;
  return basis === "base" ? point.baseEur ?? null : point.totalCompEur;
}

export function pointForLevel(
  company: SalaryCompany,
  level: SalaryLevel,
  location: DecisionLocation = "Madrid",
  basis: PayBasis = "total",
): SalaryPoint | null {
  return (
    company.salaryPoints
      .filter(
        (point) =>
          point.level === level &&
          payAmountFor(point, basis) !== null &&
          decisionLocationMatches(point.location, location),
      )
      .slice()
      .sort((a, b) => {
        const confidence = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
        return confidence || (payAmountFor(b, basis) ?? 0) - (payAmountFor(a, basis) ?? 0);
      })[0] ?? null
  );
}

export function entryPoint(company: SalaryCompany): SalaryPoint | null {
  return pointForLevel(company, "intern") ?? pointForLevel(company, "junior");
}

/**
 * The promotion target comes from the company's audited ladder rather than the
 * shared band order, so a company whose next reported pay row is not its next
 * promotion step cannot present that row as a promotion.
 */
export function nextTargetLevel(
  level: TargetLevel,
  companySlug?: string
): SalaryLevel | null {
  if (companySlug === undefined) {
    if (level === "intern") return "junior";
    if (level === "junior") return "mid";
    return "senior";
  }
  return resolveLadderStep(companySlug, level).nextNormalizedLevel;
}

export function progressionFor(
  company: SalaryCompany,
  level: TargetLevel,
  location: DecisionLocation = "Madrid"
): SalaryProgression | null {
  const mapping = resolveLadderStep(company.slug, level);
  const next = mapping.nextNormalizedLevel;
  if (next === null) return null;

  const from = pointForLevel(company, level, location);
  const to = pointForLevel(company, next, location);
  if (
    !from ||
    !to ||
    from.totalCompEur === null ||
    to.totalCompEur === null ||
    from.location !== to.location
  ) {
    return null;
  }

  const deltaEur = to.totalCompEur - from.totalCompEur;
  return {
    from,
    to,
    deltaEur,
    percent: Math.round((deltaEur / from.totalCompEur) * 100),
    mapping,
    decisionGrade: isProgressionDecisionGrade(mapping),
  };
}

/**
 * The percentage a promotion is allowed to contribute to a comparison. A
 * progression whose successor is not attributable stays visible in the table
 * but reports no comparable value.
 */
export function decisionGradeProgressionPercent(
  progression: SalaryProgression | null | undefined
): number | null {
  return progression && progression.decisionGrade ? progression.percent : null;
}

/**
 * Explains why a company shows no promotion figure, distinguishing an unaudited
 * ladder from one whose successor exists but is not attributable.
 */
export function progressionLockReason(
  company: SalaryCompany,
  level: TargetLevel
): string {
  return ladderJumpLockReason(resolveLadderStep(company.slug, level));
}

/**
 * Promotion between two employer-posted salaries on public career pages.
 * Uses the shared Intern → SDE1 → SDE2 → Senior order because the posting
 * itself is the evidence; crowdsourced ladders are not consulted.
 */
export function postedProgressionFor(
  company: SalaryCompany,
  level: TargetLevel,
  location: DecisionLocation = "Madrid",
): SalaryProgression | null {
  const next = nextTargetLevel(level);
  if (next === null) return null;

  // Employer postings state base pay, so a posted promotion is a base-to-base
  // comparison. Reading it from `totalCompEur` would find nothing.
  const from = pointForLevel(company, level, location, "base");
  const to = pointForLevel(company, next, location, "base");
  if (
    !from ||
    !to ||
    !isPostedSalaryPoint(from) ||
    !isPostedSalaryPoint(to) ||
    from.baseEur === null ||
    from.baseEur === undefined ||
    to.baseEur === null ||
    to.baseEur === undefined ||
    from.location !== to.location
  ) {
    return null;
  }

  const deltaEur = to.baseEur - from.baseEur;
  const mapping: LadderResolution = {
    status: "sourced",
    normalizedLevel: level,
    companyLevel: from.companyLevel,
    nextCompanyLevel: to.companyLevel,
    nextNormalizedLevel: next,
    confidence: "medium",
    sourceId: from.sourceIds[0] ?? null,
    effectiveDate: company.lastResearchedAt === "—" ? null : company.lastResearchedAt,
    basis:
      "Both levels have an employer-posted Spain salary on a public career page in the same location scope.",
  };

  return {
    from,
    to,
    deltaEur,
    percent: Math.round((deltaEur / from.baseEur) * 100),
    mapping,
    decisionGrade: true,
  };
}

export function postedProgressionLockReason(
  company: SalaryCompany,
  level: TargetLevel,
  location: DecisionLocation = "Madrid",
): string {
  if (postedProgressionFor(company, level, location) !== null) {
    return LADDER_UNMAPPED_JUMP_LABEL;
  }
  const from = pointForLevel(company, level, location, "base");
  if (from === null || !isPostedSalaryPoint(from)) {
    return "No employer-posted salary at this level on a public career page";
  }
  const next = nextTargetLevel(level);
  if (next === null) {
    return LADDER_UNMAPPED_JUMP_LABEL;
  }
  const to = pointForLevel(company, next, location, "base");
  if (to === null || !isPostedSalaryPoint(to)) {
    return "No employer-posted salary at the next level on a public career page";
  }
  if (from.location !== to.location) {
    return "Next-level posting uses a different location scope";
  }
  return LADDER_UNMAPPED_JUMP_LABEL;
}

export function decisionProgressionFor(
  company: SalaryCompany,
  level: TargetLevel,
  location: DecisionLocation = "Madrid",
): SalaryProgression | null {
  const from = pointForLevel(company, level, location, "base");
  const next = nextTargetLevel(level);
  const to = next === null ? null : pointForLevel(company, next, location, "base");
  if (isPostedSalaryPoint(from) || isPostedSalaryPoint(to)) {
    return postedProgressionFor(company, level, location);
  }
  return progressionFor(company, level, location);
}

export function decisionProgressionLockReason(
  company: SalaryCompany,
  level: TargetLevel,
  location: DecisionLocation = "Madrid",
): string {
  const from = pointForLevel(company, level, location, "base");
  const next = nextTargetLevel(level);
  const to = next === null ? null : pointForLevel(company, next, location, "base");
  if (isPostedSalaryPoint(from) || isPostedSalaryPoint(to)) {
    return postedProgressionLockReason(company, level, location);
  }
  return progressionLockReason(company, level);
}

export function equityShare(point: SalaryPoint | null): number | null {
  if (!point || point.totalCompEur === null || point.equityEur === null) return null;
  return Math.round((point.equityEur / point.totalCompEur) * 100);
}
