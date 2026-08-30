/** Abstract bento backgrounds — each variant maps to the destination’s meaning. */
export type BentoArtOverlay = "cream" | "accent" | "ink";

export type BentoArtVariant =
  | "salary"
  | "compare"
  | "updates"
  | "sourced"
  | "charts"
  | "evidence";

export interface BentoTileArt {
  variant: BentoArtVariant;
  overlay?: BentoArtOverlay;
}

export const HOME_BENTO_ART = {
  salary: { variant: "salary", overlay: "cream" },
  compare: { variant: "compare", overlay: "cream" },
  updates: { variant: "updates", overlay: "ink" },
  sourced: { variant: "sourced", overlay: "accent" },
  charts: { variant: "charts", overlay: "cream" },
  evidence: { variant: "evidence", overlay: "cream" },
} as const satisfies Record<string, BentoTileArt>;
