export type DecisionMetricKey =
  | "totalComp"
  | "monthlyNetCash"
  | "progression"
  | "marketPercentile"
  | "cityAfterCosts"
  | "evidence";

export type DecisionMetricStatus = "decisive" | "tie" | "locked";
export type DecisionBriefStatus = "lead" | "tradeoff" | "locked";
export type DecisionBriefConfidence = "strong" | "directional" | "limited";
export type DecisionMetricUnit = "eur" | "eurPerMonth" | "percentagePoints" | "points";

/** One decisive dimension, stated with the size of the gap it turns on. */
export interface DecisionTradeoff {
  key: DecisionMetricKey;
  label: string;
  leaderSlug: string;
  leaderName: string;
  delta: number;
  unit: DecisionMetricUnit;
  explanation: string;
}

/**
 * What choosing a runner-up instead of the front-runner would gain and cost.
 * Answering this explicitly keeps a close second visible rather than letting a
 * single ranked list imply the alternative was unreasonable.
 */
export interface DecisionAlternative {
  slug: string;
  name: string;
  strengths: DecisionMetricKey[];
  concessions: DecisionMetricKey[];
  explanation: string;
}

export interface DecisionCandidate {
  slug: string;
  name: string;
  totalCompEur: number | null;
  monthlyNetCashEur: number | null;
  progressionPercent: number | null;
  marketPercentile: number | null;
  cityAfterCostsEur: number | null;
  evidenceScore: number | null;
}

export interface DecisionMetricResult {
  key: DecisionMetricKey;
  label: string;
  status: DecisionMetricStatus;
  countsTowardDecision: boolean;
  availableCandidateCount: number;
  leaderSlug: string | null;
  leaderName: string | null;
  runnerUpSlug: string | null;
  topValue: number | null;
  delta: number | null;
  minimumMeaningfulDelta: number;
  unit: DecisionMetricUnit;
}

export interface CompanyDecisionBrief {
  status: DecisionBriefStatus;
  confidence: DecisionBriefConfidence;
  leadSlug: string | null;
  leadName: string | null;
  runnerUpSlug: string | null;
  runnerUpName: string | null;
  headline: string;
  summary: string;
  availableDecisionMetricCount: number;
  decisiveMetricCount: number;
  winCounts: Record<string, number>;
  metrics: DecisionMetricResult[];
  tradeoffs: DecisionTradeoff[];
  /** Dimensions where the gap is too small to separate the companies. */
  tiedMetricKeys: DecisionMetricKey[];
  tieNote: string | null;
  alternatives: DecisionAlternative[];
  evidenceCaveat: string | null;
}

interface MetricDefinition {
  key: DecisionMetricKey;
  label: string;
  minimumMeaningfulDelta: number;
  countsTowardDecision: boolean;
  unit: DecisionMetricUnit;
  value: (candidate: DecisionCandidate) => number | null;
}

const METRICS: MetricDefinition[] = [
  {
    key: "totalComp",
    label: "total compensation",
    minimumMeaningfulDelta: 500,
    countsTowardDecision: true,
    unit: "eur",
    value: (candidate) => candidate.totalCompEur,
  },
  {
    key: "monthlyNetCash",
    label: "estimated monthly net cash",
    minimumMeaningfulDelta: 25,
    countsTowardDecision: true,
    unit: "eurPerMonth",
    value: (candidate) => candidate.monthlyNetCashEur,
  },
  {
    key: "progression",
    label: "next-level jump",
    minimumMeaningfulDelta: 1,
    countsTowardDecision: true,
    unit: "percentagePoints",
    value: (candidate) => candidate.progressionPercent,
  },
  {
    key: "marketPercentile",
    label: "exact-scope market position",
    minimumMeaningfulDelta: 5,
    countsTowardDecision: true,
    unit: "percentagePoints",
    value: (candidate) => candidate.marketPercentile,
  },
  {
    key: "cityAfterCosts",
    label: "monthly cash after city reference costs",
    minimumMeaningfulDelta: 25,
    countsTowardDecision: false,
    unit: "eurPerMonth",
    value: (candidate) => candidate.cityAfterCostsEur,
  },
  {
    key: "evidence",
    label: "evidence quality",
    minimumMeaningfulDelta: 3,
    countsTowardDecision: false,
    unit: "points",
    value: (candidate) => candidate.evidenceScore,
  },
];

function formatDelta(unit: DecisionMetricUnit, value: number): string {
  const magnitude = Math.abs(Math.round(value));
  if (unit === "eur") return `€${magnitude.toLocaleString("en-US")}`;
  if (unit === "eurPerMonth") return `€${magnitude.toLocaleString("en-US")}/month`;
  if (unit === "percentagePoints") return `${magnitude} pp`;
  return `${magnitude} point${magnitude === 1 ? "" : "s"}`;
}

function joinPhrases(phrases: string[]): string {
  if (phrases.length === 0) return "";
  if (phrases.length === 1) return phrases[0];
  return `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`;
}

