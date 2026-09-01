"use client";

import { useMemo, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, MagnifyingGlass, Plus } from "@/components/eq/icon";

import { api } from "@/convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

function parsedNames(value: string): string[] {
  return [...new Set(
    value
      .split(/[\n,;]+/)
      .map((item) => item.replace(/\s+/g, " ").trim())
      .filter(Boolean),
  )].slice(0, 26);
}

type SubmitOutcome = FunctionReturnType<
  typeof api.companyResearch.submitCompanies
>["outcomes"][number];

const OUTCOME_TONES: Record<SubmitOutcome["outcome"], string> = {
  queued: "bg-success",
  requeued: "bg-success",
  already_monitored: "bg-primary",
  duplicate: "bg-muted-foreground",
  rejected: "bg-destructive",
};

export function CompanyIntakeDialog() {
  const submitCompanies = useMutation(api.companyResearch.submitCompanies);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<SubmitOutcome[]>([]);
  const [error, setError] = useState<string | null>(null);
  const names = useMemo(() => parsedNames(text), [text]);
  const tooMany = names.length > 25;

  async function submit() {
    if (names.length === 0 || tooMany || submitting) return;
    setSubmitting(true);
    setError(null);
    setMessage(null);
    setOutcomes([]);
    try {
      const result = await submitCompanies({ names });
      setOutcomes(result.outcomes);
      // Nothing is starred on your behalf. A submitted company shows up in the
      // review list until it has a published figure; favourites stay yours.
      setMessage(
        result.queued > 0
          ? `${result.accepted} ${result.accepted === 1 ? "company" : "companies"} tracked · ${result.queued} queued for research. They sit in your review list until a figure is published.`
          : `${result.accepted} ${result.accepted === 1 ? "company is" : "companies are"} already tracked. Star the ones you want in Favourites.`,
      );
      setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Companies could not be queued.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            type="button"
            size="icon"
            aria-label="Add companies"
            title="Add companies"
            className="size-9 rounded-full"
          />
        }
      >
        <Plus size={16} weight="regular" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add companies</DialogTitle>
          <DialogDescription>
            Paste up to 25 names. EQ queues research and tracks them; star the
            ones you want in Favourites.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setMessage(null);
              setError(null);
            }}
            placeholder={"Stripe\nDatadog\nCloudflare"}
            className="min-h-36 resize-none text-sm leading-6"
            aria-label="Company names"
          />
          <div className="flex items-center justify-between gap-4 text-[10px] text-muted-foreground">
            <span>{names.length}/25 companies</span>
            <span>Names only · duplicates ignored</span>
          </div>

          {names.length > 0 && !tooMany && (
            <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto border-y border-foreground/10 py-3">
              {names.map((name) => (
                <span key={name} className="rounded-full bg-foreground/[0.05] px-2 py-1 text-[10px] font-medium">
                  {name}
                </span>
              ))}
            </div>
          )}

          {tooMany && (
            <p className="text-xs text-destructive">Keep each batch to 25 companies.</p>
          )}
          {error && <p className="text-xs leading-5 text-destructive">{error}</p>}
          {message && (
            <p className="flex items-center gap-2 text-xs font-medium text-success">
              <Check className="size-3.5" /> {message}
            </p>
          )}
          {outcomes.length > 0 && (
            <ul className="max-h-40 space-y-1.5 overflow-y-auto border-y border-foreground/10 py-3">
              {outcomes.map((outcome, index) => (
                <li
                  key={`${outcome.input}-${index}`}
                  className="flex items-start gap-2 text-[11px] leading-4"
                >
                  <span
                    className={`mt-1 size-1.5 shrink-0 rounded-full ${OUTCOME_TONES[outcome.outcome]}`}
                  />
                  <span className="min-w-0">
                    <span className="font-semibold text-foreground">
                      {outcome.canonicalName ?? outcome.input}
                    </span>
                    <span className="text-muted-foreground"> · {outcome.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={names.length === 0 || tooMany || submitting}
            onClick={submit}
          >
            <MagnifyingGlass className="size-4" weight="regular" />
            {submitting ? "Queueing research…" : "Queue research"}
          </Button>
          <p className="text-[10px] leading-4 text-muted-foreground">
            Discovery checks exact company-name variants against Greenhouse, Lever, and
            Ashby. Ambiguous matches stay unsupported rather than attaching the wrong employer.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
