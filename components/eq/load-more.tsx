"use client";

import { Button } from "@/components/ui/button";

/**
 * The footer for a paginated list.
 *
 * States what is on screen against what exists, so a truncated list never
 * passes as a complete one — the failure this app had repeatedly, where a
 * `.slice(0, 6)` read as "these are all of them".
 */
export function LoadMore({
  shown,
  noun,
  canLoadMore,
  isLoadingMore,
  isComplete,
  onLoadMore,
}: {
  shown: number;
  /** Plural noun for the rows, e.g. "companies", "roles", "changes". */
  noun: string;
  canLoadMore: boolean;
  isLoadingMore: boolean;
  /** True once every row has been fetched, so `shown` is the real total. */
  isComplete: boolean;
  onLoadMore: () => void;
}) {
  if (shown === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 pt-3">
      <p className="text-[11px] text-muted-foreground">
        {isComplete
          ? `${shown} ${noun}`
          : `${shown} ${noun} so far — more available`}
      </p>
      {canLoadMore && (
        <Button
          variant="outline"
          size="sm"
          onClick={onLoadMore}
          disabled={isLoadingMore}
        >
          {isLoadingMore ? "Loading…" : "Load more"}
        </Button>
      )}
    </div>
  );
}
