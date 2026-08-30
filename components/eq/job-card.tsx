"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { Job } from "@/lib/types";
import { networkLabel, postedLabel } from "@/lib/score";
import { CompanyLogo } from "./company-logo";
import { Verdict } from "./verdict";
import { LinkSimple, ShieldWarning, Warning } from "@/components/eq/icon";

const WORK_MODE_LABEL: Record<Job["workMode"], string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  "on-site": "On-site",
  unknown: "",
};

export function JobCard({
  job,
  verdict,
}: {
  job: Job;
  verdict: { value: number; band: number; approx: boolean };
}) {
  const network = job.scores.network;
  const showNetwork = network && network.provenance !== "unknown";
  const workMode = WORK_MODE_LABEL[job.workMode];
  const showCheck = job.eligibility.state === "check";
  const redFlag = job.redFlags[0];

  const metaParts = [job.company, job.locations.join(" · "), workMode].filter(
    Boolean
  );
  const decisionSignals = [
    ["Fit", job.scores.fit],
    ["Salary", job.scores.salary],
    ["Future", job.scores.future],
  ] as const;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, y: -8 }}
      whileHover={{ x: 2 }}
      transition={{ type: "spring", stiffness: 350, damping: 32 }}
      className="group relative overflow-hidden rounded-lg border border-foreground/10 bg-card/90 shadow-[0_10px_28px_-24px_oklch(0.22_0.03_225/0.5)] transition-colors hover:border-primary/30"
    >
      <span className="absolute inset-y-0 left-0 w-1 bg-primary/70 transition-colors group-hover:bg-primary" />
      <Link href={`/jobs/${job._id}`} className="block p-4 pl-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 lg:grid-cols-[auto_minmax(0,1fr)_260px_auto]">
          <CompanyLogo company={job.company} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold transition-colors group-hover:text-primary">
              {job.title}
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-2 text-[11.5px] text-muted-foreground">
              <span className="truncate">{metaParts.join(" · ")}</span>
              <span className="shrink-0 whitespace-nowrap">{postedLabel(job.postedAt)}</span>
            </p>
          </div>
          <div className="col-span-3 flex items-center gap-5 border-t border-foreground/[0.06] pt-3 lg:col-span-1 lg:border-t-0 lg:pt-0">
            {decisionSignals.map(([label, score]) => (
              <div key={label} className="min-w-0">
                <p className="text-[9px] font-bold uppercase text-muted-foreground">
                  {label}
                </p>
                <p className="mt-0.5 text-xs font-bold tabular">
                  {score ? `${score.provenance === "deduced" ? "≈" : ""}${score.value}` : "—"}
                </p>
              </div>
            ))}
          </div>
          <Verdict value={verdict.value} band={verdict.band} approx={verdict.approx} />
        </div>
      </Link>

      {(showNetwork || showCheck || redFlag) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-foreground/[0.07] bg-foreground/[0.018] px-5 py-2.5 text-[11px] font-semibold">
          {showNetwork && (
            <span className="inline-flex items-center gap-1.5 text-primary">
              <LinkSimple className="size-3.5" weight="regular" />
              {networkLabel(network.rationale)}
            </span>
          )}
          {showCheck && (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <ShieldWarning className="size-3.5" weight="regular" />
              Check eligibility
            </span>
          )}
          {redFlag && (
            <span className="inline-flex items-center gap-1.5 text-destructive">
              <Warning className="size-3.5 shrink-0" weight="regular" />
              <span className="truncate">{redFlag}</span>
            </span>
          )}
        </div>
      )}
    </motion.article>
  );
}
