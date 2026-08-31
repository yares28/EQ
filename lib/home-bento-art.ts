/**
 * Bento tile artwork.
 *
 * The previous version stacked five translucent layers per tile — blurred
 * mesh orbs, a sheen, a vignette, film grain, and a white overlay reaching 96%
 * at the bottom — over three different beiges, none of which matched the page.
 * The result read as a stain rather than as a graphic, and the brand green sat
 * under all of it at 9% opacity where it never showed.
 *
 * Nothing is blurred now. Each tile sits on one token surface and carries a
 * precise, low-contrast motif drawn on top of it.
 */

/** The tile's ground. Every value is a token from globals.css. */
export type BentoSurface = "paper" | "accent" | "secondary";

export type BentoArtVariant = "salary" | "compare" | "charts";

/** One measured company, for the only motif that draws real figures. */
export interface BentoArtBar {
  label: string;
  value: number;
}

export interface BentoTileArt {
  variant: BentoArtVariant;
  surface: BentoSurface;
  /**
   * Real ranked pay for the salary motif, on the same basis as the metric
   * beside it. A pay-shaped graphic drawn from invented proportions would be
   * exactly the decoration AGENTS.md forbids, so the bars are either the
   * measured figures or absent.
   */
  bars?: BentoArtBar[];
}

export const HOME_BENTO_ART = {
  salary: { variant: "salary", surface: "accent" },
  compare: { variant: "compare", surface: "paper" },
  charts: { variant: "charts", surface: "secondary" },
} as const satisfies Record<string, BentoTileArt>;