function analyzeMetric(
  candidates: DecisionCandidate[],
  definition: MetricDefinition,
): DecisionMetricResult {
  const available = candidates
    .flatMap((candidate) => {
      const value = definition.value(candidate);
      return value === null || !Number.isFinite(value) ? [] : [{ candidate, value }];
    })
    .sort(
      (left, right) =>
        right.value - left.value || left.candidate.name.localeCompare(right.candidate.name),
    );

  if (available.length < 2) {
    return {
      key: definition.key,
      label: definition.label,
      status: "locked",
      countsTowardDecision: definition.countsTowardDecision,
      availableCandidateCount: available.length,
      leaderSlug: null,
      leaderName: null,
      runnerUpSlug: null,
      topValue: available[0]?.value ?? null,
      delta: null,
      minimumMeaningfulDelta: definition.minimumMeaningfulDelta,
      unit: definition.unit,
    };
  }

  const [leader, runnerUp] = available;
  const delta = leader.value - runnerUp.value;
  const status: DecisionMetricStatus =
    delta < definition.minimumMeaningfulDelta ? "tie" : "decisive";
  return {
    key: definition.key,
    label: definition.label,
    status,
    countsTowardDecision: definition.countsTowardDecision,
    availableCandidateCount: available.length,
    leaderSlug: status === "decisive" ? leader.candidate.slug : null,
    leaderName: status === "decisive" ? leader.candidate.name : null,
    runnerUpSlug: status === "decisive" ? runnerUp.candidate.slug : null,
    topValue: leader.value,
    delta,
    minimumMeaningfulDelta: definition.minimumMeaningfulDelta,
    unit: definition.unit,
  };
}

