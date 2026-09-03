"use client";

import { ArrowLeft, ArrowRight } from "@/components/eq/icon";
import type { Page } from "@/lib/paginate";

/**
 * The footer for a client-paged list.
 *
 * Renders nothing for a list that fits on one page, so a short table is not
 * given controls that can never do anything.
 */
export function Pagination<T>({
  page,
  onPageChange,
  label,
  unit,
}: {
  page: Page<T>;
  onPageChange: (next: number) => void;
  /** Names the list for a screen reader: "Companies pagination". */
  label: string;
  /** What is being counted, for the range readout: "companies". */
  unit: string;
}) {
  if (page.pageCount <= 1) return null;
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/[0.07] px-4 py-3"
    >
      <p className="text-[11.5px] tabular text-muted-foreground">
        {page.from}–{page.to} of {page.total} {unit}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page.page - 1)}
          disabled={!page.hasPrevious}
          aria-label="Previous page"
          className="grid size-7 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowLeft className="size-[13px]" />
        </button>
        <p className="px-1 text-[11.5px] tabular text-muted-foreground">
          {page.page} / {page.pageCount}
        </p>
        <button
          type="button"
          onClick={() => onPageChange(page.page + 1)}
          disabled={!page.hasNext}
          aria-label="Next page"
          className="grid size-7 place-items-center rounded-full text-foreground/60 transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
        >
          <ArrowRight className="size-[13px]" />
        </button>
      </div>
    </nav>
  );
}
