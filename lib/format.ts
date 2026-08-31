import { formatEuro } from "./salary-analytics.ts";

/**
 * Shared display formatters.
 *
 * These exist because the same three mistakes kept being made independently on
 * each page: a hardcoded "+" in front of a value that can be negative (which
 * renders "+-8%"), a count interpolated straight into a plural noun ("1
 * companies"), and a non-finite number reaching the DOM as "Infinity" or "NaN".
 * Every one of those was a real defect found in this app, so the guard belongs
 * in one place rather than at each call site.
 */

/**
 * A signed bare number with its own unit appended. Distinct from
 * `signedPercent` because a *difference* between two percentages is measured in
 * percentage points, not percent — "+21% pp" is two units on one number.
 */
export function signedNumber(value: number | null, unit = ""): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value}${unit}`;
}

/** A percentage that carries its own sign. Never prefix this with "+". */
export function signedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value}%`;
}

/**
 * A euro figure that reads as a shortfall when it is one. `formatEuro` puts the
 * minus inside the amount — "€-340" — which scans as a typo rather than as a
 * negative number, so the sign goes in front of the symbol here.
 */
export function euroOrDash(value: number | null, compact = true): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value < 0 ? `-${formatEuro(Math.abs(value), compact)}` : formatEuro(value, compact);
}

/** A euro delta that carries its own sign, negatives included. */
export function signedEuro(value: number | null, compact = true): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return value > 0 ? `+${formatEuro(value, compact)}` : euroOrDash(value, compact);
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/**
 * `new Date(NaN).toISOString()` throws a RangeError, which is how an
 * unparseable timestamp took a whole page down rather than rendering a dash.
 */
export function formatDayFromTimestamp(timestamp: number | null | undefined): string {
  if (timestamp === null || timestamp === undefined || !Number.isFinite(timestamp)) {
    return "—";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(timestamp));
}

/** An ISO `YYYY-MM-DD` research date, or a dash when it is not one. */
export function formatIsoDay(date: string | null | undefined): string {
  if (typeof date !== "string") return "—";
  return formatDayFromTimestamp(Date.parse(`${date}T00:00:00Z`));
}

/**
 * Division that yields null instead of Infinity or NaN. Every "Infinity%" in
 * this app came from a denominator that was legitimately zero or missing.
 */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null;
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null;
  if (denominator === 0) return null;
  return numerator / denominator;
}
