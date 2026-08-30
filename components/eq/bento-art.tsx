import type { JSX } from "react";

import type { BentoArtVariant } from "@/lib/home-bento-art";
import { cn } from "@/lib/utils";

const MOTION =
  "pointer-events-none absolute inset-0 overflow-hidden transition-transform duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.025]";

function ArtDefs() {
  return (
    <defs>
      <filter id="eq-bento-blur" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="32" />
      </filter>
      <filter id="eq-bento-soft" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" />
      </filter>
      <linearGradient id="eq-chart-line" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#24382e" stopOpacity="0.08" />
        <stop offset="100%" stopColor="#24382e" stopOpacity="0.62" />
      </linearGradient>
      <radialGradient id="eq-glow-light" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
        <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="eq-glow-gold" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#e8d4b8" stopOpacity="0.85" />
        <stop offset="100%" stopColor="#e8d4b8" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}

function MeshOrbs({
  orbs,
}: {
  orbs: Array<{ cx: string; cy: string; r: string; color: string; opacity?: number }>;
}) {
  return (
    <g filter="url(#eq-bento-blur)">
      {orbs.map((orb) => (
        <circle
          key={`${orb.cx}-${orb.cy}`}
          cx={orb.cx}
          cy={orb.cy}
          r={orb.r}
          fill={orb.color}
          fillOpacity={orb.opacity ?? 0.55}
        />
      ))}
    </g>
  );
}

function ArtGrain({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 opacity-[0.38] mix-blend-soft-light",
        className
      )}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        backgroundSize: "120px 120px",
      }}
    />
  );
}

function ArtSheen({ angle = "135deg" }: { angle?: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: `linear-gradient(${angle}, rgb(255 255 255 / 26%) 0%, transparent 38%, transparent 100%)`,
      }}
    />
  );
}

function ArtVignette({ tone = "light" }: { tone?: "light" | "dark" }) {
  const edge = tone === "dark" ? "rgb(0 0 0 / 18%)" : "rgb(26 25 23 / 6%)";
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0"
      style={{
        background: `radial-gradient(ellipse 90% 85% at 50% 40%, transparent 55%, ${edge} 100%)`,
      }}
    />
  );
}

function SalaryArt() {
  return (
    <div className={MOTION} style={{ background: "#f2ece4" }}>
      <svg viewBox="0 0 640 480" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <ArtDefs />
        <MeshOrbs
          orbs={[
            { cx: "72%", cy: "22%", r: "52%", color: "#e8d4b8", opacity: 0.82 },
            { cx: "28%", cy: "68%", r: "44%", color: "#24382e", opacity: 0.09 },
            { cx: "48%", cy: "38%", r: "32%", color: "#ffffff", opacity: 0.55 },
            { cx: "88%", cy: "72%", r: "28%", color: "#c4a574", opacity: 0.22 },
          ]}
        />
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1="48"
            y1={128 + i * 52}
            x2="592"
            y2={128 + i * 52}
            stroke="#1a1917"
            strokeOpacity={0.035 + i * 0.008}
            strokeWidth="1"
          />
        ))}
        <circle cx="468" cy="118" r="56" fill="url(#eq-glow-gold)" filter="url(#eq-bento-soft)" />
      </svg>
      <ArtSheen angle="120deg" />
      <ArtVignette />
      <ArtGrain />
    </div>
  );
}

function CompareArt() {
  return (
    <div className={MOTION} style={{ background: "#f0ebe4" }}>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <ArtDefs />
        <MeshOrbs
          orbs={[
            { cx: "26%", cy: "32%", r: "46%", color: "#e8dfd4", opacity: 0.95 },
            { cx: "74%", cy: "32%", r: "46%", color: "#24382e", opacity: 0.14 },
            { cx: "50%", cy: "78%", r: "34%", color: "#ffffff", opacity: 0.35 },
          ]}
        />
        <line x1="200" y1="64" x2="200" y2="336" stroke="#1a1917" strokeOpacity="0.05" strokeWidth="1" />
      </svg>
      <ArtSheen angle="90deg" />
      <ArtVignette />
      <ArtGrain />
    </div>
  );
}

