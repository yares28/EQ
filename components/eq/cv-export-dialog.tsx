"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { toast } from "sonner";

import { Copy } from "@/components/eq/icon";
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
import { applyRewrittenBullets, diffCvBullets, renderCvLatex } from "@/lib/cv-latex";
import type { ParsedCv } from "@/lib/cv-parse";

type View = "changes" | "preview" | "latex";

/**
 * The rewritten CV: what changed, how it reads, and the LaTeX to paste into
 * Overleaf.
 *
 * The changes view is first on purpose. The whole risk of a rewrite is a claim
 * creeping in that the original did not support, and a before/after list of
 * every touched bullet is what makes that visible — so it is what you see
 * before the polished version, not after it.
 */
export function CvExportDialog({
  postingId,
  postingTitle,
}: {
  postingId: Id<"jobPostings">;
  postingTitle: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("changes");
  const profile = useQuery(api.profile.get, open ? {} : "skip");
  const rewrite = useQuery(api.cvRewrite.rewriteForPosting, open ? { postingId } : "skip");

  const built = useMemo(() => {
    const original = profile?.cvStructured as ParsedCv | undefined;
    if (original === undefined || rewrite === undefined || rewrite === null) return null;
    try {
      const rewritten = applyRewrittenBullets(original, rewrite.replacements);
      return {
        original,
        rewritten,
        changes: diffCvBullets(original, rewritten),
        latex: renderCvLatex(rewritten),
      };
    } catch {
      // A rewrite whose positions no longer fit the CV on file — the version
      // guard should prevent this, so surfacing it beats rendering nonsense.
      return null;
    }
  }, [profile, rewrite]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button type="button" variant="outline" size="sm" className="rounded-full" />}
      >
        Tailored CV
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>CV tailored for this role</DialogTitle>
          <DialogDescription>{postingTitle}</DialogDescription>
        </DialogHeader>

        {rewrite === undefined ? (
          <p className="text-[12.5px] text-muted-foreground">Loading…</p>
        ) : rewrite === null || built === null ? (
          <div className="rounded-xl bg-secondary px-4 py-6 text-center">
            <p className="text-[13px] font-medium">No tailored version yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-[1.5] text-muted-foreground">
              Ask Claude Code to write one: run <code className="font-medium">/process</code> and
              say which role. It rewords bullets you already have so this
              posting&rsquo;s own requirements are easier to see — it never adds
              experience you do not have.
            </p>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center justify-between gap-3">
              <SegmentedControl<View>
                label="What to show"
                layoutId={`cv-export-${postingId}`}
                value={view}
                onChange={setView}
                options={[
                  { value: "changes", label: "Changes", count: built.changes.length },
                  { value: "preview", label: "Preview" },
                  { value: "latex", label: "LaTeX" },
                ]}
              />
              {view === "latex" && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 rounded-full"
                  onClick={() => {
                    void navigator.clipboard.writeText(built.latex);
                    toast.success("Copied — paste it into Overleaf");
                  }}
                >
                  <Copy className="size-3.5" /> Copy
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {view === "changes" && (
                built.changes.length === 0 ? (
                  <p className="text-[12.5px] text-muted-foreground">
                    This rewrite changed no wording.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {rewrite.rationale && (
                      <p className="rounded-xl bg-eq-accent/[0.08] px-3 py-2 text-[12px] leading-[1.5] ring-1 ring-eq-accent/20">
                        {rewrite.rationale}
                      </p>
                    )}
                    {built.changes.map((change, index) => (
                      <div key={index}>
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {change.section} · {change.entry}
                        </p>
                        <p className="mt-1.5 rounded-lg bg-destructive/[0.06] px-3 py-2 text-[12px] leading-[1.5] text-muted-foreground line-through decoration-destructive/40">
                          {change.before}
                        </p>
                        <p className="mt-1 rounded-lg bg-success/[0.07] px-3 py-2 text-[12px] leading-[1.5]">
                          {change.after}
                        </p>
                      </div>
                    ))}
                  </div>
                )
              )}

              {view === "preview" && (
                <div className="space-y-4">
                  <div className="text-center">
                    <p className="text-xl font-semibold tracking-tight">{built.rewritten.name}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      {built.rewritten.contactLine}
                    </p>
                  </div>
                  {built.rewritten.sections.map((section) => (
                    <div key={section.heading}>
                      <p className="border-b border-foreground/20 pb-0.5 text-[12px] font-semibold uppercase tracking-wide">
                        {section.heading}
                      </p>
                      {section.entries.map((entry, entryIndex) => (
                        <div key={entryIndex} className="mt-2">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="text-[12.5px] font-semibold">{entry.title}</p>
                            <p className="shrink-0 text-[11px] italic text-muted-foreground">
                              {entry.meta}
                            </p>
                          </div>
                          {entry.subtitle && (
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="text-[11.5px] italic text-muted-foreground">
                                {entry.subtitle}
                              </p>
                              <p className="shrink-0 text-[11px] italic text-muted-foreground">
                                {entry.subtitleMeta}
                              </p>
                            </div>
                          )}
                          <ul className="mt-1 list-disc space-y-0.5 pl-5">
                            {entry.bullets.map((bullet, bulletIndex) => (
                              <li key={bulletIndex} className="text-[11.5px] leading-[1.5]">
                                {bullet.text}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                      {section.looseLines.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {section.looseLines.map((line, lineIndex) => (
                            <li key={lineIndex} className="text-[11.5px] leading-[1.5]">
                              {line}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {view === "latex" && (
                <pre className="overflow-x-auto rounded-xl bg-secondary p-3 text-[11px] leading-[1.45]">
                  <code>{built.latex}</code>
                </pre>
              )}
            </div>

            {view === "latex" && (
              <p className="shrink-0 text-[11px] leading-4 text-muted-foreground">
                Paste this into a blank Overleaf project and compile. It carries
                its own preamble, so nothing else is needed.
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
