"use client";

import { useState } from "react";
import { useQuery } from "convex/react";

import { ArrowSquareOut } from "@/components/eq/icon";
import { MatchBreakdown } from "@/components/eq/match-breakdown";
import { SegmentedControl } from "@/components/eq/segmented-control";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TIER_LABELS, type MatchResult } from "@/lib/cv-match";
import { formatIsoDay } from "@/lib/format";
import { formatJobDescription } from "@/lib/job-description-format";

/**
 * What clicking a role used to do was hand the visit straight to the
 * employer's own domain — for Google that domain is literally google.com, and
 * leaving the app to land there read as a broken link rather than the correct
 * one. This shows what EQ actually knows about the posting first, and only
 * then offers to leave — and only when the role is still open, since a closed
 * posting's own page is usually already gone.
 */
export function RoleDetailDialog({
  role,
  companyName,
  match,
  trigger = "title",
  triggerLabel = "Open the posting",
}: {
  role: {
    postingId: Id<"jobPostings">;
    title: string;
    url: string;
    locations: string[];
    firstSeenAt: number;
    lastSeenAt: number;
    open: boolean;
    closedAt?: number;
  };
  companyName: string;
  /** Null when no CV is imported — the switch is not offered at all then. */
  match: MatchResult | null;
  /**
   * How the dialog is opened. The company list opens it from the role's own
   * title; the Scores page already shows the title in its row and opens it
   * from a button instead. The dialog itself is identical either way.
   */
  trigger?: "title" | "button";
  triggerLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [showMatch, setShowMatch] = useState(false);
  // Fetched only while the dialog is open, not from the role list this
  // component is rendered inside — see `postingDescription`'s own note on why.
  const detail = useQuery(
    api.companyResearch.postingDescription,
    open ? { postingId: role.postingId } : "skip",
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger === "button" ? (
        <DialogTrigger
          render={<Button type="button" variant="outline" size="sm" className="rounded-full" />}
        >
          {triggerLabel}
        </DialogTrigger>
      ) : (
        <DialogTrigger
          render={
            <button
              type="button"
              className={`min-w-0 text-left text-[13.5px] hover:text-primary hover:underline ${
                role.open ? "text-foreground" : "text-muted-foreground"
              }`}
            />
          }
        >
          {role.title}
        </DialogTrigger>
      )}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{role.title}</DialogTitle>
          <DialogDescription>{companyName}</DialogDescription>
        </DialogHeader>

        {match !== null && (
          <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl bg-secondary px-3 py-2">
            <div className="min-w-0">
              <p className="text-[12px] font-medium">Match against your CV</p>
              <p className="text-[11px] text-muted-foreground">
                {match.score === null
                  ? "This posting has no captured requirements"
                  : `${match.score} / 100 · ${TIER_LABELS[match.tier ?? "weak"]}`}
              </p>
            </div>
            <SegmentedControl<"posting" | "match">
              label="Show the posting or the match breakdown"
              layoutId={`role-view-${role.postingId}`}
              value={showMatch ? "match" : "posting"}
              onChange={(value) => setShowMatch(value === "match")}
              options={[
                { value: "posting", label: "Posting" },
                { value: "match", label: "Match" },
              ]}
            />
          </div>
        )}

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          {showMatch && match !== null ? (
            <MatchBreakdown match={match} />
          ) : (
          <>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-[10.5px] font-medium ${
                role.open
                  ? "bg-success/10 text-success"
                  : "bg-foreground/[0.06] text-muted-foreground"
              }`}
            >
              {role.open ? "Open" : "Closed"}
            </span>
            {role.locations.map((location) => (
              <span
                key={location}
                className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[10.5px] font-medium text-muted-foreground"
              >
                {location}
              </span>
            ))}
          </div>

          <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
            <div>
              <dt className="text-muted-foreground">First seen</dt>
              <dd className="mt-0.5 font-medium">
                {formatIsoDay(new Date(role.firstSeenAt).toISOString().slice(0, 10))}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{role.open ? "Last seen" : "Closed"}</dt>
              <dd className="mt-0.5 font-medium">
                {formatIsoDay(new Date(role.closedAt ?? role.lastSeenAt).toISOString().slice(0, 10))}
              </dd>
            </div>
          </dl>

          {detail?.salaryHighlight && (
            <div className="rounded-xl bg-eq-accent/[0.08] px-4 py-3 ring-1 ring-eq-accent/20">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-eq-accent">
                Salary stated in this posting
              </p>
              <p className="mt-1 text-[13px] leading-[1.5] text-foreground">
                {detail.salaryHighlight}
              </p>
            </div>
          )}

          <div className="border-t border-border pt-4">
            {detail === undefined ? (
              <p className="text-[12.5px] text-muted-foreground">Loading the posting…</p>
            ) : detail?.descriptionText ? (
              <div className="space-y-3">
                {formatJobDescription(detail.descriptionText).map((block, index) => (
                  <div key={index}>
                    {block.heading && (
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {block.heading}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap text-[12.5px] leading-[1.6] text-foreground">
                      {block.lines.join("\n")}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[12.5px] leading-[1.5] text-muted-foreground">
                EQ has not captured this posting&rsquo;s own text yet — only its
                title, location and status. The full description lives on the
                employer&rsquo;s own page.
              </p>
            )}
          </div>
          </>
          )}
        </div>

        {role.open && (
          <Button
            type="button"
            className="w-full shrink-0"
            nativeButton={false}
            render={<a href={role.url} target="_blank" rel="noreferrer" />}
          >
            <ArrowSquareOut className="size-4" weight="regular" />
            Open posting on {companyName}&rsquo;s site
          </Button>
        )}
        {!role.open && (
          <p className="shrink-0 text-[11.5px] leading-[1.5] text-muted-foreground">
            This posting is no longer listed on the employer&rsquo;s careers page,
            so its own page is usually gone too.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

