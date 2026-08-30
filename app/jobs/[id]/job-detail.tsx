"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { motion } from "motion/react";
import { toast } from "sonner";
import type { Id } from "@/convex/_generated/dataModel";
import type { ScoreKey, UserStatus } from "@/lib/types";
import {
  computeVerdict,
  DEFAULT_WEIGHTS,
  formatMoney,
  networkLabel,
  postedLabel,
  SCORE_KEYS,
  SCORE_LABELS,
} from "@/lib/score";
import { api } from "@/convex/_generated/api";
import { Chip, EligibilityBadge, RungBadge, WorkModeChip } from "@/components/eq/badges";
import { CompanyLogo } from "@/components/eq/company-logo";
import { ScoreGauges } from "@/components/eq/score-gauges";
import { Verdict } from "@/components/eq/verdict";
import { PageLoading, PageShell } from "@/components/eq/page-shell";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ArrowSquareOut,
  Check,
  Clock,
  Copy,
  LinkSimple,
  MapPin,
  Minus,
  Pen,
  Scroll,
  ShieldWarning,
  Sparkle,
  Warning,
  X,
} from "@/components/eq/icon";

const STATUS_OPTIONS: { key: UserStatus; label: string }[] = [
  { key: "saved", label: "Saved" },
  { key: "applied", label: "Applied" },
  { key: "interviewing", label: "Interviewing" },
  { key: "offer", label: "Offer" },
  { key: "rejected", label: "Rejected" },
];

const LEVEL_META = {
  have: { icon: Check, cls: "text-success", label: "have" },
  partial: { icon: Minus, cls: "text-warning", label: "partial" },
  missing: { icon: X, cls: "text-destructive", label: "missing" },
} as const;

