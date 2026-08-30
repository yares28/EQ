import { careerSourceAuditForSlug } from "./career-source-audits.ts";
import { companyLadder, resolveLadderStep } from "./company-level-ladders.ts";
import type { CompanyResearchStatus } from "./company-research-catalog.ts";
import type { DecisionLocation } from "./salary-decision-context.ts";
import type { SalaryLevel, SalaryLocation } from "./salary-data.ts";

/**
 * One per-company answer to "what can this company actually be used for?".
 *
 * Career-feed status alone is misleading: a company can be monitored for open
 * roles while having no salary evidence, no audited level ladder, and no city
 * the user is comparing. Reporting the four dimensions together, each with the
 * reason it is not ready, prevents a monitored company from looking
 * decision-ready when it cannot answer a pay question.
 */

export type ReadinessState = "ready" | "partial" | "blocked";

export type CompanyReadinessDimensionKey =
  | "identity"
  | "salaryEvidence"
  | "levelMapping"
  | "cityApplicability";

export interface CompanyReadinessDimension {
  key: CompanyReadinessDimensionKey;
  label: string;
  state: ReadinessState;
  detail: string;
}

export interface CompanyReadiness {
  slug: string;
  name: string;
  state: ReadinessState;
  headline: string;
  dimensions: CompanyReadinessDimension[];
  /** True only when every dimension a pay comparison depends on is ready. */
  comparable: boolean;
}

export interface CompanyReadinessInput {
  slug: string;
  name: string;
  researchStatus: CompanyResearchStatus;
  /** Levels with a sourced total-compensation figure. */
  salaryLevels: readonly SalaryLevel[];
  locationAvailability: readonly SalaryLocation[];
  /** The location scope currently being compared. */
  selectedLocation: DecisionLocation;
  targetLevel: Extract<SalaryLevel, "intern" | "junior" | "mid">;
}

const STATE_RANK: Record<ReadinessState, number> = { ready: 0, partial: 1, blocked: 2 };

function identityDimension(input: CompanyReadinessInput): CompanyReadinessDimension {
  const base = { key: "identity" as const, label: "Employer identity" };
  if (input.researchStatus === "monitoring") {
    return { ...base, state: "ready", detail: "Matched to a verified free career feed." };
  }
  if (input.researchStatus === "unsupported") {
    const audit = careerSourceAuditForSlug(input.slug);
    return {
      ...base,
      state: "blocked",
      detail: audit?.summary ?? "No supported free career feed matches this employer exactly.",
    };
  }
  if (input.researchStatus === "failed") {
    return { ...base, state: "blocked", detail: "The last discovery attempt failed." };
  }
  return {
    ...base,
    state: "partial",
    detail: input.researchStatus === "queued"
      ? "Queued for automatic career-feed discovery."
      : "Discovery is running.",
  };
}

function salaryDimension(input: CompanyReadinessInput): CompanyReadinessDimension {
  const base = { key: "salaryEvidence" as const, label: "Salary evidence" };
  if (input.salaryLevels.length === 0) {
    return {
      ...base,
      state: "blocked",
      detail: "No employer-posted salary exists on a public career page yet.",
    };
  }
  if (!input.salaryLevels.includes(input.targetLevel)) {
    return {
      ...base,
      state: "partial",
      detail: `Salary evidence exists, but not at the ${input.targetLevel} level being compared.`,
    };
  }
  return {
    ...base,
    state: "ready",
    detail: `Sourced pay at ${input.salaryLevels.length} ${input.salaryLevels.length === 1 ? "level" : "levels"}, including the one being compared.`,
  };
}

function levelDimension(input: CompanyReadinessInput): CompanyReadinessDimension {
  const base = { key: "levelMapping" as const, label: "Level mapping" };
  const ladder = companyLadder(input.slug);
  if (ladder === null) {
    return {
      ...base,
      state: "blocked",
      detail: "This company's ladder has not been audited, so no promotion target is claimed.",
    };
  }
  const resolved = resolveLadderStep(input.slug, input.targetLevel);
  if (resolved.status === "sourced" && resolved.nextCompanyLevel !== null) {
    return {
      ...base,
      state: "ready",
      detail: `${resolved.companyLevel} maps to the compared level and promotes to ${resolved.nextCompanyLevel}.`,
    };
  }
  return {
    ...base,
    state: "partial",
    detail: resolved.status === "unmapped"
      ? `${ladder.companyName} has no audited level at the band being compared.`
      : "The next level is not attributable, so no promotion figure is shown.",
  };
}

function locationApplies(
  availability: readonly SalaryLocation[],
  selected: DecisionLocation,
): boolean {
  if (selected === "Madrid" || selected === "Valencia") {
    return availability.includes(selected) || availability.includes("Spain-wide");
  }
  if (selected === "Remote") {
    return availability.includes("Remote Spain/EU");
  }
  return false;
}

function cityDimension(input: CompanyReadinessInput): CompanyReadinessDimension {
  const base = { key: "cityApplicability" as const, label: "City applicability" };
  if (input.locationAvailability.length === 0) {
    return { ...base, state: "blocked", detail: "No location scope is recorded for this company." };
  }
  if (!locationApplies(input.locationAvailability, input.selectedLocation)) {
    return {
      ...base,
      state: "blocked",
      detail: `No evidence for ${input.selectedLocation}; this company reports ${input.locationAvailability.join(", ")}.`,
    };
  }
  return { ...base, state: "ready", detail: `Evidence covers ${input.selectedLocation}.` };
}

export function companyReadiness(input: CompanyReadinessInput): CompanyReadiness {
  const dimensions = [
    identityDimension(input),
    salaryDimension(input),
    levelDimension(input),
    cityDimension(input),
  ];
  const worst = dimensions.reduce<ReadinessState>(
    (state, dimension) =>
      STATE_RANK[dimension.state] > STATE_RANK[state] ? dimension.state : state,
    "ready",
  );

  /*
   * A pay comparison needs identity, a figure at the compared level, and a
   * matching location scope. Level mapping only gates the promotion figure, so
   * an unaudited ladder does not remove a company from a pay comparison.
   */
  const comparable = dimensions
    .filter((dimension) => dimension.key !== "levelMapping")
    .every((dimension) => dimension.state === "ready");

  const blocked = dimensions.filter((dimension) => dimension.state === "blocked");
  const partial = dimensions.filter((dimension) => dimension.state === "partial");
  const headline = worst === "ready"
    ? "Ready to compare on pay, progression, and city costs."
    : blocked.length > 0
      ? `Blocked on ${blocked.map((dimension) => dimension.label.toLowerCase()).join(" and ")}.`
      : `Usable with limits: ${partial.map((dimension) => dimension.label.toLowerCase()).join(" and ")} incomplete.`;

  return { slug: input.slug, name: input.name, state: worst, headline, dimensions, comparable };
}
