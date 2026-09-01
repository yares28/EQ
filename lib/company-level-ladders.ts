import type { SalaryLevel } from "./salary-data.ts";

/**
 * Audited cross-company engineering ladders.
 *
 * Comparing companies requires knowing that Amazon's SDE II and Google's L4 sit
 * at the same normalized band, and that a promotion from one company level
 * lands on a specific, named successor. Neither fact is safe to infer from
 * titles: "senior" appears in ladders that are two steps apart, and a salary
 * source's next reported row is not necessarily the next promotion step.
 *
 * Each step therefore records the evidence behind its mapping. A step is only
 * `sourced` when the publisher names both the level and its successor. When the
 * evidence shows the next reported row is not the real successor, the step is
 * `ambiguous`: its numbers stay visible, but it must not label a promotion
 * target or win a progression comparison.
 */

export type LadderStepStatus = "sourced" | "ambiguous";
export type LadderConfidence = "high" | "medium";

export interface CompanyLadderStep {
  /** The employer's own name for this level, matching `SalaryPoint.companyLevel`. */
  companyLevel: string;
  normalizedLevel: SalaryLevel;
  /** The named IC level a promotion from this step reaches, when evidence exists. */
  nextCompanyLevel: string | null;
  nextNormalizedLevel: SalaryLevel | null;
  status: LadderStepStatus;
  confidence: LadderConfidence;
  /** `SalarySource.id` in `salary-data.ts` that this mapping was read from. */
  sourceId: string;
  effectiveDate: string;
  basis: string;
}

export interface CompanyLadder {
  companySlug: string;
  companyName: string;
  ladderName: string;
  auditedOn: string;
  steps: CompanyLadderStep[];
}

export interface LadderResolution {
  status: LadderStepStatus | "unmapped";
  normalizedLevel: SalaryLevel;
  companyLevel: string | null;
  nextCompanyLevel: string | null;
  nextNormalizedLevel: SalaryLevel | null;
  confidence: LadderConfidence | null;
  sourceId: string | null;
  effectiveDate: string | null;
  basis: string;
}

const LADDER_AUDIT_DATE = "2026-08-29";

export const COMPANY_LEVEL_LADDERS: CompanyLadder[] = [
  {
    companySlug: "amazon",
    companyName: "Amazon",
    ladderName: "Amazon L-scale / SDE titles",
    auditedOn: LADDER_AUDIT_DATE,
    steps: [
      {
        companyLevel: "Internship",
        normalizedLevel: "intern",
        nextCompanyLevel: "L4 / SDE I",
        nextNormalizedLevel: "junior",
        status: "sourced",
        confidence: "medium",
        sourceId: "glassdoor-amazon-intern-madrid",
        effectiveDate: "2026-08-27",
        basis:
          "The internship row and the SDE I row are published as distinct, consecutively titled entry steps.",
      },
      {
        companyLevel: "L4 / SDE I",
        normalizedLevel: "junior",
        nextCompanyLevel: "L5 / SDE II",
        nextNormalizedLevel: "mid",
        status: "sourced",
        confidence: "high",
        sourceId: "levels-amazon-sde-i-madrid",
        effectiveDate: "2026-08-27",
        basis: "The publisher names both SDE I and its successor SDE II as consecutive IC levels.",
      },
      {
        companyLevel: "L5 / SDE II",
        normalizedLevel: "mid",
        nextCompanyLevel: "L6 / SDE III",
        nextNormalizedLevel: "senior",
        status: "sourced",
        confidence: "high",
        sourceId: "levels-amazon-sde-ii-madrid",
        effectiveDate: "2026-08-27",
        basis:
          "SDE III is the next named Amazon IC level after SDE II and is explicitly labeled Senior SDE.",
      },
      {
        companyLevel: "L6 / SDE III",
        normalizedLevel: "senior",
        nextCompanyLevel: null,
        nextNormalizedLevel: null,
        status: "sourced",
        confidence: "high",
        sourceId: "levels-amazon-sde-iii-madrid",
        effectiveDate: "2026-08-27",
        basis: "No Spain-scoped Amazon level above SDE III has attributable evidence.",
      },
    ],
  },
  {
    companySlug: "google",
    companyName: "Google",
    ladderName: "Google L-scale",
    auditedOn: LADDER_AUDIT_DATE,
    steps: [
      {
        companyLevel: "L3",
        normalizedLevel: "junior",
        nextCompanyLevel: "L4",
        nextNormalizedLevel: "mid",
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-google-madrid",
        effectiveDate: "2026-08-27",
        basis: "L3 and L4 are published as consecutive numbered Google IC software levels.",
      },
      {
        companyLevel: "L4",
        normalizedLevel: "mid",
        nextCompanyLevel: "L5",
        nextNormalizedLevel: "senior",
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-google-spain",
        effectiveDate: "2026-08-27",
        basis: "L5 is the next numbered Google IC level after L4 and is explicitly labeled Senior SWE.",
      },
      {
        companyLevel: "L5",
        normalizedLevel: "senior",
        nextCompanyLevel: null,
        nextNormalizedLevel: null,
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-google-spain",
        effectiveDate: "2026-08-27",
        basis: "No Spain-scoped Google level above L5 has attributable evidence.",
      },
    ],
  },
  {
    companySlug: "apple",
    companyName: "Apple",
    ladderName: "Apple ICT scale",
    auditedOn: LADDER_AUDIT_DATE,
    steps: [
      {
        companyLevel: "ICT2",
        normalizedLevel: "junior",
        nextCompanyLevel: "ICT3",
        nextNormalizedLevel: "mid",
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-apple-spain",
        effectiveDate: "2026-08-27",
        basis:
          "ICT2 is the published entry Apple software level and ICT3 is the next numbered ICT step.",
      },
      {
        companyLevel: "ICT3",
        normalizedLevel: "mid",
        nextCompanyLevel: "ICT4",
        nextNormalizedLevel: "senior",
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-apple-spain",
        effectiveDate: "2026-08-27",
        basis:
          "ICT4 is the next numbered Apple ICT level after ICT3 and is explicitly labeled Senior Software Engineer.",
      },
      {
        companyLevel: "ICT4",
        normalizedLevel: "senior",
        nextCompanyLevel: null,
        nextNormalizedLevel: null,
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-apple-spain",
        effectiveDate: "2026-08-27",
        basis: "No Spain-scoped Apple level above ICT4 has attributable evidence.",
      },
    ],
  },
  {
    companySlug: "microsoft",
    companyName: "Microsoft",
    ladderName: "Microsoft numbered SDE levels",
    auditedOn: LADDER_AUDIT_DATE,
    steps: [
      {
        companyLevel: "59",
        normalizedLevel: "junior",
        nextCompanyLevel: "61",
        nextNormalizedLevel: "mid",
        status: "sourced",
        confidence: "medium",
        sourceId: "levels-microsoft-spain",
        effectiveDate: "2026-08-27",
        basis:
          "Level 59 is the published entry Microsoft SDE row and 61 is the first SDE II row in the same Spain source.",
      },
      {
        companyLevel: "61",
        normalizedLevel: "mid",
        nextCompanyLevel: null,
        nextNormalizedLevel: null,
        status: "ambiguous",
        confidence: "medium",
        sourceId: "levels-microsoft-spain",
        effectiveDate: "2026-08-27",
        basis:
          "Level 62 is only the next reported salary row, not the next promotion step: the same source places Senior SDE at level 63, which has no Spain evidence. Treating 62 as the senior successor would overstate a Microsoft promotion against companies whose senior level is named.",
      },
      {
        companyLevel: "62",
        normalizedLevel: "senior",
        nextCompanyLevel: null,
        nextNormalizedLevel: null,
        status: "ambiguous",
        confidence: "medium",
        sourceId: "levels-microsoft-spain",
        effectiveDate: "2026-08-27",
        basis:
          "Level 62 is retained as a reported pay row but is not an attributable senior-equivalent level, because the source places Senior SDE at 63.",
      },
    ],
  },
];

