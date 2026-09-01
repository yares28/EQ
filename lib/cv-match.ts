import { ACRONYM_PAIRS, skillGroup, type SkillGroup } from "./skill-taxonomy.ts";

/**
 * How well one CV matches one posting.
 *
 * Modelled on what a real applicant-tracking system does, which is narrower and
 * blunter than "how good a fit is this person": it gates on the skills named in
 * the requirements block, checks the title's seniority, and rewards exact token
 * presence. Everything here is deterministic and runs in the browser, so a CV
 * edit re-scores every posting on the next render with nothing to invalidate.
 *
 * The scale, band and tier follow the app's existing score idiom (`lib/score.ts`)
 * rather than inventing a second one, so a match reads like every other number
 * in EQ.
 */

export type MatchTier = "strong" | "possible" | "weak";

export interface MatchCv {
  /** Canonical skill ids the CV evidences. */
  skills: string[];
  languages: { language: string; level: string }[];
  /** Full CV text, for the hygiene checks that look at phrasing, not skills. */
  text: string;
  /** Where the user is based / willing to work, as a DecisionLocation label. */
  baseLocation?: string;
  /** The level the user is actually applying at. */
  level: MatchLevel;
}

export type MatchLevel = "intern" | "junior" | "mid" | "senior" | "staff" | "principal";

export interface MatchPosting {
  title: string;
  locations: string[];
  matchTokens?: string[];
  mustHaveTokens?: string[];
  /** The posting's own level, when the pipeline resolved one. */
  level?: MatchLevel | "unknown";
  descriptionText?: string;
}

export interface MatchSignal {
  id: "mustHave" | "overlap" | "seniority" | "location" | "language" | "hygiene";
  label: string;
  /** 0..1. Null when there is nothing to judge — never silently zero. */
  value: number | null;
  weight: number;
  detail: string;
}

export interface MatchResult {
  /** 0..100, or null when the posting carries no tokens to match against. */
  score: number | null;
  band: number;
  tier: MatchTier | null;
  matched: string[];
  missing: string[];
  missingMustHaves: string[];
  signals: MatchSignal[];
  /** How many must-haves away from the next tier up. */
  gapToNextTier: number;
}

const LEVEL_ORDER: MatchLevel[] = ["intern", "junior", "mid", "senior", "staff", "principal"];

const WEIGHTS = {
  mustHave: 34,
  overlap: 26,
  seniority: 18,
  location: 10,
  language: 6,
  hygiene: 6,
} as const;

export const TIER_THRESHOLDS = { strong: 70, possible: 45 } as const;

export function matchTier(score: number): MatchTier {
  if (score >= TIER_THRESHOLDS.strong) return "strong";
  if (score >= TIER_THRESHOLDS.possible) return "possible";
  return "weak";
}

export const TIER_LABELS: Record<MatchTier, string> = {
  strong: "Strong",
  possible: "Possible",
  weak: "Weak",
};

/**
 * Seniority distance, signed: negative means the posting is above the user.
 * Reaching up is penalised much harder than reaching down, because an ATS
 * filters on years-of-experience thresholds a junior simply fails, while an
 * over-qualified applicant is merely unlikely rather than screened out.
 */
function seniorityFit(cvLevel: MatchLevel, postingLevel: MatchLevel): number {
  const distance = LEVEL_ORDER.indexOf(postingLevel) - LEVEL_ORDER.indexOf(cvLevel);
  if (distance <= 0) return distance === 0 ? 1 : Math.max(0.55, 1 + distance * 0.15);
  if (distance === 1) return 0.55;
  if (distance === 2) return 0.2;
  return 0.05;
}

const SPAIN = /\b(spain|españa|madrid|barcelona|valencia|málaga|malaga|sevilla|seville|bilbao|zaragoza|alicante)\b/i;
const REMOTE = /\b(remote|remoto|teletrabajo|hybrid|híbrido|hibrido)\b/i;

