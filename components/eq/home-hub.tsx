"use client";


import { BentoShell, BentoTile } from "@/components/eq/bento-tile";
import {
  ChartBar,
  ChartLineUp,
  Scales,
} from "@/components/eq/icon";
import { useCompanyCatalog } from "@/components/eq/use-company-catalog";
import { useShortlist } from "@/components/eq/use-shortlist";
import {
  decisionProgressionFor,
  formatEuro,
  pointForLevel,
  targetLevelLabels,
} from "@/lib/salary-analytics";
import { HOME_BENTO_ART } from "@/lib/home-bento-art";

const TARGET_LEVEL = "junior" as const;
const LOCATION = "Madrid" as const;

export function HomeHub() {
  const shortlist = useShortlist();
  const { companies } = useCompanyCatalog();

  const ranked = companies
    .map((company) => ({
      company,
      point: pointForLevel(company, TARGET_LEVEL, LOCATION),
      progression: decisionProgressionFor(company, TARGET_LEVEL, LOCATION),
    }))
    .filter((row) => row.point !== null);

  const topPay =
    ranked.slice().sort((a, b) => (b.point?.totalCompEur ?? 0) - (a.point?.totalCompEur ?? 0))[0] ??
    null;

  const topGrowth =
    ranked
      .filter((row) => row.progression !== null && row.progression.decisionGrade)
      .slice()
      .sort((a, b) => (b.progression?.percent ?? 0) - (a.progression?.percent ?? 0))[0] ?? null;

  const headline = topPay
    ? topGrowth && topGrowth.company.slug !== topPay.company.slug
      ? `${topPay.company.canonicalName} leads pay · ${topGrowth.company.canonicalName} leads jump`
      : `${topPay.company.canonicalName} leads pay and progression`
    : "No jobs-page salary for this view yet";

  const shortlistCount = shortlist.companies.size;

  return (
    <BentoShell>
      <div className="grid h-full min-h-0 grid-cols-2 grid-rows-[1.15fr_0.95fr_0.8fr] gap-3 sm:gap-4 lg:grid-cols-3 lg:grid-rows-[1fr_1fr]">
        <BentoTile
          href="/salary"
          density="hub"
          art={HOME_BENTO_ART.salary}
          eyebrow={`${targetLevelLabels[TARGET_LEVEL]} · ${LOCATION}`}
          metric={topPay ? formatEuro(topPay.point?.totalCompEur ?? null, true) : undefined}
          title={headline}
          cta="Open ranking"
          icon={ChartLineUp}
          className="col-span-2 row-span-2 lg:col-span-2 lg:row-span-2"
        />

        <BentoTile
          href="/compare"
          density="hub"
          art={HOME_BENTO_ART.compare}
          eyebrow="Compare"
          metric={String(shortlistCount)}
          title={shortlistCount === 1 ? "company shortlisted" : "companies shortlisted"}
          cta="Open compare"
          icon={Scales}
          className="col-span-1 row-span-1"
        />

        

        

        <BentoTile
          href="/charts"
          density="hub"
          art={HOME_BENTO_ART.charts}
          eyebrow="Charts"
          title="Pay and growth"
          icon={ChartBar}
          className="col-span-1"
        />

        
      </div>
    </BentoShell>
  );
}
