import type { Confidence, SalaryCompany, SalaryPoint } from "@/lib/salary-data";

export type FreshnessState = "fresh" | "aging" | "stale" | "unknown";

export interface ResearchQuality {
  state: FreshnessState;
  ageDays: number | null;
  label: string;
  score: number;
  sourceCount: number;
  confidence: Confidence;
}

const DAY_MS = 86_400_000;

export function dateAgeDays(isoDate: string, now = new Date()): number | null {
  const timestamp = Date.parse(`${isoDate}T00:00:00Z`);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((now.getTime() - timestamp) / DAY_MS));
}

export function freshnessState(
  ageDays: number | null,
  freshForDays = 45,
  staleAfterDays = 120,
): FreshnessState {
  if (ageDays === null) return "unknown";
  if (ageDays <= freshForDays) return "fresh";
  if (ageDays <= staleAfterDays) return "aging";
  return "stale";
}

export function ageLabel(ageDays: number | null): string {
  if (ageDays === null) return "Unknown age";
  if (ageDays === 0) return "Checked today";
  if (ageDays === 1) return "Checked yesterday";
  return `Checked ${ageDays}d ago`;
}

export function pointResearchQuality(
  company: SalaryCompany,
  point: SalaryPoint | null,
  now = new Date(),
): ResearchQuality {
  const ageDays = dateAgeDays(company.lastResearchedAt, now);
  const state = freshnessState(ageDays);
  const sourceCount = point?.sourceIds.length ?? 0;
  const confidence = point?.confidence ?? "Unknown";
  const confidenceScore: Record<Confidence, number> = {
    High: 92,
    Medium: 74,
    Low: 48,
    Unknown: 18,
  };
  const freshnessAdjustment: Record<FreshnessState, number> = {
    fresh: 0,
    aging: -12,
    stale: -28,
    unknown: -35,
  };
  const sourceAdjustment = sourceCount >= 2 ? 4 : sourceCount === 0 ? -18 : 0;
  const score = Math.max(
    0,
    Math.min(100, confidenceScore[confidence] + freshnessAdjustment[state] + sourceAdjustment),
  );

  return {
    state,
    ageDays,
    label: ageLabel(ageDays),
    score,
    sourceCount,
    confidence,
  };
}

export function freshnessTone(state: FreshnessState): string {
  if (state === "fresh") return "text-success";
  if (state === "aging") return "text-warning";
  if (state === "stale") return "text-destructive";
  return "text-muted-foreground";
}
