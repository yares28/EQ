"use client";

import { usePaginatedQuery } from "convex/react";
import type { PaginatedQueryReference } from "convex/react";

/**
 * The pagination pattern for this app.
 *
 * Nothing in the codebase paginated before this: every list was `array.map()`
 * over a fully-materialized client array, and every query returned everything
 * it could find. That is fine at 15 companies and breaks quietly as the
 * catalog grows — a page renders a thousand rows, and the query that fed it
 * read a thousand rows on every tick of a reactive subscription.
 *
 * Use this for any list whose length is driven by data volume rather than by a
 * fixed design (a ranking table, a role list, a change feed, a history view).
 * Do not use it for a list with a known small ceiling, like the four columns of
 * the comparison matrix.
 *
 * The Convex side must expose a query taking `paginationOpts` and returning a
 * page plus `isDone` / `continueCursor` — see `convex/history.ts` for three
 * worked examples.
 *
 * ```tsx
 * const roles = usePaginatedList(api.history.hiringActivity, {}, 25);
 * // roles.results / roles.canLoadMore / roles.loadMore() / roles.isLoading
 * ```
 */
export function usePaginatedList<Query extends PaginatedQueryReference>(
  query: Query,
  args: Parameters<typeof usePaginatedQuery<Query>>[1],
  pageSize = 25,
) {
  const { results, status, loadMore, isLoading } = usePaginatedQuery(query, args, {
    initialNumItems: pageSize,
  });

  return {
    results,
    /** First load, before any page has arrived — render a skeleton, not "empty". */
    isLoadingFirstPage: status === "LoadingFirstPage",
    /** A further page is in flight; the existing rows stay on screen. */
    isLoadingMore: status === "LoadingMore",
    isLoading,
    canLoadMore: status === "CanLoadMore",
    /** Every row has been fetched — safe to state a total. */
    isComplete: status === "Exhausted",
    loadMore: () => loadMore(pageSize),
  };
}