function UpdatesArt() {
  return (
    <div
      className={MOTION}
      style={{
        background:
          "radial-gradient(circle at 78% 14%, #353230 0%, #1a1917 42%, #0e0d0c 100%)",
      }}
    >
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <ArtDefs />
        <MeshOrbs
          orbs={[
            { cx: "86%", cy: "14%", r: "48%", color: "#8a6b3d", opacity: 0.2 },
            { cx: "14%", cy: "88%", r: "32%", color: "#ffffff", opacity: 0.05 },
          ]}
        />
        {[52, 96, 144, 196, 252, 312].map((r, i) => (
          <circle
            key={r}
            cx="338"
            cy="62"
            r={r}
            fill="none"
            stroke="#f6f4f1"
            strokeOpacity={0.26 - i * 0.032}
            strokeWidth={i === 0 ? 1.75 : 1}
          />
        ))}
        <circle cx="338" cy="62" r="4.5" fill="#e8d4b8" />
        <circle cx="338" cy="62" r="18" fill="url(#eq-glow-gold)" fillOpacity="0.4" filter="url(#eq-bento-soft)" />
      </svg>
      <ArtVignette tone="dark" />
      <ArtGrain className="opacity-[0.2] mix-blend-overlay" />
    </div>
  );
}

function SourcedArt() {
  return (
    <div
      className={MOTION}
      style={{
        background:
          "radial-gradient(circle at 18% 92%, #3a5a4a 0%, transparent 48%), linear-gradient(168deg, #162420 0%, #24382e 100%)",
      }}
    >
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <ArtDefs />
        <MeshOrbs
          orbs={[
            { cx: "76%", cy: "18%", r: "42%", color: "#3d5c4a", opacity: 0.55 },
            { cx: "22%", cy: "72%", r: "34%", color: "#e8d4b8", opacity: 0.1 },
          ]}
        />
        {[
          [120, 108],
          [168, 132],
          [216, 108],
          [264, 132],
          [312, 108],
          [144, 180],
          [192, 204],
          [240, 180],
          [288, 204],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill="#f6f4f1" fillOpacity="0.55" />
        ))}
        <circle cx="216" cy="156" r="4" fill="#e8d4b8" />
        <circle cx="216" cy="156" r="20" fill="url(#eq-glow-gold)" fillOpacity="0.28" filter="url(#eq-bento-soft)" />
      </svg>
      <ArtSheen />
      <ArtVignette tone="dark" />
      <ArtGrain className="opacity-[0.16] mix-blend-overlay" />
    </div>
  );
}

function ChartsArt() {
  return (
    <div className={MOTION} style={{ background: "linear-gradient(148deg, #f8f5f0 0%, #e9e0d5 100%)" }}>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <ArtDefs />
        <MeshOrbs
          orbs={[
            { cx: "88%", cy: "16%", r: "42%", color: "#24382e", opacity: 0.12 },
            { cx: "8%", cy: "84%", r: "36%", color: "#c4a574", opacity: 0.16 },
          ]}
        />
        <path
          d="M16 248 C64 208 112 228 160 188 C208 148 256 168 304 128 C340 98 364 78 384 58"
          fill="none"
          stroke="url(#eq-chart-line)"
          strokeWidth="2.25"
          strokeLinecap="round"
        />
        <circle cx="384" cy="58" r="4.5" fill="#24382e" fillOpacity="0.5" />
        <circle cx="384" cy="58" r="20" fill="url(#eq-glow-light)" fillOpacity="0.4" filter="url(#eq-bento-soft)" />
      </svg>
      <ArtSheen />
      <ArtVignette />
      <ArtGrain />
    </div>
  );
}

function EvidenceArt() {
  return (
    <div className={MOTION} style={{ background: "linear-gradient(158deg, #faf7f2 0%, #e8e0d6 100%)" }}>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
        <ArtDefs />
        <MeshOrbs
          orbs={[
            { cx: "72%", cy: "22%", r: "40%", color: "#24382e", opacity: 0.1 },
            { cx: "28%", cy: "70%", r: "36%", color: "#dcc4a0", opacity: 0.18 },
          ]}
        />
        <circle cx="288" cy="96" r="34" fill="none" stroke="#24382e" strokeOpacity="0.12" strokeWidth="1.25" />
        <circle cx="288" cy="96" r="24" fill="none" stroke="#24382e" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="2 7" />
        <path
          d="M276 96 L284 104 L302 82"
          fill="none"
          stroke="#24382e"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.35"
        />
      </svg>
      <ArtSheen />
      <ArtVignette />
      <ArtGrain />
    </div>
  );
}

const ART: Record<BentoArtVariant, () => JSX.Element> = {
  salary: SalaryArt,
  compare: CompareArt,
  updates: UpdatesArt,
  sourced: SourcedArt,
  charts: ChartsArt,
  evidence: EvidenceArt,
};

export function BentoArt({ variant, className }: { variant: BentoArtVariant; className?: string }) {
  const Component = ART[variant];
  return (
    <div className={cn("absolute inset-0", className)} aria-hidden>
      <Component />
    </div>
  );
}
