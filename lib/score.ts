import type { Job, ScoreKey, Weights } from "./types";

export const SCORE_KEYS: ScoreKey[] = ["fit", "salary", "aura", "future", "flex"];

export const SCORE_LABELS: Record<ScoreKey, string> = {
  fit: "Fit",
  salary: "Salary",
  aura: "Aura",
  future: "Future",
  flex: "Flex",
};

/** One-line meaning of each dimension, surfaced in tooltips so the score is legible. */
export const SCORE_DEFINITIONS: Record<ScoreKey, string> = {
  fit: "How well your CV matches this role's requirements.",
  salary: "Pay vs. the market rate for this role and city.",
  aura: "CV signalling power — how much this company + role opens doors and gets you noticed.",
  future: "5–10 year wealth: equity/stock access and where the pay curve takes you.",
  flex: "Remote / hybrid / on-site, hours, and location fit.",
};

export const DEFAULT_WEIGHTS: Weights = {
  fit: 30,
  salary: 25,
  future: 20,
  aura: 15,
  flex: 10,
};

export type Tier = "S" | "A" | "B" | "C";

/**
 * Renormalized verdict (SPEC rule 3): weighted mean over dimensions that
 * have data; dimensions with provenance "unknown" are excluded and the
 * remaining weights are scaled up. Never score a missing dimension as 0.
 * `network` is a rank modifier (±5), not a weighted dimension.
 */
export function computeVerdict(
  job: Job,
  weights: Weights
): { value: number; band: number; approx: boolean } {
  let weightSum = 0;
  let valueAcc = 0;
  let bandAcc = 0;
  let deducedWeight = 0;

  for (const key of SCORE_KEYS) {
    const score = job.scores[key];
    if (!score || score.provenance === "unknown") continue;
    const w = weights[key];
    weightSum += w;
    valueAcc += score.value * w;
    bandAcc += score.band * w;
    if (score.provenance === "deduced") deducedWeight += w;
  }

  if (weightSum === 0) return { value: 0, band: 0, approx: true };

  let value = valueAcc / weightSum;
  const band = bandAcc / weightSum;

  const network = job.scores.network;
  if (network && network.provenance !== "unknown") {
    const modifier = ((network.value - 50) / 50) * 5;
    value += modifier;
  }

  return {
    value: Math.round(Math.max(0, Math.min(100, value))),
    band: Math.round(band),
    approx: deducedWeight / weightSum > 0.4,
  };
}

/** Pessimistic tier display: a band straddling a boundary shows the lower tier. */
export function tierOf(value: number, band: number): Tier {
  const pessimistic = value - Math.min(band, 6);
  if (pessimistic >= 90) return "S";
  if (pessimistic >= 80) return "A";
  if (pessimistic >= 65) return "B";
  return "C";
}

/**
 * Restrained palette: S is the one solid pop of the accent color, A is an
 * accent tint, B is neutral, C is a muted danger tint. No rainbow.
 */
export const TIER_STYLES: Record<
  Tier,
  { text: string; bg: string; ring: string; label: string }
> = {
  S: {
    text: "text-primary-foreground",
    bg: "bg-primary",
    ring: "ring-primary/30",
    label: "S tier",
  },
  A: {
    text: "text-primary",
    bg: "bg-primary/10",
    ring: "ring-primary/20",
    label: "A tier",
  },
  B: {
    text: "text-muted-foreground",
    bg: "bg-muted",
    ring: "ring-border",
    label: "B tier",
  },
  C: {
    text: "text-destructive",
    bg: "bg-destructive/10",
    ring: "ring-destructive/20",
    label: "C tier",
  },
};

export function normalizeWeights(weights: Weights): Weights {
  const sum = SCORE_KEYS.reduce((acc, k) => acc + weights[k], 0) || 1;
  return SCORE_KEYS.reduce((acc, k) => {
    acc[k] = Math.round((weights[k] / sum) * 100);
    return acc;
  }, {} as Weights);
}

export function postedLabel(postedAt: number | undefined): string {
  if (!postedAt) return "date unknown";
  const hours = Math.max(0, (Date.now() - postedAt) / 3_600_000);
  if (hours < 24) return `${Math.max(1, Math.round(hours))}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£" };

export function formatMoney(money: {
  amount: number;
  currency: string;
  period: "month" | "year";
}): string {
  const symbol = CURRENCY_SYMBOL[money.currency] ?? money.currency + " ";
  const amount = money.amount.toLocaleString();
  return `${symbol}${amount}/${money.period === "month" ? "mo" : "yr"}`;
}

export function initialsOf(company: string): string {
  const words = company.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Derives a short chip label from a network score's rationale, e.g.
 * "1 first-degree connection works here (from the pasted banner) — a
 * direct referral path exists." -> "1 first-degree connection works here".
 * Falls back to a generic label if the heuristic finds nothing clean.
 */
export function networkLabel(rationale: string): string {
  const beforeDash = rationale.split(" — ")[0]?.trim() ?? "";
  const beforeParen = beforeDash.split("(")[0]?.trim() ?? "";
  const candidate = beforeParen || beforeDash || rationale;
  if (candidate.length === 0) return "Network signal";
  return candidate.length > 48 ? candidate.slice(0, 45).trimEnd() + "…" : candidate;
}
