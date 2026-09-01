"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";

import { CvExportDialog } from "@/components/eq/cv-export-dialog";
import { MatchBadge, MatchBreakdown } from "@/components/eq/match-breakdown";
import { RoleDetailDialog } from "@/components/eq/role-detail-dialog";
import { PageHeader, PageLoading, PageShell } from "@/components/eq/page-shell";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useCvMatch } from "@/components/eq/use-cv-match";
import { useSalaryDecisionContext } from "@/components/eq/use-salary-decision-context";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { canonicalLevel } from "@/lib/company-posted-salary";
import { cityCostKeyForLocation } from "@/lib/salary-decision-context";
import { matchPosting, TIER_LABELS, type MatchTier } from "@/lib/cv-match";
import { euroOrDash, signedEuro, signedPercent } from "@/lib/format";
import { payAmountFor, pointForLevel } from "@/lib/salary-analytics";
import {
  cheapestWins,
  companyFit,
  familyFit,
  nextJumps,
  realisticPay,
  skillOpportunities,
  type ScoredPosting,
} from "@/lib/score-analysis";
import { levelLabels, requiredSalaryLevels, type SalaryLevel } from "@/lib/salary-data";
import {
  estimateCashAfterCityReferenceCosts,
  estimateCashAfterPersonalCosts,
  personalCostForLocation,
} from "@/lib/city-reference-costs";
import { estimateSpainPayroll2026 } from "@/lib/spain-payroll-2026";
import { ChartEmpty, ChartSection, ChartTooltip, nivoTheme, COLORS } from "@/app/charts/_lib/chart-kit";
import { ResponsiveScatterPlot } from "@nivo/scatterplot";
import { skillLabel } from "@/lib/skill-taxonomy";

type StateFilter = "all" | "open" | "closed";
type TierFilter = "all" | MatchTier;
type ScatterX = "pay" | "net" | "afterCosts";

const SCATTER_X_OPTIONS: { value: ScatterX; label: string }[] = [
  { value: "pay", label: "Gross pay" },
  { value: "net", label: "Net take-home" },
  { value: "afterCosts", label: "After living costs" },
];

