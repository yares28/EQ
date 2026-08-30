import type { Eligibility, Rung, WorkMode } from "@/lib/types";
import { TIER_STYLES, tierOf } from "@/lib/score";
import {
  Binoculars,
  Buildings,
  FileText,
  House,
  Laptop,
  SealCheck,
  ShieldSlash,
  ShieldWarning,
  type EqIconComponent,
} from "@/components/eq/icon";

export function Chip({
  icon: Icon,
  children,
  tone = "neutral",
  className = "",
}: {
  icon?: EqIconComponent;
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warn" | "danger";
  className?: string;
}) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground ring-border",
    accent: "bg-primary/10 text-primary ring-primary/20",
    success: "bg-success/10 text-success ring-success/20",
    warn: "bg-warning/10 text-warning ring-warning/20",
    danger: "bg-destructive/10 text-destructive ring-destructive/20",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-medium ring-1 ${tones[tone]} ${className}`}
    >
      {Icon && <Icon className="size-3.5 shrink-0" weight="regular" />}
      {children}
    </span>
  );
}

const RUNG_META: Record<Rung, { label: string; icon: EqIconComponent }> = {
  stub: { label: "stub", icon: FileText },
  researched: { label: "researched", icon: Binoculars },
  deepdived: { label: "deep-dived", icon: SealCheck },
};

export function RungBadge({ rung }: { rung: Rung }) {
  const meta = RUNG_META[rung];
  return (
    <Chip icon={meta.icon} tone="neutral">
      {meta.label}
    </Chip>
  );
}

export function TierBadge({
  value,
  band,
  className = "",
}: {
  value: number;
  band: number;
  className?: string;
}) {
  const tier = tierOf(value, band);
  const s = TIER_STYLES[tier];
  return (
    <span
      className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[11px] font-semibold ring-1 ${s.text} ${s.bg} ${s.ring} ${className}`}
    >
      {s.label}
    </span>
  );
}

export function WorkModeChip({ mode }: { mode: WorkMode }) {
  if (mode === "remote") return <Chip icon={Laptop}>Remote</Chip>;
  if (mode === "hybrid") return <Chip icon={House}>Hybrid</Chip>;
  if (mode === "on-site") return <Chip icon={Buildings}>On-site</Chip>;
  return null;
}

export function EligibilityBadge({ eligibility }: { eligibility: Eligibility }) {
  if (eligibility.state === "check")
    return (
      <Chip icon={ShieldWarning} tone="warn">
        check eligibility
      </Chip>
    );
  if (eligibility.state === "ineligible")
    return (
      <Chip icon={ShieldSlash} tone="danger">
        ineligible
      </Chip>
    );
  return null;
}
