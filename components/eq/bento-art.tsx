import type { BentoArtBar, BentoArtVariant, BentoSurface } from "@/lib/home-bento-art";

/**
 * Tile motifs: precise geometry on a solid token surface.
 *
 * No blur filters, no mesh orbs, no grain, no sheen, no vignette. The old
 * versions of those layers are what made the page look smudged; a motif that
 * needs a white wash over it to be tolerable is a motif that should not be
 * there.
 *
 * Colour comes from the surface the tile sits on, so ink-on-paper and
 * paper-on-green are the same drawing with the two roles swapped.
 */

/** Bottle green, ink and paper — --eq-accent, --foreground, --background. */
const ACCENT = "#24382e";
const INK = "#1a1917";
const PAPER = "#f6f4f1";

interface Palette {
  /** The mark that carries meaning: the leader, the trend line. */
  lead: string;
  /** Everything the lead is measured against. */
  rest: string;
  /** Hairlines. */
  rule: string;
  /** The one rule that reads as a baseline. */
  baseline: string;
}

function paletteFor(surface: BentoSurface): Palette {
  if (surface === "accent") {
    return {
      lead: `${PAPER}ea`,
      rest: `${PAPER}2b`,
      rule: `${PAPER}1a`,
      baseline: `${PAPER}4d`,
    };
  }
  // On paper and on --secondary the accent is legible at full strength, so it
  // carries the lead mark instead of being a tint nobody can see.
  return {
    lead: ACCENT,
    rest: `${INK}14`,
    rule: `${INK}0d`,
    baseline: `${INK}22`,
  };
}

/** Ranked pay, drawn true to scale. Absent when there is nothing measured. */
function SalaryArt({ surface, bars }: { surface: BentoSurface; bars: BentoArtBar[] }) {
  const shown = bars.filter((bar) => Number.isFinite(bar.value) && bar.value > 0).slice(0, 4);
  if (shown.length < 2) return null;

  const palette = paletteFor(surface);
  const peak = Math.max(...shown.map((bar) => bar.value));

  return (
    // Shown at every width: the hero spans two grid rows, so even on a phone it
    // is tall enough to carry the motif without crowding the metric block.
    <div className="pointer-events-none absolute inset-x-4 top-[19%] h-[42%] sm:inset-x-5 sm:h-[48%] lg:inset-x-6">
      <div className="relative ml-auto h-full w-full max-w-[520px] sm:w-[64%]">
        {[0, 33.33, 66.66].map((offset) => (
          <span
            key={offset}
            aria-hidden
            className="absolute inset-x-0 h-px"
            style={{ top: `${offset}%`, background: palette.rule }}
          />
        ))}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-px"
          style={{ background: palette.baseline }}
        />
        <div className="flex h-full items-end gap-[5%]">
          {shown.map((bar, index) => (
            <div
              key={bar.label}
              className="flex h-full min-w-0 flex-1 items-end"
              style={{ height: `${Math.max((bar.value / peak) * 100, 6)}%` }}
            >
              <span
                aria-hidden
                className="block h-full w-full rounded-[3px]"
                style={{ background: index === 0 ? palette.lead : palette.rest }}
              />
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-[5%]">
          {shown.map((bar, index) => (
            <p
              key={bar.label}
              className="min-w-0 flex-1 truncate text-[10px] leading-4"
              style={{
                fontWeight: index === 0 ? 600 : 400,
                opacity: index === 0 ? 1 : 0.6,
              }}
            >
              {bar.label}
            </p>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Best-in-row across two columns — the shape of the comparison matrix itself.
 *
 * Every cell is the same size, so the motif carries no magnitudes. Differing
 * bar lengths here would read as a pay comparison that no figure backs, and a
 * card silhouette with lines in it just reads as a loading skeleton.
 */
const COMPARE_WINNERS = [0, 1, 0] as const;

function CompareArt({ surface }: { surface: BentoSurface }) {
  const palette = paletteFor(surface);

  return (
    <div className="pointer-events-none absolute inset-x-4 top-[27%] hidden h-[30%] sm:inset-x-5 sm:block lg:inset-x-6">
      <div className="relative flex h-full max-w-[400px] flex-col justify-between">
        {COMPARE_WINNERS.map((winner, row) => (
          <div key={row} className="flex items-center gap-6">
            {[0, 1].map((column) => (
              <span
                key={column}
                aria-hidden
                className="block h-2 flex-1 rounded-full"
                style={{ background: column === winner ? palette.lead : palette.rest }}
              />
            ))}
          </div>
        ))}
        <span
          aria-hidden
          className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2"
          style={{ background: palette.rule }}
        />
      </div>
    </div>
  );
}

/** A schematic rise — iconography for the charts page, not a measurement. */
function ChartsArt({ surface }: { surface: BentoSurface }) {
  const palette = paletteFor(surface);

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-[34%] top-[26%] sm:inset-x-5 lg:inset-x-6">
      <div className="relative h-full w-full">
        {[0, 50, 100].map((offset) => (
          <span
            key={offset}
            aria-hidden
            className="absolute inset-x-0 h-px"
            style={{ top: `${offset}%`, background: palette.rule }}
          />
        ))}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
          <path
            d="M2 88 C18 80 26 58 42 50 C58 42 66 24 82 16 C88 13 94 9 98 6"
            fill="none"
            stroke={palette.lead}
            strokeWidth="1"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            style={{ strokeWidth: 2 }}
          />
        </svg>
      </div>
    </div>
  );
}

export function BentoArt({
  variant,
  surface,
  bars,
}: {
  variant: BentoArtVariant;
  surface: BentoSurface;
  bars?: BentoArtBar[];
}) {
  if (variant === "salary") return <SalaryArt surface={surface} bars={bars ?? []} />;
  if (variant === "compare") return <CompareArt surface={surface} />;
  return <ChartsArt surface={surface} />;
}