export function companyLadder(companySlug: string): CompanyLadder | null {
  return COMPANY_LEVEL_LADDERS.find((ladder) => ladder.companySlug === companySlug) ?? null;
}

function unmapped(normalizedLevel: SalaryLevel, basis: string): LadderResolution {
  return {
    status: "unmapped",
    normalizedLevel,
    companyLevel: null,
    nextCompanyLevel: null,
    nextNormalizedLevel: null,
    confidence: null,
    sourceId: null,
    effectiveDate: null,
    basis,
  };
}

/**
 * Resolves what a promotion from `normalizedLevel` reaches at this company.
 * An unaudited company or a level with no attributable successor resolves to
 * `unmapped` rather than falling back to the shared band order.
 */
export function resolveLadderStep(
  companySlug: string,
  normalizedLevel: SalaryLevel,
): LadderResolution {
  const ladder = companyLadder(companySlug);
  if (ladder === null) {
    return unmapped(
      normalizedLevel,
      "This company's ladder has not been audited against attributable evidence.",
    );
  }
  const step = ladder.steps.find((candidate) => candidate.normalizedLevel === normalizedLevel);
  if (step === undefined) {
    return unmapped(
      normalizedLevel,
      `${ladder.companyName} has no audited level at this band.`,
    );
  }
  return {
    status: step.status,
    normalizedLevel,
    companyLevel: step.companyLevel,
    nextCompanyLevel: step.nextCompanyLevel,
    nextNormalizedLevel: step.nextNormalizedLevel,
    confidence: step.confidence,
    sourceId: step.sourceId,
    effectiveDate: step.effectiveDate,
    basis: step.basis,
  };
}

/**
 * A progression may drive a winner comparison only when the company's own
 * evidence names the successor level.
 */
export function isProgressionDecisionGrade(resolution: LadderResolution): boolean {
  return (
    resolution.status === "sourced" &&
    resolution.nextCompanyLevel !== null &&
    resolution.nextNormalizedLevel !== null
  );
}

export const LADDER_AMBIGUOUS_JUMP_LABEL = "Next level not attributable";
export const LADDER_UNMAPPED_JUMP_LABEL = "No comparable next level";

export function ladderJumpLockReason(resolution: LadderResolution): string {
  return resolution.status === "ambiguous"
    ? LADDER_AMBIGUOUS_JUMP_LABEL
    : LADDER_UNMAPPED_JUMP_LABEL;
}