const fadeUp = {
  initial: { opacity: 0, y: 16, filter: "blur(6px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
};

export function JobDetail({ jobId }: { jobId: Id<"jobs"> }) {
  const job = useQuery(api.jobs.getById, { id: jobId });
  const setUserStatus = useMutation(api.jobs.setUserStatus);
  const setEligibilityOverride = useMutation(api.jobs.setEligibilityOverride);
  const [referralStep, setReferralStep] = useState(0);
  const [detailView, setDetailView] = useState<"decision" | "evidence" | "actions">(
    "decision"
  );

  if (job === undefined) {
    return (
      <PageLoading
        title="Job decision"
        description="Loading the verified role evidence and your fit assessment."
        rows={3}
      />
    );
  }

  if (job === null) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Link
          href="/"
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Back to pipeline
        </Link>
        <div className="rounded-[20px] border border-border bg-card p-10 text-center">
          <p className="text-sm font-medium">Job not found</p>
          <p className="mt-1 text-xs text-muted-foreground">
            It may have been archived, or the link is stale.
          </p>
        </div>
      </div>
    );
  }

  const verdict = computeVerdict(job, DEFAULT_WEIGHTS);
  const covered = job.requirements.filter((r) => r.level === "have").length;
  const tailorTargets = job.requirements.filter((r) => r.level !== "have");
  const network = job.scores.network;
  const showNetwork = network && network.provenance !== "unknown";

  const sourceMap = new Map<string, string>();
  for (const key of SCORE_KEYS) {
    for (const url of job.scores[key]?.sources ?? []) {
      if (!sourceMap.has(url)) {
        try {
          sourceMap.set(url, new URL(url).hostname.replace(/^www\./, ""));
        } catch {
          sourceMap.set(url, url);
        }
      }
    }
  }
  const sources = [...sourceMap.entries()];

  const factRows: { label: string; value: string; warn?: boolean }[] = [];
  const pf = job.programFacts;
  if (pf?.stipend) factRows.push({ label: "Study grant", value: formatMoney(pf.stipend) });
  if (pf?.durationMonths)
    factRows.push({
      label: "Duration",
      value: `${pf.durationMonths} months${pf.hoursPerWeek ? ` · ${pf.hoursPerWeek}h/week` : ""}`,
    });
  if (pf?.startDate) factRows.push({ label: "Start date", value: pf.startDate });
  if (pf?.selectionWindow)
    factRows.push({ label: "Selection window", value: pf.selectionWindow });
  if (pf?.openings) factRows.push({ label: "Openings", value: String(pf.openings) });
  if (pf?.bundledDegree) factRows.push({ label: "Bundled degree", value: pf.bundledDegree });
  if (pf?.tuitionCoverage)
    factRows.push({ label: "Tuition coverage", value: pf.tuitionCoverage, warn: true });
  if (pf?.conversionEstimate)
    factRows.push({ label: "Conversion to full-time", value: pf.conversionEstimate });
  if (pf?.netCostNote) factRows.push({ label: "Net cost", value: pf.netCostNote, warn: true });

  return (
    <PageShell>
      <Link
        href="/"
        className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Back to pipeline
      </Link>

      <motion.section
        {...fadeUp}
        transition={{ type: "spring", stiffness: 350, damping: 32 }}
        className="rounded-[20px] border border-border bg-card p-6"
      >
        <div className="mb-4 flex flex-wrap items-center gap-1.5">
          <RungBadge rung={job.rung} />
          <WorkModeChip mode={job.workMode} />
          {showNetwork && (
            <Chip icon={LinkSimple} tone="accent">
              {networkLabel(network.rationale)}
            </Chip>
          )}
          <EligibilityBadge eligibility={job.eligibility} />
          <span className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-medium text-muted-foreground">
            <Clock className="size-3.5" /> {postedLabel(job.postedAt)}
          </span>
        </div>

        <div className="flex items-start gap-4">
          <CompanyLogo company={job.company} size={56} />
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold tracking-tight">{job.title}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              {job.company}
              <span className="text-foreground/15">·</span>
              <MapPin className="size-3.5" />
              {job.locations.join(" · ")}
            </p>
          </div>
          <Verdict value={verdict.value} band={verdict.band} approx={verdict.approx} size="hero" />
        </div>

        {job.eligibility.reason && (
          <p className="mt-4 flex items-center gap-2 rounded-xl bg-warning/[0.08] px-3.5 py-2.5 text-[12.5px] font-medium text-warning ring-1 ring-warning/20">
            <ShieldWarning className="size-4 shrink-0" />
            {job.eligibility.reason}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-6 rounded-md px-2 text-[11px] text-warning hover:bg-warning/10 hover:text-warning"
              onClick={async () => {
                await setEligibilityOverride({ id: job._id, state: "eligible" });
                toast.success("Eligibility overridden — your call is final (user provenance)");
              }}
            >
              I am eligible
            </Button>
          </p>
        )}

        <div className="mt-5 border-t border-black/[0.05] pt-5">
          <ScoreGauges job={job} />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Status
          </span>
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              onClick={async () => {
                await setUserStatus({ id: job._id, status: opt.key });
                toast.success(`Status → ${opt.label}`);
              }}
              className={`rounded-lg px-2.5 py-1 text-[11.5px] font-medium ring-1 transition-all ${
                job.userStatus === opt.key
                  ? "bg-primary/10 text-primary ring-primary/25"
                  : "bg-white/70 text-muted-foreground ring-black/[0.06] hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </motion.section>

      <div className="mt-4 border-b border-foreground/10 pb-4">
        <SegmentedControl
          label="Job detail view"
          layoutId="job-detail-view"
          value={detailView}
          options={[
            { value: "decision", label: "Decision" },
            { value: "evidence", label: "Evidence", count: sources.length },
            { value: "actions", label: "Actions" },
          ]}
          onChange={setDetailView}
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
        <div className="flex flex-col gap-4">
          {detailView === "decision" && (
          <motion.section
            {...fadeUp}
            transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.06 }}
            className="rounded-[20px] border border-border bg-card p-5"
          >
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight">
                Requirement match
              </h2>
              <span className="text-xs text-muted-foreground tabular">
                {covered} of {job.requirements.length} covered
              </span>
            </div>
            <ul className="flex flex-col">
              {job.requirements.map((req, i) => {
                const meta = LEVEL_META[req.level];
                const Icon = meta.icon;
                return (
                  <motion.li
                    key={req.skill}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.12 + i * 0.05 }}
                    className="flex items-center gap-2.5 border-b border-black/[0.05] py-2.5 text-[13.5px] last:border-none"
                  >
                    <Icon className={`size-4 shrink-0 ${meta.cls}`} weight="regular" />
                    <span className="font-medium">{req.skill}</span>
                    {req.mustHave && (
                      <span className="rounded-md bg-black/[0.04] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-black/[0.06]">
                        must
                      </span>
                    )}
                    <span className={`ml-auto text-[11.5px] font-medium ${meta.cls}`}>
                      {req.provenance === "deduced" ? "≈ " : ""}
                      {meta.label}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          </motion.section>
          )}

          {detailView === "evidence" && (
          <motion.section
            {...fadeUp}
            transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.12 }}
            className="rounded-[20px] border border-border bg-card p-5"
          >
            <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <Sparkle className="size-4 text-primary" /> Why this rank
            </h2>
            <div className="flex flex-col gap-3.5">
              {SCORE_KEYS.map((key: ScoreKey) => {
                const s = job.scores[key];
                if (!s) return null;
                return (
                  <div key={key} className="rounded-xl border border-border bg-muted/40 p-3.5">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                        {SCORE_LABELS[key]}
                      </span>
                      <span className="text-[13px] font-semibold tabular">
                        {s.provenance === "deduced" ? "≈" : ""}
                        {s.value}
                        <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                          ±{s.band}
                        </span>
                      </span>
                      <span
                        className={`ml-auto rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                          s.provenance === "verified"
                            ? "bg-black/[0.04] text-foreground/70 ring-black/[0.06]"
                            : "bg-black/[0.03] text-muted-foreground ring-black/[0.05]"
                        }`}
                      >
                        {s.provenance}
                      </span>
                    </div>
                    <p className="text-[12.5px] leading-relaxed text-foreground/80">
                      {s.rationale}
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.section>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {detailView === "decision" && factRows.length > 0 && (
            <motion.section
              {...fadeUp}
              transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.09 }}
              className="rounded-[20px] border border-border bg-card p-5"
            >
              <h2 className="mb-2 text-[15px] font-semibold tracking-tight">
                Program facts
              </h2>
              <ul>
                {factRows.map((fact) => (
                  <li
                    key={fact.label}
                    className="flex items-center justify-between gap-3 border-b border-black/[0.05] py-2.5 text-[13px] last:border-none"
                  >
                    <span className="text-muted-foreground">{fact.label}</span>
                    <span
                      className={`text-right font-medium ${fact.warn ? "text-warning" : ""}`}
                    >
                      {fact.warn && (
                        <Warning className="mr-1 inline size-3.5 align-[-2px]" />
                      )}
                      {fact.value}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {detailView === "decision" && job.finePrint.length > 0 && (
            <motion.section
              {...fadeUp}
              transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.12 }}
              className="rounded-[20px] border border-border bg-card p-5"
            >
              <h2 className="mb-2 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <Scroll className="size-4 text-warning" /> Fine print
              </h2>
              <ul className="flex flex-col gap-2">
                {job.finePrint.map((line) => (
                  <li key={line} className="flex gap-2 text-[12.5px] leading-relaxed text-foreground/80">
                    <Warning className="mt-0.5 size-3.5 shrink-0 text-warning" />
                    {line}
                  </li>
                ))}
              </ul>
            </motion.section>
          )}

          {detailView === "actions" && showNetwork && (
            <motion.section
              {...fadeUp}
              transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.15 }}
              className="rounded-[20px] border border-border bg-card p-5"
            >
              <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                <LinkSimple className="size-4 text-primary" /> Referral path
              </h2>
              <p className="mb-3 text-xs text-muted-foreground">
                {networkLabel(network.rationale)} — a warm intro beats a cold
                application
              </p>
              <div className="rounded-xl border border-border bg-muted/40 p-3.5 text-[12.5px] leading-relaxed text-foreground/85">
                &ldquo;Hi! I&rsquo;m applying to {job.company}&rsquo;s{" "}
                {job.title.split("—")[0].trim()} role and saw we&rsquo;re
                connected — would you be open to a quick chat about the team?&rdquo;
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-8 rounded-lg text-xs"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `Hi! I'm applying to ${job.company}'s ${job.title} role and saw we're connected — would you be open to a quick chat about the team?`
                    );
                    toast.success("Draft copied — the app never sends messages for you");
                  }}
                >
                  <Copy className="size-3.5" /> Copy message
                </Button>
                {["Messaged", "Replied", "Referral secured"].map((step, i) => (
                  <button
                    key={step}
                    onClick={() => setReferralStep(i + 1 === referralStep ? i : i + 1)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium ring-1 transition-all ${
                      referralStep > i
                        ? "bg-success/10 text-success ring-success/25"
                        : "bg-white/70 text-muted-foreground ring-black/[0.06] hover:text-foreground"
                    }`}
                  >
                    {referralStep > i && <Check className="size-3" />}
                    {step}
                  </button>
                ))}
              </div>
            </motion.section>
          )}

          {detailView === "actions" && (
          <motion.section
            {...fadeUp}
            transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.18 }}
            className="rounded-[20px] border border-border bg-card p-5"
          >
            <h2 className="mb-1 flex items-center gap-2 text-[15px] font-semibold tracking-tight">
              <Pen className="size-4 text-primary" /> Tailor studio
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Reframes only — gaps go to your learning plan, never into your CV
            </p>
            <div className="flex flex-col gap-2.5">
              {tailorTargets.slice(0, 2).map((req) => (
                <div key={req.skill} className="rounded-xl border border-border bg-muted/40 p-3.5">
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${
                        req.level === "partial"
                          ? "bg-primary/10 text-primary ring-primary/20"
                          : "bg-warning/10 text-warning ring-warning/20"
                      }`}
                    >
                      {req.level === "partial" ? "reframe" : "gap"}
                    </span>
                    <span className="text-[12.5px] font-medium">{req.skill}</span>
                  </div>
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    {req.level === "partial"
                      ? `Surface your existing ${req.skill} exposure as a headline bullet with a measurable outcome — it's a stated requirement.`
                      : `Not on your CV. Routed to the skill heatmap learning plan instead of being written in.`}
                  </p>
                </div>
              ))}
              {tailorTargets.length === 0 && (
                <p className="text-[12.5px] text-muted-foreground">
                  You cover every requirement — nothing to tailor.
                </p>
              )}
            </div>
            <Button
              size="sm"
              className="mt-3 h-8 rounded-lg text-xs"
              onClick={() =>
                toast.success("Tailoring queued", {
                  description: "Run /process in Claude Code for the full rewrite + cover letter.",
                })
              }
            >
              <Sparkle className="size-3.5" /> Generate full tailoring
            </Button>
          </motion.section>
          )}

          {detailView === "evidence" && sources.length > 0 && (
            <motion.section
              {...fadeUp}
              transition={{ type: "spring", stiffness: 350, damping: 32, delay: 0.21 }}
              className="rounded-[20px] border border-border bg-card p-5"
            >
              <h2 className="mb-2 text-[15px] font-semibold tracking-tight">Sources</h2>
              <ul className="flex flex-col gap-1.5">
                {sources.map(([url, label]) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-primary transition-opacity hover:opacity-80"
                    >
                      <ArrowSquareOut className="size-3.5" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </motion.section>
          )}
        </div>
      </div>
    </PageShell>
  );
}
