"use client";

/**
 * The band at the top of the salary and compare pages.
 *
 * It leads with a podium rather than a single winner, because "why this
 * company" should be visible rather than asserted: the order is whatever the
 * page is ranked by, and the controls directly underneath decide it. Change
 * the level, the location, or what it is ranked on, and the podium reorders.
 *
 * First place is a different KIND of object, not a bigger version of the same
 * one. It inverts to paper — the only light surface in the band — takes about
 * half the width, and carries a figure roughly three times the size of
 * anything else, while the rest collapse into slim rows that shade out as they
 * descend. Four signals agreeing is what makes the order legible before you
 * read a word; four cards at four sizes was not enough.
 *
 * The strip beneath is where the two pages diverge. Salary passes the leader's
 * own figures — a ranking already has an order, so repeating it per measure
 * would be noise. Compare passes an `ordinal` on each stat, following the
 * leader across every measure, which is what a comparison is actually for: the
 * leader is rarely the leader on all of them.
 *
 * Dumb on purpose — every string is computed by the page, which is the only
 * thing that knows what is supported.
 */

export interface PodiumEntry {
  slug: string;
  name: string;
  /** The ranked figure, already formatted. */
  value: string;
  /** "total pay a year · L3 · Madrid" for the leader; "−€17.9k" after. */
  detail?: string;
}

export interface BandStat {
  label: string;
  value: string;
  /** Unit or qualifier, set smaller beside the value. */
  suffix?: string;
  /** "1st", "2nd" — this measure's standing. Omit where nothing can be ranked. */
  ordinal?: string;
  /** Why there is no ordinal. Shown in its place, never beside it. */
  note?: string;
}

/** How far each chasing row recedes. Past the fourth they share the faintest. */
const PACK_FILL = [
  "bg-eq-accent-foreground/[0.13]",
  "bg-eq-accent-foreground/[0.085]",
  "bg-eq-accent-foreground/[0.045]",
];

export function PodiumBand({
  eyebrow,
  rankedOn,
  podium,
  emptyMessage,
  statsLabel,
  stats,
  footer,
}: {
  eyebrow: string;
  /** What the order is by, stated so the podium is never a mystery. */
  rankedOn: string;
  podium: PodiumEntry[];
  /** Shown instead of the podium when nothing here can be ranked. */
  emptyMessage: string;
  statsLabel: string;
  stats: BandStat[];
  footer?: React.ReactNode;
}) {
  const [leader, ...pack] = podium;

  return (
    <section className="mb-7 rounded-[20px] bg-eq-accent px-6 py-7 text-eq-accent-foreground shadow-[0_10px_34px_rgb(36_56_46_/_18%)] sm:px-9 sm:py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-60">
          {eyebrow}
        </p>
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-60">
          {rankedOn}
        </p>
      </div>

      {leader === undefined ? (
        <p className="mt-5 max-w-2xl text-lg leading-normal opacity-80">{emptyMessage}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
          {/* The winner. Inverted, so it reads as lit rather than merely large. */}
          <div className="min-w-0 rounded-[18px] bg-eq-accent-foreground px-6 py-6 text-eq-accent shadow-[0_12px_32px_rgb(12_20_16_/_30%)] sm:flex-[1.1]">
            <div className="flex items-center gap-2.5">
              <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-eq-accent text-[11px] font-bold text-eq-accent-foreground">
                1
              </span>
              <p className="min-w-0 truncate text-[clamp(1.35rem,2.7vw,1.8rem)] font-semibold tracking-[-0.026em]">
                {leader.name}
              </p>
            </div>
            <p className="mt-4 text-[clamp(2.5rem,5.4vw,3.5rem)] font-semibold leading-[0.9] tracking-[-0.037em] tabular">
              {leader.value}
            </p>
            {leader.detail && (
              <p className="mt-3 text-xs text-eq-accent/60">{leader.detail}</p>
            )}
          </div>

          {/* The chasing pack, one slim row each. */}
          {pack.length > 0 && (
            <ol className="flex min-w-0 flex-col gap-2 sm:flex-1">
              {pack.map((entry, index) => (
                <li
                  key={entry.slug}
                  className={`flex min-w-0 flex-1 items-center gap-3 rounded-[13px] px-4 py-3 ${
                    PACK_FILL[index] ?? PACK_FILL[PACK_FILL.length - 1]
                  }`}
                >
                  <span
                    className="grid size-[19px] shrink-0 place-items-center rounded-full bg-eq-accent-foreground/25 text-[10.5px] font-bold"
                    style={{ opacity: Math.max(1 - index * 0.12, 0.6) }}
                  >
                    {index + 2}
                  </span>
                  <p
                    className="min-w-0 flex-1 truncate text-[16.5px] font-semibold tracking-[-0.014em]"
                    style={{ opacity: Math.max(1 - index * 0.1, 0.7) }}
                  >
                    {entry.name}
                  </p>
                  <span className="shrink-0 text-right">
                    <span
                      className="block text-[21px] font-semibold leading-none tracking-[-0.022em] tabular"
                      style={{ opacity: Math.max(1 - index * 0.1, 0.7) }}
                    >
                      {entry.value}
                    </span>
                    {entry.detail && (
                      <span
                        className="mt-1 block text-[11px]"
                        style={{ opacity: Math.max(0.5 - index * 0.05, 0.35) }}
                      >
                        {entry.detail}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {stats.length > 0 && (
        <>
          <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.09em] opacity-50">
            {statsLabel}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-0 gap-y-5 border-t border-eq-accent-foreground/[0.16] pt-4 sm:grid-cols-3 lg:flex lg:gap-y-0">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={
                  index === 0
                    ? "min-w-0 lg:flex-1 lg:pr-4"
                    : "min-w-0 pl-4 [&:nth-child(odd)]:pl-0 sm:[&:nth-child(odd)]:pl-4 sm:[&:nth-child(3n+1)]:pl-0 lg:flex-1 lg:border-l lg:border-eq-accent-foreground/[0.14] lg:pl-4 lg:[&:nth-child(odd)]:pl-4"
                }
              >
                <dt className="text-[10px] font-medium uppercase tracking-[0.09em] opacity-55">
                  {stat.label}
                </dt>
                <dd className="mt-2 flex items-end justify-between gap-2">
                  <span className="min-w-0 truncate text-[19px] font-semibold tracking-[-0.018em] tabular">
                    {stat.value}
                    {stat.suffix && (
                      <span className="text-[11.5px] font-normal opacity-60">{stat.suffix}</span>
                    )}
                  </span>
                  {stat.ordinal ? (
                    <span className="shrink-0 text-base font-semibold leading-[1.15] tabular opacity-60">
                      {stat.ordinal}
                    </span>
                  ) : stat.note ? (
                    <span className="shrink-0 text-right text-[11.5px] leading-[1.3] opacity-50">
                      {stat.note}
                    </span>
                  ) : null}
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}

      {footer}
    </section>
  );
}