function metricNames(metrics: DecisionMetricResult[]): string {
  const labels = metrics.map((metric) => metric.label);
  if (labels.length === 0) return "none of the comparable decision dimensions";
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export function buildCompanyDecisionBrief({
  candidates,
  usingPreview = false,
  usingStaleEvidence = false,
}: {
  candidates: DecisionCandidate[];
  usingPreview?: boolean;
  /** Set when any compared figure rests on evidence past its refresh window. */
  usingStaleEvidence?: boolean;
}): CompanyDecisionBrief {
  const metrics = METRICS.map((definition) => analyzeMetric(candidates, definition));
  const decisionMetrics = metrics.filter((metric) => metric.countsTowardDecision);
  const availableDecisionMetrics = decisionMetrics.filter((metric) => metric.status !== "locked");
  const decisiveMetrics = decisionMetrics.filter((metric) => metric.status === "decisive");
  const winCounts = Object.fromEntries(candidates.map((candidate) => [candidate.slug, 0]));
  for (const metric of decisiveMetrics) {
    if (metric.leaderSlug !== null) winCounts[metric.leaderSlug] += 1;
  }

  const rankedCandidates = candidates.slice().sort((left, right) => {
    const byWins = (winCounts[right.slug] ?? 0) - (winCounts[left.slug] ?? 0);
    if (byWins !== 0) return byWins;
    const leftPay = left.totalCompEur ?? Number.NEGATIVE_INFINITY;
    const rightPay = right.totalCompEur ?? Number.NEGATIVE_INFINITY;
    return rightPay - leftPay || left.name.localeCompare(right.name);
  });
  const first = rankedCandidates[0] ?? null;
  const second = rankedCandidates[1] ?? null;
  const firstWins = first ? winCounts[first.slug] ?? 0 : 0;
  const secondWins = second ? winCounts[second.slug] ?? 0 : 0;
  const hasLead =
    availableDecisionMetrics.length >= 2 &&
    first !== null &&
    firstWins >= 2 &&
    firstWins > secondWins;

  let status: DecisionBriefStatus;
  if (candidates.length < 2 || availableDecisionMetrics.length < 2) status = "locked";
  else if (hasLead) status = "lead";
  else status = "tradeoff";

  const lead = status === "lead" ? first : null;
  const runnerUp = status === "lead" ? second : null;
  const leadMetrics = lead
    ? decisiveMetrics.filter((metric) => metric.leaderSlug === lead.slug)
    : [];
  const runnerUpMetrics = runnerUp
    ? decisiveMetrics.filter((metric) => metric.leaderSlug === runnerUp.slug)
    : [];
  const totalCompMetric = metrics.find((metric) => metric.key === "totalComp");
  const progressionMetric = metrics.find((metric) => metric.key === "progression");

  let headline: string;
  let summary: string;
  if (status === "locked") {
    headline = "More shared evidence is needed before naming a financial lead.";
    summary =
      "At least two comparable decision dimensions are required. Missing values stay excluded instead of being treated as zero.";
  } else if (status === "lead" && lead) {
    headline = `${lead.name} leads the financial case in this view.`;
    summary = `${lead.name} leads ${metricNames(leadMetrics)}${
      runnerUp && runnerUpMetrics.length > 0
        ? `; ${runnerUp.name} leads ${metricNames(runnerUpMetrics)}`
        : ""
    }. This is a salary decision signal, not a judgment on every aspect of the employer.`;
  } else if (
    totalCompMetric?.status === "decisive" &&
    progressionMetric?.status === "decisive" &&
    totalCompMetric.leaderSlug !== progressionMetric.leaderSlug
  ) {
    headline = `${totalCompMetric.leaderName} leads current pay; ${progressionMetric.leaderName} leads the next level.`;
    summary =
      "The evidence points to a real trade-off, so the app does not collapse the choice into an arbitrary overall score.";
  } else {
    headline = "The financial choice remains a trade-off in this view.";
    summary =
      "No company has a clear lead across the available comparable dimensions. Near-equal values are treated as ties.";
  }

  const tradeoffs: DecisionTradeoff[] = metrics
    .filter(
      (metric): metric is DecisionMetricResult & { leaderSlug: string; leaderName: string; delta: number } =>
        metric.status === "decisive" &&
        metric.leaderSlug !== null &&
        metric.leaderName !== null &&
        metric.delta !== null,
    )
    .map((metric) => ({
      key: metric.key,
      label: metric.label,
      leaderSlug: metric.leaderSlug,
      leaderName: metric.leaderName,
      delta: metric.delta,
      unit: metric.unit,
      explanation: `${metric.leaderName} leads ${metric.label} by ${formatDelta(metric.unit, metric.delta)}.`,
    }));

  const tiedMetrics = metrics.filter((metric) => metric.status === "tie");
  const tiedMetricKeys = tiedMetrics.map((metric) => metric.key);
  const tieNote = tiedMetrics.length === 0
    ? null
    : `${metricNames(tiedMetrics)} ${tiedMetrics.length === 1 ? "is" : "are"} too close to separate these companies, so ${tiedMetrics.length === 1 ? "it counts" : "they count"} for neither side.`;

  /*
   * The front-runner is the ranking's first entry even when no company earned a
   * lead, so a trade-off view can still answer what the alternatives cost.
   */
  const frontRunner = first;
  const alternatives: DecisionAlternative[] = frontRunner === null
    ? []
    : rankedCandidates
        .filter((candidate) => candidate.slug !== frontRunner.slug)
        .map((candidate) => {
          const strengths: DecisionMetricKey[] = [];
          const concessions: DecisionMetricKey[] = [];
          const gains: string[] = [];
          const gives: string[] = [];
          for (const definition of METRICS) {
            const mine = definition.value(candidate);
            const theirs = definition.value(frontRunner);
            if (mine === null || theirs === null) continue;
            if (!Number.isFinite(mine) || !Number.isFinite(theirs)) continue;
            const delta = mine - theirs;
            if (Math.abs(delta) < definition.minimumMeaningfulDelta) continue;
            const phrase = `${formatDelta(definition.unit, delta)} of ${definition.label}`;
            if (delta > 0) {
              strengths.push(definition.key);
              gains.push(phrase);
            } else {
              concessions.push(definition.key);
              gives.push(phrase);
            }
          }
          const explanation = gains.length === 0 && gives.length === 0
            ? `${candidate.name} and ${frontRunner.name} are within the meaningful-difference threshold on every comparable dimension.`
            : gains.length === 0
              ? `Choosing ${candidate.name} over ${frontRunner.name} gives up ${joinPhrases(gives)} and gains nothing measurable in this view.`
              : gives.length === 0
                ? `Choosing ${candidate.name} over ${frontRunner.name} gains ${joinPhrases(gains)} at no measurable cost in this view.`
                : `Choosing ${candidate.name} over ${frontRunner.name} gains ${joinPhrases(gains)} and gives up ${joinPhrases(gives)}.`;
          return { slug: candidate.slug, name: candidate.name, strengths, concessions, explanation };
        });

  const evidenceCaveat = usingStaleEvidence
    ? "At least one compared figure rests on evidence past its refresh window, so this comparison is directional until the source refreshes."
    : usingPreview
      ? "This view includes preview evidence, so it is directional rather than a settled comparison."
      : null;

  const winMargin = Math.max(0, firstWins - secondWins);
  const confidence: DecisionBriefConfidence =
    usingPreview || usingStaleEvidence || status === "locked"
      ? "limited"
      : status === "lead" &&
          candidates.length === 2 &&
          availableDecisionMetrics.length >= 3 &&
          winMargin >= 2
        ? "strong"
        : "directional";

  return {
    status,
    confidence,
    leadSlug: lead?.slug ?? null,
    leadName: lead?.name ?? null,
    runnerUpSlug: runnerUp?.slug ?? null,
    runnerUpName: runnerUp?.name ?? null,
    headline,
    summary,
    availableDecisionMetricCount: availableDecisionMetrics.length,
    decisiveMetricCount: decisiveMetrics.length,
    winCounts,
    metrics,
    tradeoffs,
    tiedMetricKeys,
    tieNote,
    alternatives,
    evidenceCaveat,
  };
}
