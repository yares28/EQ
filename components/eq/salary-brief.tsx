"use client";

/**
 * The band at the top of the salary page.
 *
 * It replaces three metric tiles and a sentence of methodology. The subject and
 * the figure are the summary; the numbers under them carry the detail, so there
 * is no paragraph to read.
 *
 * Deliberately a band rather than a grid of tiles: it shares the overview's
 * surface (--eq-accent with a paper foreground) so the two pages read as one
 * product, while not looking like the same screen twice.
 *
 * Dumb on purpose — every string is computed by the page, which is the only
 * thing that knows what is actually supported.
 */

export interface SalaryBriefStat {
  label: string;
  value: string;
  /** Unit or qualifier, set smaller and quieter beside the value. */
  suffix?: string;
}

export function SalaryBrief({
  eyebrow,
  subject,
  clause,
  value,
  valueCaption,
  stats,
}: {
  eyebrow: string;
  /** The leading company, or null when nothing here is supported. */
  subject: string | null;
  clause: string;
  value: string;
  valueCaption: string;
  stats: SalaryBriefStat[];
}) {
  return (
    <section className="mb-7 rounded-[20px] bg-eq-accent px-6 py-7 text-eq-accent-foreground shadow-[0_10px_34px_rgb(36_56_46_/_18%)] sm:px-9 sm:py-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.12em] opacity-60">
        {eyebrow}
      </p>

      <div className="mt-4 flex flex-col gap-4 sm:mt-5 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
        <div className="min-w-0">
          <p className="text-[clamp(1.5rem,3.4vw,2.125rem)] font-semibold leading-[1.05] tracking-[-0.028em]">
            {subject ?? "Nothing published here yet"}
          </p>
          <p className="mt-2 text-sm leading-normal opacity-70">{clause}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-[clamp(2.5rem,5.2vw,3.75rem)] font-semibold leading-[0.95] tracking-[-0.035em] tabular">
            {value}
          </p>
          <p className="mt-2 text-xs opacity-60">{valueCaption}</p>
        </div>
      </div>

      {stats.length > 0 && (
        <dl className="mt-7 grid grid-cols-2 gap-x-0 gap-y-5 border-t border-eq-accent-foreground/[0.16] pt-5 sm:grid-cols-3 lg:flex lg:gap-y-0">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className={
                // Hairlines between columns, never before the first in a row.
                index === 0
                  ? "min-w-0 lg:flex-1 lg:pr-5"
                  : "min-w-0 pl-5 [&:nth-child(odd)]:pl-0 sm:[&:nth-child(odd)]:pl-5 sm:[&:nth-child(3n+1)]:pl-0 lg:flex-1 lg:border-l lg:border-eq-accent-foreground/[0.14] lg:pl-5 lg:[&:nth-child(odd)]:pl-5"
              }
            >
              <dt className="text-[10px] font-medium uppercase tracking-[0.09em] opacity-55">
                {stat.label}
              </dt>
              <dd className="mt-1.5 truncate text-xl font-semibold tracking-[-0.018em] tabular">
                {stat.value}
                {stat.suffix && (
                  <span className="text-xs font-normal opacity-60">{stat.suffix}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
