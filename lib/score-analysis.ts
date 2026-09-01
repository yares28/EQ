import { matchPosting, roleFamily, type MatchCv, type MatchResult, type MatchTier } from "./cv-match.ts";
import { skillLabel } from "./skill-taxonomy.ts";
import type { SkillGroup } from "./skill-taxonomy.ts";

/**
 * The analyses that turn a pile of per-role scores into something that changes
 * what you do next.
 *
 * Every one of these is derived from what `matchPosting` already returns, so
 * none of them costs a query, a write, or a stored score to go stale.
 */

export interface ScoredPosting {
  postingId: string;
  companySlug: string;
  companyName: string;
  title: string;
  url: string;
  locations: string[];
  open: boolean;
  firstSeenAt: number;
  lastSeenAt: number;
  closedAt?: number;
  match: MatchResult;
  /** Annual pay for this role's level and scope, when one is known. */
  payEur: number | null;
}

export interface SkillOpportunity {
  skillId: string;
  label: string;
  /** Roles that require it and that you do not currently meet. */
  roleCount: number;
  /** Roles where this is the *only* thing standing between you and a tier up. */
  unlocksNow: number;
  medianPayEur: number | null;
  exampleTitles: string[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

/**
 * Upgrade 1 — what to learn next.
 *
 * Ranks the skills you lack by how many roles require them and what those roles
 * pay, so 55 individual rejections become one ordered list. `unlocksNow` counts
 * the roles where that skill is the *last* missing requirement, which is a
 * stronger reason to learn it than sheer frequency.
 */
export function skillOpportunities(scored: ScoredPosting[]): SkillOpportunity[] {
  const bySkill = new Map<
    string,
    { count: number; pays: number[]; titles: string[]; unlocks: number }
  >();

  for (const entry of scored) {
    for (const skillId of entry.match.missingMustHaves) {
      const bucket = bySkill.get(skillId) ?? { count: 0, pays: [], titles: [], unlocks: 0 };
      // Counted separately from the examples, which are capped for display —
      // deriving the count from a capped list understates every popular skill.
      bucket.count += 1;
      if (entry.payEur !== null) bucket.pays.push(entry.payEur);
      if (bucket.titles.length < 3) bucket.titles.push(`${entry.companyName} — ${entry.title}`);
      // The only thing missing, and closing it would move the role up a tier.
      if (entry.match.missingMustHaves.length === 1 && entry.match.gapToNextTier === 1) {
        bucket.unlocks += 1;
      }
      bySkill.set(skillId, bucket);
    }
  }

  return [...bySkill.entries()]
    .map(([skillId, bucket]) => ({
      skillId,
      label: skillLabel(skillId),
      roleCount: bucket.count,
      unlocksNow: bucket.unlocks,
      medianPayEur: median(bucket.pays),
      exampleTitles: bucket.titles,
    }))
    // Roles unlocked outright first, then breadth, then pay.
    .sort(
      (left, right) =>
        right.unlocksNow - left.unlocksNow ||
        right.roleCount - left.roleCount ||
        (right.medianPayEur ?? 0) - (left.medianPayEur ?? 0),
    );
}

export interface RealisticPay {
  headlineMedianEur: number | null;
  reachableMedianEur: number | null;
  headlineCount: number;
  reachableCount: number;
}

/**
 * Upgrade 2 — realistic pay against headline pay.
 *
 * Every pay surface in EQ ranks what companies pay *someone*. Gating the same
 * figures by match tier gives what you could plausibly get; showing both makes
 * the gap between them explicit rather than leaving the headline to imply it is
 * yours.
 */
export function realisticPay(
  scored: ScoredPosting[],
  reachableTiers: MatchTier[] = ["strong", "possible"],
): RealisticPay {
  const withPay = scored.filter((entry) => entry.payEur !== null);
  const reachable = withPay.filter(
    (entry) => entry.match.tier !== null && reachableTiers.includes(entry.match.tier),
  );
  return {
    headlineMedianEur: median(withPay.map((entry) => entry.payEur as number)),
    reachableMedianEur: median(reachable.map((entry) => entry.payEur as number)),
    headlineCount: withPay.length,
    reachableCount: reachable.length,
  };
}

export interface CheapestWin {
  entry: ScoredPosting;
  gap: number;
  missing: string[];
}

/**
 * Upgrade 3 — gap to the next tier.
 *
 * The roles a single skill would flip, which is a different and more actionable
 * question than the roles you already match.
 */
export function cheapestWins(scored: ScoredPosting[], limit = 8): CheapestWin[] {
  return scored
    .filter((entry) => entry.match.gapToNextTier > 0)
    .map((entry) => ({
      entry,
      gap: entry.match.gapToNextTier,
      missing: entry.match.missingMustHaves,
    }))
    .sort(
      (left, right) =>
        left.gap - right.gap ||
        (right.entry.payEur ?? 0) - (left.entry.payEur ?? 0),
    )
    .slice(0, limit);
}

export interface FamilyFit {
  family: SkillGroup | "general";
  label: string;
  roleCount: number;
  medianScore: number;
  bestScore: number;
}

const FAMILY_LABELS: Record<SkillGroup | "general", string> = {
  language: "Core languages",
  backend: "Backend",
  frontend: "Frontend",
  data: "Data & ML",
  cloud: "Cloud & platform",
  tooling: "Tooling",
  practice: "Engineering practice",
  general: "Unclassified",
};

/** Which kind of role you fit best, for "what should I aim at". */
export function familyFit(scored: ScoredPosting[]): FamilyFit[] {
  const groups = new Map<SkillGroup | "general", number[]>();
  for (const entry of scored) {
    if (entry.match.score === null) continue;
    const family = roleFamily({
      title: entry.title,
      locations: entry.locations,
      matchTokens: entry.match.matched.concat(entry.match.missing),
    });
    groups.set(family, [...(groups.get(family) ?? []), entry.match.score]);
  }
  return [...groups.entries()]
    .map(([family, scores]) => ({
      family,
      label: FAMILY_LABELS[family],
      roleCount: scores.length,
      medianScore: median(scores) ?? 0,
      bestScore: Math.max(...scores),
    }))
    .sort((left, right) => right.medianScore - left.medianScore);
}

export interface CompanyFit {
  companySlug: string;
  companyName: string;
  roleCount: number;
  bestScore: number;
  medianScore: number;
}

/** Upgrade 6 — where you fit, rolled up per company. */
export function companyFit(scored: ScoredPosting[]): CompanyFit[] {
  const groups = new Map<string, { name: string; scores: number[] }>();
  for (const entry of scored) {
    if (entry.match.score === null) continue;
    const bucket = groups.get(entry.companySlug) ?? { name: entry.companyName, scores: [] };
    bucket.scores.push(entry.match.score);
    groups.set(entry.companySlug, bucket);
  }
  return [...groups.entries()]
    .map(([companySlug, bucket]) => ({
      companySlug,
      companyName: bucket.name,
      roleCount: bucket.scores.length,
      bestScore: Math.max(...bucket.scores),
      medianScore: median(bucket.scores) ?? 0,
    }))
    .sort((left, right) => right.bestScore - left.bestScore);
}

export interface RewriteComparison {
  improved: number;
  worsened: number;
  unchanged: number;
  netScoreDelta: number;
  biggestGain: { title: string; delta: number } | null;
  biggestLoss: { title: string; delta: number } | null;
}

/**
 * Upgrade 4 — A/B a rewritten CV against the current one.
 *
 * A rewrite that lifts the role it targeted while dropping ten others is a bad
 * rewrite, and nothing but scoring both against the whole archive makes that
 * visible.
 */
export function compareCvs(
  current: MatchCv,
  candidate: MatchCv,
  postings: Parameters<typeof matchPosting>[1][],
): RewriteComparison {
  let improved = 0;
  let worsened = 0;
  let unchanged = 0;
  let netScoreDelta = 0;
  let biggestGain: { title: string; delta: number } | null = null;
  let biggestLoss: { title: string; delta: number } | null = null;

  for (const posting of postings) {
    const before = matchPosting(current, posting).score;
    const after = matchPosting(candidate, posting).score;
    if (before === null || after === null) continue;
    const delta = after - before;
    netScoreDelta += delta;
    if (delta > 0) {
      improved += 1;
      if (biggestGain === null || delta > biggestGain.delta) {
        biggestGain = { title: posting.title, delta };
      }
    } else if (delta < 0) {
      worsened += 1;
      if (biggestLoss === null || delta < biggestLoss.delta) {
        biggestLoss = { title: posting.title, delta };
      }
    } else {
      unchanged += 1;
    }
  }

  return { improved, worsened, unchanged, netScoreDelta, biggestGain, biggestLoss };
}
