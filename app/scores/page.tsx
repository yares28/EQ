"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";

import { MatchBadge, MatchBreakdown, TIER_TONE } from "@/components/eq/match-breakdown";
import { PageHeader, PageLoading, PageShell } from "@/components/eq/page-shell";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useCvMatch } from "@/components/eq/use-cv-match";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { Button } from "@/components/ui/button";
import { api } from "@/convex/_generated/api";
import { canonicalLevel } from "@/lib/company-posted-salary";
import { matchPosting, TIER_LABELS, type MatchTier } from "@/lib/cv-match";
import { euroOrDash } from "@/lib/format";
import { payAmountFor, pointForLevel } from "@/lib/salary-analytics";
import {
  cheapestWins,
  companyFit,
  familyFit,
  realisticPay,
  skillOpportunities,
  type ScoredPosting,
} from "@/lib/score-analysis";
import { skillLabel } from "@/lib/skill-taxonomy";

type StateFilter = "all" | "open" | "closed";
type TierFilter = "all" | MatchTier;

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
      <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">{title}</h2>
      <p className="mt-1 mb-4 text-[12.5px] leading-[1.5] text-muted-foreground">{description}</p>
      {children}
    </section>
  );
}

export default function ScoresPage() {
  const { cv, ready: cvReady } = useCvMatch();
  const data = useQuery(api.scores.spainTechPostings);
  const { companies: catalog } = useCompanyCatalog();
  const { targetLevel, location, payBasis } = useSalaryDecisionContext();

  const [stateFilter, setStateFilter] = useState<StateFilter>("open");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const scored = useMemo<ScoredPosting[]>(() => {
    if (cv === null || data === undefined) return [];
    const paySlugs = new Map(catalog.map((company) => [company.slug, company]));
    return data.postings.map((posting) => {
      const company = paySlugs.get(posting.companySlug);
      // The pay this role's own company publishes at the level being viewed —
      // the same figure the salary pages rank on, never a market average.
      const point = company
        ? pointForLevel(company, targetLevel, location, payBasis)
        : null;
      return {
        postingId: posting.postingId,
        companySlug: posting.companySlug,
        companyName: posting.companyName,
        title: posting.title,
        url: posting.url,
        locations: posting.locations,
        open: posting.open,
        lastSeenAt: posting.lastSeenAt,
        payEur: payAmountFor(point, payBasis),
        match: matchPosting(cv, {
          title: posting.title,
          locations: posting.locations,
          matchTokens: posting.matchTokens,
          mustHaveTokens: posting.mustHaveTokens,
          level: canonicalLevel(posting.title, posting.companySlug).level,
        }),
      };
    });
  }, [cv, data, catalog, targetLevel, location, payBasis]);

  const visible = useMemo(() => {
    return scored
      .filter((entry) => {
        const stateOk =
          stateFilter === "all" ? true : stateFilter === "open" ? entry.open : !entry.open;
        if (!stateOk) return false;
        // Unscored roles are excluded from tier filters rather than counted as
        // the worst — the same rule the score itself follows.
        if (tierFilter === "all") return true;
        return entry.match.tier === tierFilter;
      })
      .sort((left, right) => (right.match.score ?? -1) - (left.match.score ?? -1));
  }, [scored, stateFilter, tierFilter]);

  const opportunities = useMemo(() => skillOpportunities(scored).slice(0, 8), [scored]);
  const wins = useMemo(() => cheapestWins(scored), [scored]);
  const families = useMemo(() => familyFit(scored), [scored]);
  const companies = useMemo(() => companyFit(scored).slice(0, 10), [scored]);
  const pay = useMemo(() => realisticPay(scored), [scored]);

  if (!cvReady || data === undefined) {
    return <PageLoading title="Scores" rows={6} />;
  }

  if (cv === null) {
    return (
      <PageShell width="wide">
        <PageHeader title="Scores" />
        <div className="rounded-2xl bg-secondary px-6 py-12 text-center">
          <p className="text-sm font-medium">No CV imported yet</p>
          <p className="mx-auto mt-2 max-w-md text-[12.5px] leading-[1.5] text-muted-foreground">
            This page ranks every tech role tracked in Spain against your CV.
            Import one from Settings → Your CV and every role is scored
            immediately — nothing is precomputed, so a new CV re-scores
            everything on the spot.
          </p>
        </div>
      </PageShell>
    );
  }

  const tierCount = (tier: MatchTier) =>
    scored.filter((entry) => entry.match.tier === tier).length;
  const openCount = scored.filter((entry) => entry.open).length;
  const unscored = scored.filter((entry) => entry.match.score === null).length;

  return (
    <PageShell width="wide">
      <PageHeader
        title="Scores"
        meta={
          <span className="text-xs tabular text-muted-foreground">
            {scored.length} roles · {tierCount("strong")} strong · {tierCount("possible")} possible
          </span>
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pay on offer
          </p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {euroOrDash(pay.headlineMedianEur)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            Median across {pay.headlineCount} roles with a figure, whoever they hire
          </p>
        </div>
        <div className="rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-eq-accent">
            Realistically yours
          </p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {euroOrDash(pay.reachableMedianEur)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
            {pay.reachableCount === 0
              ? "No role currently scores possible or better"
              : `Median across the ${pay.reachableCount} you match at possible or better`}
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl<StateFilter>
          label="Filter by whether the role is still open"
          layoutId="scores-state"
          value={stateFilter}
          onChange={setStateFilter}
          options={[
            { value: "open", label: "Open", count: openCount },
            { value: "closed", label: "Closed", count: scored.length - openCount },
            { value: "all", label: "All", count: scored.length },
          ]}
        />
        <SegmentedControl<TierFilter>
          label="Filter by match tier"
          layoutId="scores-tier"
          value={tierFilter}
          onChange={setTierFilter}
          options={[
            { value: "all", label: "Any" },
            { value: "strong", label: "Strong", count: tierCount("strong") },
            { value: "possible", label: "Possible", count: tierCount("possible") },
            { value: "weak", label: "Weak", count: tierCount("weak") },
          ]}
        />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-secondary px-6 py-10 text-center text-[12.5px] text-muted-foreground">
          No role matches these filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-card shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)]">
          <ul className="divide-y divide-foreground/[0.06]">
            {visible.map((entry) => (
              <li key={entry.postingId}>
                <button
                  type="button"
                  onClick={() =>
                    setExpanded(expanded === entry.postingId ? null : entry.postingId)
                  }
                  className="flex w-full items-baseline justify-between gap-3 px-5 py-3.5 text-left hover:bg-foreground/[0.02]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium">{entry.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      <Link
                        href={`/companies/${entry.companySlug}`}
                        className="hover:underline"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {entry.companyName}
                      </Link>
                      {" · "}
                      {entry.locations.join(" · ")}
                      {entry.payEur !== null && ` · ${euroOrDash(entry.payEur)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <MatchBadge match={entry.match} hasCv />
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium ${
                        entry.open
                          ? "bg-success/10 text-success"
                          : "bg-foreground/[0.06] text-muted-foreground"
                      }`}
                    >
                      {entry.open ? "Open" : "Closed"}
                    </span>
                  </div>
                </button>
                {expanded === entry.postingId && (
                  <div className="border-t border-foreground/[0.06] bg-secondary/40 px-5 py-4">
                    <MatchBreakdown match={entry.match} />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-4 rounded-full"
                      render={<a href={entry.url} target="_blank" rel="noreferrer" />}
                    >
                      Open the posting
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {unscored > 0 && (
        <p className="mt-3 text-[11.5px] leading-4 text-muted-foreground">
          {unscored} {unscored === 1 ? "role has" : "roles have"} no captured
          requirements yet, so {unscored === 1 ? "it is" : "they are"} listed
          without a score rather than scored as zero.
        </p>
      )}

      <div className="mt-8 space-y-5">
        <Panel
          title="What to learn next"
          description="Skills required by roles you otherwise fit, ranked by how many they would unlock and what those roles pay."
        >
          {opportunities.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No role in the archive names a required skill you are missing.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {opportunities.map((item) => (
                <li key={item.skillId} className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium">{item.label}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {item.exampleTitles.join(" · ")}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[12.5px] font-medium tabular">
                      {item.roleCount} {item.roleCount === 1 ? "role" : "roles"}
                    </p>
                    {item.unlocksNow > 0 && (
                      <p className="text-[10.5px] font-medium text-eq-accent">
                        {item.unlocksNow} would move up a tier
                      </p>
                    )}
                    {item.medianPayEur !== null && (
                      <p className="text-[10.5px] text-muted-foreground tabular">
                        median {euroOrDash(item.medianPayEur)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Cheapest wins"
          description="Roles closest to moving up a tier, and the requirement standing in the way."
        >
          {wins.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No role is one requirement away from a higher tier right now.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {wins.map((win) => (
                <li
                  key={win.entry.postingId}
                  className="flex items-baseline justify-between gap-4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{win.entry.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {win.entry.companyName} ·{" "}
                      {/* The gap is how many more would cross the threshold, not
                          which ones — saying "needs A, B, C" beside "1 skill
                          away" reads as a contradiction when any one would do. */}
                      {win.gap < win.missing.length
                        ? `any ${win.gap} of ${win.missing.map((id) => skillLabel(id)).join(", ")}`
                        : `needs ${win.missing.map((id) => skillLabel(id)).join(", ")}`}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-eq-accent/10 px-2.5 py-1 text-[10.5px] font-medium text-eq-accent">
                    {win.gap === 1 ? "1 skill away" : `${win.gap} skills away`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel
            title="What kind of role fits you"
            description="Your median match by the dominant skill area of each role."
          >
            {families.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Nothing scored yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {families.map((family) => (
                  <li key={family.family}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[12.5px] font-medium">{family.label}</span>
                      <span className="text-[11.5px] tabular text-muted-foreground">
                        {family.medianScore} median · best {family.bestScore} ·{" "}
                        {family.roleCount} {family.roleCount === 1 ? "role" : "roles"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]">
                      <div
                        className="h-full rounded-full bg-eq-accent"
                        style={{ width: `${family.medianScore}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Where you fit best"
            description="Companies ranked by your strongest match rather than by what they pay."
          >
            {companies.length === 0 ? (
              <p className="text-[12.5px] text-muted-foreground">Nothing scored yet.</p>
            ) : (
              <ul className="space-y-2">
                {companies.map((company) => (
                  <li
                    key={company.companySlug}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <Link
                      href={`/companies/${company.companySlug}`}
                      className="truncate text-[12.5px] hover:underline"
                    >
                      {company.companyName}
                    </Link>
                    <span className="shrink-0 text-[11.5px] tabular text-muted-foreground">
                      best {company.bestScore} · {company.roleCount}{" "}
                      {company.roleCount === 1 ? "role" : "roles"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
