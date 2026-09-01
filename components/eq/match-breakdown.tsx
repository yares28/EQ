"use client";

import { TIER_LABELS, type MatchResult } from "@/lib/cv-match";
import { skillLabel } from "@/lib/skill-taxonomy";

export const TIER_TONE: Record<string, string> = {
  strong: "bg-success/10 text-success",
  possible: "bg-eq-accent/10 text-eq-accent",
  weak: "bg-foreground/[0.06] text-muted-foreground",
};

/** The score as a chip, or an honest note when there is nothing to score. */
export function MatchBadge({
  match,
  hasCv,
}: {
  match: MatchResult | null;
  hasCv: boolean;
}) {
  if (!hasCv) return null;
  if (match === null || match.score === null) {
    return (
      <span className="rounded-full bg-foreground/[0.06] px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground">
        Not scored
      </span>
    );
  }
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium tabular ${TIER_TONE[match.tier ?? "weak"]}`}
    >
      {match.score}
      {match.band > 0 && <span className="opacity-60"> ±{match.band}</span>}
      {" · "}
      {TIER_LABELS[match.tier ?? "weak"]}
    </span>
  );
}

function SkillChips({ ids, tone }: { ids: string[]; tone: string }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <span key={id} className={`rounded-full px-2 py-1 text-[10px] font-medium ${tone}`}>
          {skillLabel(id)}
        </span>
      ))}
    </div>
  );
}

/**
 * Why the score is what it is.
 *
 * Every signal is shown including the ones that could not be judged, because a
 * score resting on three signals and one resting on six are different claims
 * and hiding the difference would make the weaker one look as solid as the
 * stronger. An unjudged signal reads "not judged", never 0%.
 */
export function MatchBreakdown({ match }: { match: MatchResult }) {
  if (match.score === null) {
    return (
      <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
        EQ has not captured this posting&rsquo;s required skills, so there is
        nothing to score against. Scoring it as zero would rank it below roles
        that are a genuine bad match, which is a different claim.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-semibold tabular">{match.score}</span>
        <span className="text-[12px] text-muted-foreground">
          / 100 {match.band > 0 && `± ${match.band}`}
        </span>
        <span
          className={`ml-auto rounded-full px-2.5 py-1 text-[10.5px] font-medium ${TIER_TONE[match.tier ?? "weak"]}`}
        >
          {TIER_LABELS[match.tier ?? "weak"]}
        </span>
      </div>

      {match.gapToNextTier > 0 && (
        <p className="rounded-xl bg-eq-accent/[0.08] px-3 py-2 text-[12px] leading-[1.5] ring-1 ring-eq-accent/20">
          {match.gapToNextTier === 1
            ? "One more required skill would move this up a tier."
            : `${match.gapToNextTier} more required skills would move this up a tier.`}
        </p>
      )}

      <dl className="space-y-2">
        {match.signals.map((signal) => (
          <div key={signal.id} className="flex items-baseline justify-between gap-4">
            <dt className="min-w-0 text-[11.5px] text-muted-foreground">
              {signal.label}
              <span className="ml-1.5 opacity-70">{signal.detail}</span>
            </dt>
            <dd className="shrink-0 text-[11.5px] font-medium tabular">
              {signal.value === null ? (
                <span className="text-muted-foreground">not judged</span>
              ) : (
                `${Math.round(signal.value * 100)}%`
              )}
            </dd>
          </div>
        ))}
      </dl>

      {match.missingMustHaves.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Required, and missing
          </p>
          <SkillChips ids={match.missingMustHaves} tone="bg-destructive/10 text-destructive" />
        </div>
      )}

      {match.matched.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            You have
          </p>
          <SkillChips ids={match.matched} tone="bg-success/10 text-success" />
        </div>
      )}

      {match.missing.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Mentioned, not on your CV
          </p>
          <SkillChips ids={match.missing} tone="bg-foreground/[0.05] text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
