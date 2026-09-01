import Link from "next/link";
import type { ReactNode } from "react";

import { BentoArt } from "@/components/eq/bento-art";
import type { EqIconComponent } from "@/components/eq/icon";
import type { BentoSurface, BentoTileArt } from "@/lib/home-bento-art";
import { cn } from "@/lib/utils";

/**
 * Surfaces, straight from globals.css. There used to be a separate `tone` and
 * an `overlay`, and the art components each set a background of their own —
 * three beiges that were near-misses for the page colour and for each other.
 * One list, tokens only.
 */
const SURFACE_CLASS: Record<BentoSurface, string> = {
  paper:
    "bg-card text-card-foreground ring-1 ring-border/70 shadow-[0_1px_2px_rgb(26_25_23_/_4%)]",
  secondary:
    "bg-secondary text-secondary-foreground ring-1 ring-border/60 shadow-[0_1px_2px_rgb(26_25_23_/_4%)]",
  accent: "bg-eq-accent text-eq-accent-foreground shadow-[0_10px_34px_rgb(36_56_46_/_20%)]",
};

/** The call to action inverts against its ground. */
const CTA_CLASS: Record<BentoSurface, string> = {
  paper: "bg-foreground text-primary-foreground",
  secondary: "bg-foreground text-primary-foreground",
  accent: "bg-eq-accent-foreground text-eq-accent",
};

export function BentoTile({
  href,
  eyebrow,
  title,
  detail,
  metric,
  cta,
  icon: Icon,
  surface = "paper",
  density = "default",
  art,
  className,
}: {
  href: string;
  eyebrow?: string;
  title: string;
  detail?: string;
  metric?: string;
  cta?: string;
  icon?: EqIconComponent;
  surface?: BentoSurface;
  density?: "default" | "hub";
  art?: BentoTileArt;
  className?: string;
}) {
  const compact = density === "hub";
  const onAccent = surface === "accent";

  return (
    <Link
      href={href}
      className={cn(
        "eq-tile-hover group relative flex min-h-0 flex-col justify-between overflow-hidden rounded-[20px]",
        compact ? "p-4 sm:p-5 lg:p-6" : "rounded-[22px] p-7 sm:p-8",
        SURFACE_CLASS[surface],
        className
      )}
    >
      {art && <BentoArt variant={art.variant} surface={surface} bars={art.bars} />}

      <div className="relative z-10 flex shrink-0 items-start justify-between gap-3">
        {eyebrow ? (
          <p
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em] sm:text-[11px]",
              onAccent ? "text-inherit opacity-70" : "text-muted-foreground"
            )}
          >
            {eyebrow}
          </p>
        ) : (
          <span />
        )}
        {Icon && (
          <Icon
            size={compact ? 20 : 22}
            weight="light"
            className={cn(
              "shrink-0",
              onAccent ? "opacity-60" : "text-muted-foreground opacity-70"
            )}
          />
        )}
      </div>

      <div className={cn("relative z-10 mt-auto min-h-0", compact ? "pt-3 sm:pt-4" : "pt-8")}>
        {metric && (
          <p
            className={cn(
              "mb-1.5 font-semibold leading-none tabular tracking-tight sm:mb-2",
              compact
                ? "text-[clamp(1.75rem,3.2vw,2.75rem)]"
                : "text-[clamp(2.75rem,5vw,3.5rem)]"
            )}
          >
            {metric}
          </p>
        )}
        <p
          className={cn(
            "line-clamp-3 font-semibold leading-snug tracking-tight",
            compact
              ? metric
                ? "text-[13px] sm:text-sm"
                : "text-base sm:text-lg"
              : metric
                ? "text-[15px]"
                : "text-xl sm:text-[1.65rem]"
          )}
        >
          {title}
        </p>
        {detail && (
          <p
            className={cn(
              "mt-1.5 line-clamp-2 leading-snug sm:mt-2",
              compact ? "text-xs" : "text-sm leading-relaxed",
              onAccent ? "opacity-70" : "text-muted-foreground"
            )}
          >
            {detail}
          </p>
        )}
        {cta && (
          <span
            className={cn(
              "mt-3 inline-flex items-center rounded-full font-medium sm:mt-4",
              compact ? "h-8 px-4 text-xs sm:h-9 sm:px-5 sm:text-sm" : "mt-6 h-10 px-5 text-sm",
              CTA_CLASS[surface]
            )}
          >
            {cta}
          </span>
        )}
      </div>
    </Link>
  );
}

export function BentoShell({ children }: { children: ReactNode }) {
  return (
    <div className="box-border h-full overflow-hidden px-3 pb-3 pt-1 sm:px-5 sm:pb-4 lg:px-8">
      <div className="mx-auto h-full w-full max-w-[1240px]">{children}</div>
    </div>
  );
}
