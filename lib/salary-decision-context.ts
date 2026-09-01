import {
  SPAIN_CITY_LOCATIONS,
  type SpainCityLocation,
} from "./salary-data.ts";

export type DecisionTargetLevel = "intern" | "junior" | "mid";

/**
 * Which figure the ranking compares. Employer postings state base pay only, so
 * base is the basis on which the most companies are genuinely comparable;
 * total additionally needs bonus and equity, which only sourced salary pages
 * publish. Mixing the two in one column compares unlike figures.
 */
export type PayBasis = "base" | "total";

/**
 * Which cost figures sit under a salary. `reference` uses the official city
 * bundles; `personal` uses the amounts the user entered for that exact
 * location and is never substituted from another city.
 */
export type CostMode = "off" | "reference" | "personal";

/** City or explicit-remote scope only — no EU benchmark and no catch-all "all Spain". */
export type DecisionLocation = SpainCityLocation | "Remote";

/**
 * Cities with a validated living-cost bundle. Every other city ranks on pay
 * alone and its after-cost figures stay locked rather than borrowing another
 * city's costs.
 */
export type CityCostKey = "madrid-city" | "valencia-city";

const CITY_COST_KEYS: Partial<Record<DecisionLocation, CityCostKey>> = {
  Madrid: "madrid-city",
  Valencia: "valencia-city",
};

export function cityCostKeyForLocation(location: DecisionLocation): CityCostKey | null {
  return CITY_COST_KEYS[location] ?? null;
}

export interface SalaryDecisionContext {
  targetLevel: DecisionTargetLevel;
  location: DecisionLocation;
  payBasis: PayBasis;
  costMode: CostMode;
}

export const SALARY_DECISION_CONTEXT_STORAGE_KEY = "eq-salary-decision-context";

export const DEFAULT_SALARY_DECISION_CONTEXT: SalaryDecisionContext = {
  targetLevel: "junior",
  location: "Madrid",
  payBasis: "base",
  costMode: "reference",
};

const targetLevels = new Set<DecisionTargetLevel>(["intern", "junior", "mid"]);
const locations = new Set<DecisionLocation>([...SPAIN_CITY_LOCATIONS, "Remote"]);
const payBases = new Set<PayBasis>(["base", "total"]);
const costModes = new Set<CostMode>(["off", "reference", "personal"]);

const LEGACY_LOCATION_MAP: Record<string, DecisionLocation> = {
  all: "Madrid",
  "Spain-wide": "Madrid",
  "Remote Spain/EU": "Remote",
  "EU benchmark": "Madrid",
  "Other Spain": "Madrid",
};

export type DecisionLocationSelectEntry = {
  kind: "group";
  label: string;
  options: Array<{ value: DecisionLocation; label: string }>;
};

export const DECISION_LOCATION_SELECT: DecisionLocationSelectEntry[] = [
  {
    kind: "group",
    label: "Spain",
    options: [
      ...SPAIN_CITY_LOCATIONS.map((city) => ({ value: city as DecisionLocation, label: city })),
      { value: "Remote" as DecisionLocation, label: "Remote" },
    ],
  },
];

export function decisionLocationLabel(location: DecisionLocation): string {
  return location;
}

export function normalizeDecisionLocation(value: string | undefined): DecisionLocation {
  if (value !== undefined && locations.has(value as DecisionLocation)) {
    return value as DecisionLocation;
  }
  if (value !== undefined && value in LEGACY_LOCATION_MAP) {
    return LEGACY_LOCATION_MAP[value];
  }
  return DEFAULT_SALARY_DECISION_CONTEXT.location;
}

/** Accepts the earlier boolean form so a stored preference is not discarded. */
function normalizeCostMode(value: unknown, legacyShowLivingCosts: unknown): CostMode {
  if (typeof value === "string" && costModes.has(value as CostMode)) {
    return value as CostMode;
  }
  if (typeof legacyShowLivingCosts === "boolean") {
    return legacyShowLivingCosts ? "reference" : "off";
  }
  return DEFAULT_SALARY_DECISION_CONTEXT.costMode;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseSalaryDecisionContext(raw: string | null): SalaryDecisionContext {
  if (raw === null) return { ...DEFAULT_SALARY_DECISION_CONTEXT };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { ...DEFAULT_SALARY_DECISION_CONTEXT };

    return {
      targetLevel:
        typeof parsed.targetLevel === "string" &&
        targetLevels.has(parsed.targetLevel as DecisionTargetLevel)
          ? (parsed.targetLevel as DecisionTargetLevel)
          : DEFAULT_SALARY_DECISION_CONTEXT.targetLevel,
      location: normalizeDecisionLocation(
        typeof parsed.location === "string" ? parsed.location : undefined,
      ),
      payBasis:
        typeof parsed.payBasis === "string" && payBases.has(parsed.payBasis as PayBasis)
          ? (parsed.payBasis as PayBasis)
          : DEFAULT_SALARY_DECISION_CONTEXT.payBasis,
      costMode: normalizeCostMode(parsed.costMode, parsed.showLivingCosts),
    };
  } catch {
    return { ...DEFAULT_SALARY_DECISION_CONTEXT };
  }
}

export function serializeSalaryDecisionContext(context: SalaryDecisionContext): string {
  return JSON.stringify({
    targetLevel: context.targetLevel,
    location: context.location,
    payBasis: context.payBasis,
    costMode: context.costMode,
  });
}
