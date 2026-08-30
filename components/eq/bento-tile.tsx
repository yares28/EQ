import Link from "next/link";
import type { ReactNode } from "react";

import { BentoArt } from "@/components/eq/bento-art";
import type { EqIconComponent } from "@/components/eq/icon";
import type { BentoArtOverlay, BentoTileArt } from "@/lib/home-bento-art";
import { cn } from "@/lib/utils";

type BentoTone = "cream" | "accent" | "ink";

const TONE_CLASS: Record<BentoTone, string> = {
  cream: "bg-card text-card-foreground ring-1 ring-border/70 shadow-[0_1px_2px_rgb(26_25_23_/_4%)]",
  accent: "bg-eq-accent text-eq-accent-foreground shadow-[0_1px_2px_rgb(36_56_46_/_12%)]",
  ink: "bg-foreground text-primary-foreground shadow-[0_1px_2px_rgb(26_25_23_/_10%)]",
};

const OVERLAY_CLASS: Record<BentoArtOverlay, string> = {
  cream:
    "bg-[linear-gradient(to_bottom,transparent_0%,rgb(255_255_255_/_8%)_28%,rgb(255_255_255_/_62%)_58%,rgb(255_255_255_/_96%)_100%)]",
  accent:
    "bg-[linear-gradient(to_bottom,transparent_0%,rgb(36_56_46_/_12%)_30%,rgb(36_56_46_/_68%)_62%,rgb(36_56_46_/_94%)_100%)]",
  ink:
    "bg-[linear-gradient(to_bottom,transparent_0%,rgb(26_25_23_/_10%)_32%,rgb(26_25_23_/_62%)_60%,rgb(26_25_23_/_92%)_100%)]",
};

export function BentoTile({
  href,
  eyebrow,
  title,
  detail,
  metric,
  cta,
  icon: Icon,
  tone = "cream",
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
  tone?: BentoTone;
  density?: "default" | "hub";
  art?: BentoTileArt;
  className?: string;
}) {
  const compact = density === "hub";
  const hasArt = art !== undefined;
  const overlay = art?.overlay ?? tone;

  return (
    <Link
      href={href}
      className={cn(
        "eq-tile-hover group relative flex min-h-0 flex-col justify-between overflow-hidden rounded-[20px]",
        compact ? "p-4 sm:p-5 lg:p-6" : "rounded-[22px] p-7 sm:p-8",
        !hasArt && TONE_CLASS[tone],
        hasArt && "ring-1 ring-black/[0.05] shadow-[0_1px_0_rgb(255_255_255_/_55%)_inset,0_8px_28px_rgb(26_25_23_/_9%)]",
        hasArt && overlay === "ink" && "text-primary-foreground",
        hasArt && overlay === "accent" && "text-eq-accent-foreground",
        hasArt && overlay === "cream" && "text-foreground",
        className
      )}
    >
      {hasArt && (
        <div className="pointer-events-none absolute inset-0">
          <BentoArt variant={art.variant} />
          <div
            className={cn(
              "absolute inset-0 transition-opacity duration-300",
              OVERLAY_CLASS[overlay]
            )}
          />
        </div>
      )}

      <div className="relative z-10 flex shrink-0 items-start justify-between gap-3">
        {eyebrow ? (
          <p
            className={cn(
              "text-[10px] font-medium uppercase tracking-[0.12em] sm:text-[11px]",
              hasArt || tone !== "cream" ? "text-inherit opacity-75" : "text-muted-foreground"
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
              "shrink-0 opacity-60",
              !hasArt && tone === "cream" && "text-muted-foreground"
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
              hasArt || tone !== "cream" ? "opacity-80" : "text-muted-foreground"
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
              tone === "cream" || hasArt
                ? "bg-foreground text-primary-foreground"
                : "bg-primary-foreground/12 text-inherit ring-1 ring-inset ring-current/15"
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