interface ScatterDatum {
  x: number;
  y: number;
  title: string;
  company: string;
  location: string;
  tier: string;
}

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
  const { targetLevel, location, payBasis, costMode } = useSalaryDecisionContext();

  const settings = useQuery(api.settings.get);
  const payrollModel = useQuery(api.payrollResearch.activeSpainPayrollModel);
  const cityCostKey = costMode === "reference" ? cityCostKeyForLocation(location) : null;
  const cityLivingCosts = useQuery(
    api.madridCostResearch.latestCityLivingCosts,
    cityCostKey === null ? "skip" : { cityKey: cityCostKey },
  );
  const personalCost =
    costMode === "personal"
      ? personalCostForLocation(settings?.personalCityCosts, location)
      : null;

  const [stateFilter, setStateFilter] = useState<StateFilter>("open");
  const [scatterX, setScatterX] = useState<ScatterX>("pay");
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
        firstSeenAt: posting.firstSeenAt,
        lastSeenAt: posting.lastSeenAt,
        closedAt: posting.closedAt,
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

  /**
   * The X value for one role, on the active basis. Every step can fail
   * honestly — an uncalibrated payroll model, an intern stipend the model does
   * not cover, a city with no cost figures — and each returns null rather than
   * a zero that would plot as a real point at the origin.
   */
  const scatterValue = (payEur: number | null): number | null => {
    if (payEur === null) return null;
    if (scatterX === "pay") return Math.round(payEur / 1000);
    if (payrollModel?.current !== true || targetLevel === "intern") return null;
    const payroll = estimateSpainPayroll2026(payEur);
    if (payroll === null) return null;
    if (scatterX === "net") return Math.round(payroll.monthlyNetCashEur);
    if (personalCost !== null) {
      const after = estimateCashAfterPersonalCosts(payroll.monthlyNetCashEur, personalCost);
      return after === null ? null : Math.round(after);
    }
    if (cityCostKey !== null && cityLivingCosts?.current === true) {
      const after = estimateCashAfterCityReferenceCosts(
        payroll.monthlyNetCashEur,
        cityLivingCosts.monthlyRentEur,
        cityLivingCosts.monthlyEssentialsEur,
      )?.monthlyCashAfterReferenceCostsEur;
      return after === undefined || after === null ? null : Math.round(after);
    }
    return null;
  };

  const scatterData = useMemo(() => {
    const points = scored.flatMap((entry) => {
      if (entry.match.score === null) return [];
      const x = scatterValue(entry.payEur);
      if (x === null) return [];
      return [{
        x,
        y: entry.match.score,
        title: entry.title,
        company: entry.companyName,
        location: entry.locations.join(" · "),
        tier: entry.match.tier ?? "weak",
      }];
    });
    // One series per tier so the colour carries the same meaning it does
    // everywhere else on the page, rather than being decorative.
    return (["strong", "possible", "weak"] as const)
      .map((tier) => ({
        id: TIER_LABELS[tier],
        data: points.filter((point) => point.tier === tier),
      }))
      .filter((series) => series.data.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scored, scatterX, payrollModel, cityLivingCosts, personalCost, targetLevel, cityCostKey]);

  const scatterPointCount = scatterData.reduce((sum, series) => sum + series.data.length, 0);

  const jumps = useMemo(
    () =>
      nextJumps(
        scored,
        (companySlug, level) => {
          const company = catalog.find((entry) => entry.slug === companySlug);
          if (company === undefined) return null;
          return payAmountFor(
            pointForLevel(company, level as SalaryLevel, location, payBasis),
            payBasis,
          );
        },
        requiredSalaryLevels,
        (level) => levelLabels[level as SalaryLevel] ?? level,
      ).slice(0, 6),
    [scored, catalog, location, payBasis],
  );

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
  const topSkill = opportunities[0];
  // Both figures or neither: a gap against a missing side would be a number
  // with no meaning, and a bar with nothing to compare against is decoration.
  const payGap =
    pay.headlineMedianEur !== null && pay.reachableMedianEur !== null
      ? Math.max(0, pay.headlineMedianEur - pay.reachableMedianEur)
      : null;
  const reachableShare =
    pay.headlineMedianEur !== null &&
    pay.reachableMedianEur !== null &&
    pay.headlineMedianEur > 0
      ? Math.min(100, Math.round((pay.reachableMedianEur / pay.headlineMedianEur) * 100))
      : null;
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

      {/* The verdict: the two pay figures as one statement, with the distance
          between them drawn rather than left for the reader to subtract. */}
      <div className="mb-5 rounded-2xl bg-eq-accent px-7 py-6 text-eq-accent-foreground">
        <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-eq-accent-foreground/60">
              Realistically yours
            </p>
            <p className="mt-1.5 text-[44px] font-semibold leading-none tracking-[-0.03em] tabular">
              {euroOrDash(pay.reachableMedianEur)}
            </p>
            <p className="mt-1.5 text-[11.5px] text-eq-accent-foreground/70">
              {pay.reachableCount === 0
                ? "No role currently scores possible or better"
                : `Median across the ${pay.reachableCount} ${pay.reachableCount === 1 ? "role" : "roles"} you match at possible or better`}
            </p>
          </div>

          {reachableShare !== null && (
            <div className="min-w-[180px] flex-1 pb-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-eq-accent-foreground/20">
                <div
                  className="h-full rounded-full bg-eq-accent-soft"
                  style={{ width: `${reachableShare}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] tabular text-eq-accent-foreground/70">
                <span>{euroOrDash(pay.reachableMedianEur)} yours</span>
                <span>{euroOrDash(pay.headlineMedianEur)} on offer</span>
              </div>
            </div>
          )}

          {payGap !== null && (
            <div className="pb-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-eq-accent-foreground/60">
                The gap
              </p>
              <p className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] tabular">
                −{euroOrDash(payGap)}
              </p>
              <p className="mt-1 text-[11.5px] text-eq-accent-foreground/70">
                What stronger matches would be worth
              </p>
            </div>
          )}
        </div>
      </div>

      {/* The single most actionable thing, said as a sentence before any table. */}
      {topSkill !== undefined && (
        <div className="mb-5 flex flex-wrap items-center gap-5 rounded-2xl bg-card p-5 shadow-[0_0_0_1px_rgb(26_25_23_/_5.5%)] sm:p-6">
          <div className="min-w-[260px] flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Do this next
            </p>
            <p className="mt-2 text-[17px] font-medium leading-[1.35] tracking-[-0.01em]">
              Learn <span className="font-semibold text-eq-accent">{topSkill.label}</span> — it is
              required by {topSkill.roleCount} {topSkill.roleCount === 1 ? "role" : "roles"} you
              otherwise fit
              {topSkill.unlocksNow > 0 &&
                `, and would move ${topSkill.unlocksNow} of ${topSkill.unlocksNow === 1 ? "them" : "them"} up a tier`}
              .
            </p>
            {topSkill.medianPayEur !== null && (
              <p className="mt-1.5 text-[11.5px] tabular text-muted-foreground">
                Those roles pay a median of {euroOrDash(topSkill.medianPayEur)}
              </p>
            )}
          </div>
          {opportunities.length > 1 && (
            <div className="flex min-w-[190px] flex-col gap-2">
              {opportunities.slice(1, 4).map((item) => (
                <div key={item.skillId} className="flex items-baseline justify-between gap-3">
                  <span className="text-[12px] text-muted-foreground">Then {item.label}</span>
                  <span className="shrink-0 text-[11.5px] tabular text-muted-foreground">
                    {item.roleCount} {item.roleCount === 1 ? "role" : "roles"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Roles a single skill would flip, promoted above the list. */}
      {wins.length > 0 && (
        <div className="mb-5">
          <Panel
            title="One skill away"
            description="Roles closest to moving up a tier, and the requirement standing in the way."
          >
            <ul className="space-y-2.5">
              {wins.map((win) => (
                <li key={win.entry.postingId} className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{win.entry.title}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {win.entry.companyName} ·{" "}
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
          </Panel>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[14.5px] font-semibold tracking-[-0.012em]">
          All {scored.length} roles
        </h2>
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
                  className="flex w-full items-baseline gap-3.5 px-5 py-3.5 text-left hover:bg-foreground/[0.02]"
                >
                  {/* The score leads the row: the list is read as a ranking,
                      so the number people are ranking on comes first. */}
                  <span
                    className={`w-9 shrink-0 self-center text-[17px] font-semibold tabular ${
                      entry.match.tier === "strong"
                        ? "text-eq-accent"
                        : entry.match.tier === "possible"
                          ? "text-eq-accent-mid"
                          : entry.match.score === null
                            ? "text-muted-foreground/50"
                            : "text-eq-accent-soft"
                    }`}
                  >
                    {entry.match.score ?? "—"}
                  </span>
                  <div className="min-w-0 flex-1">
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
                    <div className="mt-4 flex flex-wrap gap-2">
                      {/* The posting opens in the app, the same dialog the
                          company pages use, rather than handing the visit
                          straight to the employer's domain. The outbound link
                          lives inside it, after what EQ already knows. */}
                      <RoleDetailDialog
                        role={{
                          postingId: entry.postingId as Id<"jobPostings">,
                          title: entry.title,
                          url: entry.url,
                          locations: entry.locations,
                          firstSeenAt: entry.firstSeenAt,
                          lastSeenAt: entry.lastSeenAt,
                          open: entry.open,
                          closedAt: entry.closedAt,
                        }}
                        companyName={entry.companyName}
                        match={entry.match}
                        trigger="button"
                        triggerLabel="Open the posting"
                      />
                      <CvExportDialog
                        postingId={entry.postingId as Id<"jobPostings">}
                        postingTitle={entry.title}
                      />
                    </div>
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

      {/* Exploration, after the verdict and the browsing. "What to learn next"
          keeps its full ranking here — the band above states only its top row. */}
      <div className="mt-8 space-y-5">

        <ChartSection
          title="Match against pay"
          description="Every scored role: how well you match it, against what it pays. Colour is the match tier, so the top-right corner is where a role is both well paid and winnable."
          meta={`${scatterPointCount} scored ${scatterPointCount === 1 ? "role" : "roles"}`}
          height="h-[380px] sm:h-[420px]"
        >
          <div className="mb-3 flex justify-center">
            <SegmentedControl<ScatterX>
              label="What to plot pay as"
              layoutId="scores-scatter-x"
              value={scatterX}
              onChange={setScatterX}
              options={SCATTER_X_OPTIONS}
            />
          </div>
          {scatterPointCount < 2 ? (
            <ChartEmpty>
              {scatterX === "pay"
                ? "At least two roles need both a score and a pay figure."
                : "Net and after-cost figures need a validated payroll model, and are not estimated for internships."}
            </ChartEmpty>
          ) : (
            <ResponsiveScatterPlot<ScatterDatum>
              data={scatterData}
              margin={{ top: 18, right: 24, bottom: 56, left: 62 }}
              xScale={{ type: "linear", min: "auto", max: "auto" }}
              yScale={{ type: "linear", min: 0, max: 100 }}
              colors={[COLORS.green, COLORS.blue, COLORS.pale]}
              nodeSize={13}
              blendMode="normal"
              enableGridX
              enableGridY
              useMesh
              axisBottom={{
                tickSize: 4,
                tickPadding: 6,
                format: (value) => (scatterX === "pay" ? `€${value}k` : `€${value}`),
                legend:
                  scatterX === "pay"
                    ? "Gross annual pay"
                    : scatterX === "net"
                      ? "Net cash per month"
                      : "Cash per month after living costs",
                legendPosition: "middle",
                legendOffset: 42,
              }}
              axisLeft={{
                tickSize: 4,
                tickPadding: 6,
                legend: "Match against your CV",
                legendPosition: "middle",
                legendOffset: -48,
              }}
              theme={nivoTheme}
              animate
              motionConfig="gentle"
              role="img"
              ariaLabel="Match score against pay for every scored role"
              tooltip={({ node }) => (
                <ChartTooltip
                  title={node.data.title}
                  accent={node.color}
                  rows={[
                    { label: "Company", value: node.data.company },
                    { label: "Match", value: `${node.data.y} / 100` },
                    {
                      label: scatterX === "pay" ? "Pay" : scatterX === "net" ? "Net" : "After costs",
                      value:
                        scatterX === "pay"
                          ? `€${node.data.x}k`
                          : `${euroOrDash(node.data.x)} / mo`,
                    },
                    { label: "Location", value: node.data.location },
                  ]}
                />
              )}
            />
          )}
        </ChartSection>

        <Panel
          title="The next jump"
          description="If you take a role here, what the step after it pays — paired inside one company and one location scope, so no promotion is invented out of two different measurements."
        >
          {jumps.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">
              No company on file publishes two consecutive levels in this
              location scope, so there is no jump to state.
            </p>
          ) : (
            <ul className="space-y-3">
              {jumps.map((jump) => (
                <li key={`${jump.companySlug}-${jump.fromLabel}`}>
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium">{jump.companyName}</p>
                      <p className="mt-0.5 text-[11px] tabular text-muted-foreground">
                        {jump.fromLabel} {euroOrDash(jump.fromPayEur)} → {jump.toLabel}{" "}
                        {euroOrDash(jump.toPayEur)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {/* A step down is real and stays visible: Google's SDE2
                          median sits below its SDE1 here. Hard-coding a "+"
                          rendered that as "+-6%". */}
                      <p
                        className={`text-[12.5px] font-medium tabular ${
                          jump.deltaEur >= 0 ? "text-eq-accent" : "text-muted-foreground"
                        }`}
                      >
                        {signedPercent(jump.deltaPercent)}
                      </p>
                      <p className="text-[10.5px] tabular text-muted-foreground">
                        {signedEuro(jump.deltaEur)}
                      </p>
                    </div>
                  </div>
                  {jump.bestMatch !== null && (
                    <p className="mt-1 text-[10.5px] text-muted-foreground">
                      Your best match there is {jump.bestMatch}
                      {jump.bestMatch < 45 && " — the jump only matters if you get in"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>

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
                      <p className="text-[10.5px] tabular text-muted-foreground">
                        median {euroOrDash(item.medianPayEur)}
                      </p>
                    )}
                  </div>
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