function locationFit(cv: MatchCv, posting: MatchPosting): { value: number | null; detail: string } {
  const raw = posting.locations.join(" · ");
  if (!raw.trim()) return { value: null, detail: "Posting states no location" };
  const inSpain = SPAIN.test(raw);
  const remote = REMOTE.test(raw);
  const base = cv.baseLocation?.trim();

  if (base && new RegExp(`\\b${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(raw)) {
    return { value: 1, detail: `Same city as your base (${base})` };
  }
  if (remote) return { value: 0.9, detail: "Remote or hybrid" };
  if (inSpain) return { value: 0.75, detail: "Elsewhere in Spain" };
  return { value: 0.15, detail: "Outside Spain" };
}

const SPANISH_REQUIRED = /\b(spanish|español|castellano)\b/i;
const ENGLISH_REQUIRED = /\b(english|inglés|ingles)\b/i;

function languageFit(cv: MatchCv, posting: MatchPosting): { value: number | null; detail: string } {
  const text = `${posting.title}\n${posting.descriptionText ?? ""}`;
  const wantsSpanish = SPANISH_REQUIRED.test(text);
  const wantsEnglish = ENGLISH_REQUIRED.test(text);
  if (!wantsSpanish && !wantsEnglish) {
    return { value: null, detail: "Posting names no language requirement" };
  }
  const spoken = new Set(cv.languages.map((entry) => entry.language.toLowerCase()));
  const has = (name: string) => [...spoken].some((value) => value.includes(name));
  const needed: string[] = [];
  if (wantsSpanish) needed.push("spanish");
  if (wantsEnglish) needed.push("english");
  const met = needed.filter((name) => has(name));
  return {
    value: met.length / needed.length,
    detail: met.length === needed.length
      ? `You speak ${needed.join(" and ")}`
      : `Asks for ${needed.join(" and ")}`,
  };
}

/**
 * The part a real ATS scores that has nothing to do with whether you can do the
 * job: whether the document itself is machine-readable in the ways the filter
 * expects. Only checks things the user can actually act on.
 */
function atsHygiene(
  cv: MatchCv,
  requiredTokens: string[],
): { value: number | null; detail: string } {
  const text = cv.text.toLowerCase();
  const held = new Set(cv.skills);
  // Only skills the CV actually has. Judging a posting's acronyms that the user
  // does not know would score them down for not writing "natural language
  // processing" when they have never done NLP — and the fix it implies is to
  // add a skill they do not have, which is the one thing this must never invite.
  const relevantPairs = ACRONYM_PAIRS.filter(
    (pair) => requiredTokens.includes(pair.id) && held.has(pair.id),
  );
  if (relevantPairs.length === 0) {
    return { value: null, detail: "No acronym ambiguity to fix for this posting" };
  }
  const bothSpelled = relevantPairs.filter(
    (pair) => text.includes(pair.short.toLowerCase()) && text.includes(pair.long.toLowerCase()),
  );
  const missing = relevantPairs.filter((pair) => !bothSpelled.includes(pair));
  return {
    value: bothSpelled.length / relevantPairs.length,
    detail: missing.length === 0
      ? "Acronyms and their expansions both appear"
      : `Spell out ${missing.map((pair) => `${pair.short} (${pair.long})`).join(", ")}`,
  };
}

/** Weighted mean over signals that have a value; absent signals are excluded
 *  and the rest scale up, exactly as `computeVerdict` does for job scores. */
function weightedMean(signals: MatchSignal[]): { value: number; coverage: number } {
  let weightSum = 0;
  let acc = 0;
  for (const signal of signals) {
    if (signal.value === null) continue;
    weightSum += signal.weight;
    acc += signal.value * signal.weight;
  }
  const total = signals.reduce((sum, signal) => sum + signal.weight, 0);
  if (weightSum === 0) return { value: 0, coverage: 0 };
  return { value: acc / weightSum, coverage: weightSum / total };
}

export function matchPosting(cv: MatchCv, posting: MatchPosting): MatchResult {
  const tokens = posting.matchTokens ?? [];
  const mustHaves = posting.mustHaveTokens ?? [];

  // A posting nobody has captured tokens for is unscored, not a zero — the same
  // rule the pay evidence follows. A zero here would rank it below a genuine
  // bad match, which is a different and false claim.
  if (tokens.length === 0) {
    return {
      score: null,
      band: 0,
      tier: null,
      matched: [],
      missing: [],
      missingMustHaves: [],
      signals: [],
      gapToNextTier: 0,
    };
  }

  const held = new Set(cv.skills);
  const matched = tokens.filter((token) => held.has(token));
  const missing = tokens.filter((token) => !held.has(token));
  const missingMustHaves = mustHaves.filter((token) => !held.has(token));
  const metMustHaves = mustHaves.filter((token) => held.has(token));

  const location = locationFit(cv, posting);
  const language = languageFit(cv, posting);
  const postingLevel = posting.level !== undefined && posting.level !== "unknown"
    ? posting.level
    : null;
  const hygiene = atsHygiene(cv, mustHaves.length > 0 ? mustHaves : tokens);

  const signals: MatchSignal[] = [
    {
      id: "mustHave",
      label: "Required skills",
      weight: WEIGHTS.mustHave,
      // Null rather than 1 when a posting names no specific must-haves: Google's
      // GTI role gates on a degree and years, not on named skills, and claiming
      // "you meet 100% of the requirements" there would be an invented finding.
      value: mustHaves.length === 0 ? null : metMustHaves.length / mustHaves.length,
      detail: mustHaves.length === 0
        ? "Posting names no specific required skills"
        : `${metMustHaves.length} of ${mustHaves.length} met`,
    },
    {
      id: "overlap",
      label: "Skill overlap",
      weight: WEIGHTS.overlap,
      value: matched.length / tokens.length,
      detail: `${matched.length} of ${tokens.length} skills mentioned`,
    },
    {
      id: "seniority",
      label: "Seniority",
      weight: WEIGHTS.seniority,
      value: postingLevel === null ? null : seniorityFit(cv.level, postingLevel),
      detail: postingLevel === null
        ? "Posting states no level"
        : `${postingLevel} role, you are ${cv.level}`,
    },
    { id: "location", label: "Location", weight: WEIGHTS.location, ...location },
    { id: "language", label: "Language", weight: WEIGHTS.language, ...language },
    { id: "hygiene", label: "ATS readability", weight: WEIGHTS.hygiene, ...hygiene },
  ];

  const { value, coverage } = weightedMean(signals);
  const score = Math.round(Math.max(0, Math.min(100, value * 100)));

  // The band widens as fewer signals could be judged, so a score resting on two
  // signals reads as less certain than one resting on six.
  const band = Math.round((1 - coverage) * 25);

  // How many more must-haves would lift this into the next tier. Answers
  // "what is the cheapest win?" rather than only "what do I match today?".
  let gapToNextTier = 0;
  if (mustHaves.length > 0 && score < TIER_THRESHOLDS.strong) {
    const target = score < TIER_THRESHOLDS.possible ? TIER_THRESHOLDS.possible : TIER_THRESHOLDS.strong;
    for (let extra = 1; extra <= missingMustHaves.length; extra += 1) {
      const lifted = signals.map((signal) =>
        signal.id === "mustHave"
          ? { ...signal, value: (metMustHaves.length + extra) / mustHaves.length }
          : signal,
      );
      if (weightedMean(lifted).value * 100 >= target) {
        gapToNextTier = extra;
        break;
      }
    }
  }

  return {
    score,
    band,
    tier: matchTier(score),
    matched,
    missing,
    missingMustHaves,
    signals,
    gapToNextTier,
  };
}

/** Which family a posting belongs to, for "what kind of role do I fit best". */
export function roleFamily(posting: MatchPosting): SkillGroup | "general" {
  const counts = new Map<SkillGroup, number>();
  for (const token of posting.matchTokens ?? []) {
    const group = skillGroup(token);
    if (group === null) continue;
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((left, right) => right[1] - left[1])[0];
  return best?.[0] ?? "general";
}
