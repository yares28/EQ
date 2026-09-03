/**
 * Paging an array the client already holds.
 *
 * Distinct from `usePaginatedList`, which pages a Convex query so the server
 * never reads rows nobody asked for. This one is for a list that is already
 * fully materialized and derived — the salary ranking sorts, filters and
 * scopes every tracked company in the browser, so there is nothing to fetch a
 * page of; the only question is how many rows to put on screen at once.
 *
 * `page` is clamped rather than validated, so a caller whose list shrank under
 * it (a filter narrowed, a company dropped out) lands on the last page instead
 * of rendering nothing.
 */
export interface Page<T> {
  items: T[];
  /** 1-based, clamped into range. */
  page: number;
  pageCount: number;
  /** 1-based index of the first and last item shown, for "21–40 of 371". */
  from: number;
  to: number;
  total: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function paginate<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const size = Math.max(1, Math.floor(pageSize));
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const shown = items.slice(start, start + size);
  return {
    items: [...shown],
    page: current,
    pageCount,
    // An empty list has nothing to number, and "1–0 of 0" reads as a bug.
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + shown.length,
    total,
    hasPrevious: current > 1,
    hasNext: current < pageCount,
  };
}
